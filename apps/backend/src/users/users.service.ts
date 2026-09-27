import { Injectable, Logger } from '@nestjs/common';
import { isValidUsername, normalizeUsername, type UserRole } from '@notstack/shared';
import bcrypt from 'bcryptjs';
import { AuthConfig } from '../auth/auth.config';
import { AUTH } from '../auth/auth.constants';
import type { DiscordProfile } from '../auth/interfaces/discord-profile.interface';
import type { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// hash ของรหัสสุ่มที่ไม่มีใครรู้ — ใช้ compare ตอนหา username ไม่เจอ ให้เวลาตอบกลับเท่ากับกรณีรหัสผิด
// (กันการเดาว่ามี username นี้อยู่ในระบบหรือไม่จากเวลาที่ใช้)
const DUMMY_HASH = '$2b$12$uEIq99m7fXJsMb7av/MB6eIiDrF1KhOZhToA.hJtllxofZrcdnzH.';
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$.{53}$/;
const CACHE_TTL_MS = 30 * 1000;

export type PasswordLoginResult =
    | { ok: true; user: User }
    | { ok: false; reason: 'invalid' | 'locked' | 'disabled'; user?: User; lockedUntil?: Date; justLocked?: boolean };

// ==========================================
// 👤 USERS — บัญชีผู้ใช้ Dashboard (username/password และ Discord OAuth)
// ทุกการแก้ไขข้อมูลผู้ใช้ต้องผ่าน service นี้ เพื่อล้าง cache ที่ใช้ตรวจสิทธิ์ทุก request (JwtStrategy)
// ==========================================
@Injectable()
export class UsersService {
    private readonly logger = new Logger('Auth');
    private readonly cache = new Map<number, { user: User; at: number }>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly cfg: AuthConfig,
    ) {}

    hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, AUTH.BCRYPT_ROUNDS);
    }

    comparePassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }

    // ทุก request ต้องเช็ค role / isActive / tokenVersion ล่าสุด — cache สั้นๆ ไม่ต้อง query ทุกครั้ง
    async getCached(id: number): Promise<User | null> {
        const hit = this.cache.get(id);
        if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.user;
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (user) this.cache.set(id, { user, at: Date.now() });
        else this.cache.delete(id);
        return user;
    }

    async update(id: number, data: Prisma.UserUpdateInput): Promise<User> {
        const user = await this.prisma.user.update({ where: { id }, data });
        this.cache.delete(id);
        return user;
    }

    async delete(id: number): Promise<User> {
        const user = await this.prisma.user.delete({ where: { id } });
        this.cache.delete(id);
        return user;
    }

    // ทำให้ access token ทุกใบของผู้ใช้นี้ใช้ไม่ได้ทันที
    bumpTokenVersion(id: number): Promise<User> {
        return this.update(id, { tokenVersion: { increment: 1 } });
    }

    findById(id: number): Promise<User | null> {
        return this.prisma.user.findUnique({ where: { id } });
    }

    findByDiscordId(discordId: string): Promise<User | null> {
        return this.prisma.user.findUnique({ where: { discordId } });
    }

    async verifyPasswordLogin(rawUsername: string, password: string): Promise<PasswordLoginResult> {
        const username = normalizeUsername(rawUsername);
        const user = isValidUsername(username) ? await this.prisma.user.findUnique({ where: { username } }) : null;

        if (!user || !user.passwordHash) {
            await bcrypt.compare(password, DUMMY_HASH);
            return { ok: false, reason: 'invalid' };
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            return { ok: false, reason: 'locked', user, lockedUntil: user.lockedUntil };
        }

        if (!(await bcrypt.compare(password, user.passwordHash))) {
            const updated = await this.update(user.id, { failedLogins: { increment: 1 } });
            if (updated.failedLogins >= AUTH.MAX_FAILED_LOGINS) {
                const lockedUntil = new Date(Date.now() + AUTH.LOCK_DURATION_MS);
                await this.update(user.id, { failedLogins: 0, lockedUntil });
                return { ok: false, reason: 'locked', user, lockedUntil, justLocked: true };
            }
            return { ok: false, reason: 'invalid', user };
        }

        // บอกว่าบัญชีถูกปิดเฉพาะคนที่ใส่รหัสถูกเท่านั้น
        if (!user.isActive) return { ok: false, reason: 'disabled', user };

        return { ok: true, user: await this.recordLogin(user.id) };
    }

    recordLogin(id: number): Promise<User> {
        return this.update(id, { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() });
    }

    async createPasswordUser(input: { username: string; password: string; role: UserRole; displayName: string | null }): Promise<User> {
        return this.prisma.user.create({
            data: {
                username: normalizeUsername(input.username),
                passwordHash: await this.hashPassword(input.password),
                role: input.role,
                displayName: input.displayName || null,
            },
        });
    }

    // --- Discord ---
    async createDiscordUser(profile: DiscordProfile): Promise<User> {
        try {
            return await this.prisma.user.create({
                data: {
                    discordId: profile.id,
                    discordUsername: profile.username,
                    avatarUrl: profile.avatarUrl,
                    displayName: profile.globalName || profile.username,
                    role: this.cfg.discord.adminIds.has(profile.id) ? 'ADMIN' : 'USER',
                },
            });
        } catch (err) {
            // login พร้อมกัน 2 แท็บ → อีกแท็บสร้างไปก่อนแล้ว
            if ((err as { code?: string }).code === 'P2002') {
                const existing = await this.findByDiscordId(profile.id);
                if (existing) return existing;
            }
            throw err;
        }
    }

    syncDiscordProfile(id: number, profile: DiscordProfile): Promise<User> {
        return this.update(id, { discordUsername: profile.username, avatarUrl: profile.avatarUrl });
    }

    linkDiscord(id: number, profile: DiscordProfile): Promise<User> {
        return this.update(id, { discordId: profile.id, discordUsername: profile.username, avatarUrl: profile.avatarUrl });
    }

    unlinkDiscord(id: number): Promise<User> {
        return this.update(id, { discordId: null, discordUsername: null, avatarUrl: null });
    }

    // ==========================================
    // Bootstrap: ถ้ายังไม่มี ADMIN ในระบบเลย ให้สร้างจาก ADMIN_USERNAME / ADMIN_PASSWORD ใน .env
    // (ADMIN_PASSWORD เป็น bcrypt hash แบบเดิมได้เลย) — ทำแค่ครั้งแรก หลังจากนั้นจัดการผู้ใช้ผ่านหน้า Users
    // ==========================================
    async seedAdminFromEnv(): Promise<void> {
        const adminCount = await this.prisma.user.count({ where: { role: 'ADMIN' } });
        if (adminCount > 0) return;

        const username = normalizeUsername(this.cfg.adminSeed.username);
        const secret = this.cfg.adminSeed.password;
        if (!username || !secret) {
            this.logger.warn('⚠️ ยังไม่มีผู้ดูแลระบบ — ตั้ง ADMIN_USERNAME / ADMIN_PASSWORD ใน .env หรือ ADMIN_DISCORD_IDS แล้วรีสตาร์ท');
            return;
        }
        if (!isValidUsername(username)) {
            this.logger.warn('⚠️ ADMIN_USERNAME ต้องเป็น a-z 0-9 _ . - ยาว 3-32 ตัว — ข้ามการสร้างผู้ดูแลระบบ');
            return;
        }
        if (await this.prisma.user.findUnique({ where: { username } })) {
            this.logger.warn(`⚠️ มีผู้ใช้ชื่อ ${username} อยู่แล้วแต่ไม่ใช่ ADMIN — ข้ามการสร้างผู้ดูแลระบบ`);
            return;
        }

        let passwordHash = secret;
        if (!BCRYPT_HASH_RE.test(secret)) {
            this.logger.warn('⚠️ ADMIN_PASSWORD ไม่ใช่ bcrypt hash — ระบบ hash ให้แล้ว แนะนำให้ลบรหัสผ่านตัวจริงออกจาก .env');
            passwordHash = await this.hashPassword(secret);
        }
        await this.prisma.user.create({ data: { username, passwordHash, role: 'ADMIN', displayName: username } });
        this.logger.log(`✅ สร้างผู้ดูแลระบบ "${username}" จาก .env แล้ว`);
    }
}
