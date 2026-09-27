import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import {
    isValidUsername,
    normalizeUsername,
    ROLES,
    USERNAME_MESSAGE,
    validatePassword,
    type AdminUser,
    type PublicUser,
    type RevokeSessionsResponse,
    type SuccessResponse,
    type UpdateUserInput,
    type UserRole,
} from '@notstack/shared';
import { AuditService } from '../audit/audit.service';
import { TokensService } from '../auth/tokens.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { badRequest, conflict, isUniqueViolation, notFound } from '../common/exceptions/api.exception';
import type { AppRequest } from '../common/interfaces/app-request.interface';
import { parseId } from '../common/utils/parse.util';
import type { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { nameOf, publicUser } from './user.mapper';
import { UsersService } from './users.service';

// ==========================================
// 👑 USERS API — /api/admin/users (ADMIN เท่านั้น)
// กฎกันล็อกตัวเองออกจากระบบ: แอดมินลดสิทธิ์ / ปิดบัญชี / ลบบัญชี "ของตัวเอง" ไม่ได้
// (ผู้ที่เรียก API นี้เป็นแอดมินที่ active อยู่เสมอ → ระบบจะมีแอดมินเหลืออย่างน้อย 1 คนตลอด)
// ใช้แค่ GET/POST — ชั้นหน้าเว็บจริง (Cloudflare) ตอบ 403 กับ PATCH / DELETE
// ==========================================
@AdminOnly()
@Controller('admin/users')
export class UsersController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly users: UsersService,
        private readonly tokens: TokensService,
        private readonly auditService: AuditService,
    ) {}

    private async loadTarget(idParam: string): Promise<User> {
        const id = parseId(idParam);
        const user = id ? await this.users.findById(id) : null;
        if (!user) throw notFound('ไม่พบผู้ใช้นี้');
        return user;
    }

    @Get()
    async list(@CurrentUser() me: User): Promise<AdminUser[]> {
        const rows = await this.prisma.user.findMany({
            orderBy: { id: 'asc' },
            include: {
                _count: { select: { refreshTokens: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
            },
        });
        return rows.map((row) => ({
            ...publicUser(row),
            failedLogins: row.failedLogins,
            activeSessions: row._count.refreshTokens,
            isSelf: row.id === me.id,
        }));
    }

    @Post()
    async create(@Body() body: CreateUserDto, @Req() req: AppRequest): Promise<PublicUser> {
        try {
            const user = await this.users.createPasswordUser(body);
            await this.auditService.audit(req, {
                action: 'user.create',
                targetType: 'user',
                targetId: user.id,
                metadata: { username: user.username, role: body.role },
            });
            return publicUser(user);
        } catch (err) {
            if (isUniqueViolation(err)) throw conflict('username นี้ถูกใช้แล้ว');
            throw err;
        }
    }

    // แก้ไขได้ทีละหลายฟิลด์: role, isActive, displayName, username, password, unlock
    @Post(':id/update')
    @HttpCode(HttpStatus.OK)
    async update(
        @Param('id') idParam: string,
        @Body() body: UpdateUserDto,
        @CurrentUser() me: User,
        @Req() req: AppRequest,
    ): Promise<PublicUser> {
        const target = await this.loadTarget(idParam);
        const input = body as UpdateUserInput;
        const isSelf = target.id === me.id;
        const data: Prisma.UserUpdateInput = {};
        const changes: Record<string, unknown> = {};
        let revokeSessions = false;

        if (input.role !== undefined && input.role !== target.role) {
            if (!ROLES.includes(input.role as UserRole)) throw badRequest('role ไม่ถูกต้อง');
            if (isSelf) throw badRequest('ไม่สามารถเปลี่ยน role ของตัวเองได้');
            data.role = input.role;
            changes.role = { from: target.role, to: input.role };
        }

        if (input.isActive !== undefined && Boolean(input.isActive) !== target.isActive) {
            if (isSelf) throw badRequest('ไม่สามารถปิดบัญชีของตัวเองได้');
            data.isActive = Boolean(input.isActive);
            changes.isActive = { from: target.isActive, to: data.isActive };
            if (!data.isActive) revokeSessions = true;
        }

        if (typeof input.displayName === 'string') {
            const displayName = input.displayName.trim().slice(0, 64) || null;
            if (displayName !== target.displayName) {
                data.displayName = displayName;
                changes.displayName = { from: target.displayName, to: displayName };
            }
        }

        if (input.username !== undefined) {
            const username = normalizeUsername(input.username);
            if (!isValidUsername(username)) throw badRequest(USERNAME_MESSAGE);
            if (username !== target.username) {
                data.username = username;
                changes.username = { from: target.username, to: username };
            }
        }

        if (input.password !== undefined) {
            const invalid = validatePassword(input.password);
            if (invalid) throw badRequest(invalid);
            // บัญชีที่มาจาก Discord ต้องมี username ด้วย ถึงจะ login ด้วยรหัสผ่านได้
            if (!target.username && !data.username) {
                throw badRequest('บัญชีนี้ยังไม่มี username — กรุณากำหนด username พร้อมรหัสผ่าน');
            }
            data.passwordHash = await this.users.hashPassword(input.password);
            data.failedLogins = 0;
            data.lockedUntil = null;
            changes.passwordReset = true;
            revokeSessions = true;
        }

        if (input.unlock === true && target.lockedUntil) {
            data.failedLogins = 0;
            data.lockedUntil = null;
            changes.unlocked = true;
        }

        if (Object.keys(changes).length === 0) return publicUser(target);

        if (revokeSessions) data.tokenVersion = { increment: 1 };
        let updated: User;
        try {
            updated = await this.users.update(target.id, data);
        } catch (err) {
            if (isUniqueViolation(err)) throw conflict('username นี้ถูกใช้แล้ว');
            throw err;
        }
        if (revokeSessions) await this.tokens.revokeAllForUser(target.id);

        await this.auditService.audit(req, {
            action: 'user.update',
            targetType: 'user',
            targetId: target.id,
            metadata: { target: nameOf(target), changes },
        });
        return publicUser(updated);
    }

    // บังคับออกจากระบบทุกอุปกรณ์ของผู้ใช้คนนี้
    @Post(':id/revoke-sessions')
    @HttpCode(HttpStatus.OK)
    async revokeSessions(@Param('id') idParam: string, @Req() req: AppRequest): Promise<RevokeSessionsResponse> {
        const target = await this.loadTarget(idParam);
        await this.users.bumpTokenVersion(target.id);
        const { count } = await this.tokens.revokeAllForUser(target.id);
        await this.auditService.audit(req, {
            action: 'user.sessions_revoke',
            targetType: 'user',
            targetId: target.id,
            metadata: { target: nameOf(target), revoked: count },
        });
        return { success: true, revoked: count };
    }

    @Post(':id/delete')
    @HttpCode(HttpStatus.OK)
    async remove(@Param('id') idParam: string, @CurrentUser() me: User, @Req() req: AppRequest): Promise<SuccessResponse> {
        const target = await this.loadTarget(idParam);
        if (target.id === me.id) throw badRequest('ไม่สามารถลบบัญชีของตัวเองได้');

        await this.users.delete(target.id);
        await this.auditService.audit(req, {
            action: 'user.delete',
            targetType: 'user',
            targetId: target.id,
            metadata: { username: target.username, discordId: target.discordId, discordUsername: target.discordUsername, role: target.role },
        });
        return { success: true };
    }
}

