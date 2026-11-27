import { Injectable, Logger } from '@nestjs/common';
import {
    TICKET_LIMITS,
    defaultTicketConfig,
    formatTicketNumber,
    normalizeStaffRoleIds,
    type PublishTicketPanelResponse,
    type TicketConfigDto,
    type TicketDetailDto,
    type TicketItemDto,
    type TicketListQuery,
    type TicketListResponse,
    type TicketStatus,
    type UpdateTicketConfigData,
} from '@notstack/shared';
import { ChannelType, PermissionFlagsBits, type GuildBasedChannel, type Message, type SendableChannels } from 'discord.js';
import { badRequest, notFound } from '../common/exceptions/api.exception';
import { DiscordService } from '../discord/discord.service';
import type { Prisma, Ticket, TicketConfig } from '../generated/prisma/client';
import { toJsonValue } from '../prisma/json.util';
import { PrismaService } from '../prisma/prisma.service';
import {
    ticketClosedDmMessage,
    ticketClosedLogMessage,
    ticketPanelMessage,
    type TicketTranscriptSummary,
    type TranscriptAttachmentFile,
} from './utils/tickets.messages';
import {
    buildTranscriptHtml,
    buildTranscriptMarkdown,
    fetchAllChannelMessages,
    renderTranscriptHtmlFromMarkdown,
    type TranscriptMessageLike,
} from './utils/ticket-transcript';

const PERMISSION_LABELS: [bigint, string][] = [
    [PermissionFlagsBits.ManageChannels, 'จัดการห้อง (Manage Channels)'],
    [PermissionFlagsBits.ManageRoles, 'จัดการยศ (Manage Roles)'],
    [PermissionFlagsBits.ViewChannel, 'ดูห้อง'],
    [PermissionFlagsBits.SendMessages, 'ส่งข้อความ'],
    [PermissionFlagsBits.EmbedLinks, 'ฝังลิงก์ (Embed Links)'],
    [PermissionFlagsBits.AttachFiles, 'แนบไฟล์ (Attach Files)'],
    [PermissionFlagsBits.ReadMessageHistory, 'อ่านประวัติข้อความ'],
];

@Injectable()
export class TicketsService {
    private readonly logger = new Logger('Tickets');

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    private toConfigDto(guildId: string, row: TicketConfig | null, warning: string | null = null): TicketConfigDto {
        if (!row) {
            return { ...defaultTicketConfig(guildId), warning };
        }
        return {
            guildId: row.guildId,
            categoryId: row.categoryId,
            logChannelId: row.logChannelId,
            panelChannelId: row.panelChannelId,
            panelMessageId: row.panelMessageId,
            staffRoleIds: normalizeStaffRoleIds(row.staffRoleIds),
            panelTitle: row.panelTitle,
            panelDescription: row.panelDescription,
            panelColor: row.panelColor,
            dmTranscript: row.dmTranscript,
            maxOpenPerUser: row.maxOpenPerUser,
            updatedAt: row.updatedAt.toISOString(),
            warning,
        };
    }

    async getConfig(guildId: string): Promise<TicketConfigDto> {
        const row = await this.prisma.ticketConfig.findUnique({ where: { guildId } });
        const dto = this.toConfigDto(guildId, row);
        dto.warning = await this.permissionWarning(guildId, dto);
        return dto;
    }

    async permissionWarning(guildId: string, config: TicketConfigDto): Promise<string | null> {
        const guild = this.discord.guild(guildId);
        const me = guild?.members.me;
        if (!guild || !me) return null;

        const problems: string[] = [];
        const scope = config.categoryId ? guild.channels.cache.get(config.categoryId) : null;
        const perms = scope ? me.permissionsIn(scope) : me.permissions;
        const missing = PERMISSION_LABELS.filter(([flag]) => !perms.has(flag)).map(([, label]) => label);
        if (missing.length > 0) {
            problems.push(`บอทขาดสิทธิ์${scope ? `ในหมวดหมู่ ${scope.name}` : ''}: ${missing.join(', ')}`);
        }

        if (config.panelChannelId) {
            const panelCh = guild.channels.cache.get(config.panelChannelId);
            if (
                panelCh &&
                !me.permissionsIn(panelCh).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])
            ) {
                problems.push(`บอทส่งแผงเข้า #${panelCh.name} ไม่ได้`);
            }
        }

        if (config.logChannelId) {
            const logCh = guild.channels.cache.get(config.logChannelId);
            if (
                logCh &&
                !me
                    .permissionsIn(logCh)
                    .has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles])
            ) {
                problems.push(`บอทส่งไฟล์ Transcript เข้า #${logCh.name} ไม่ได้`);
            }
        }

        return problems.length > 0 ? problems.join(' · ') : null;
    }

    private async assertChannel(guildId: string, channelId: string, label: string, kind: 'text' | 'category'): Promise<void> {
        if (!this.discord.ready) return;
        const channel = await this.discord.fetchGuildChannel(guildId, channelId);
        if (!channel) throw badRequest(`ไม่พบ${label}ในเซิร์ฟเวอร์นี้`);
        if (kind === 'category' && channel.type !== ChannelType.GuildCategory) throw badRequest(`${label}ต้องเป็นหมวดหมู่ (Category)`);
        if (kind === 'text' && !channel.isSendable()) throw badRequest(`${label}ต้องเป็นห้องข้อความ`);
    }

    async updateConfig(guildId: string, patch: UpdateTicketConfigData): Promise<{ config: TicketConfigDto; warning: string | null }> {
        const current = await this.getConfig(guildId);

        if (patch.categoryId) await this.assertChannel(guildId, patch.categoryId, 'หมวดหมู่ของ Ticket', 'category');
        if (patch.panelChannelId) await this.assertChannel(guildId, patch.panelChannelId, 'ห้องแผงเปิด Ticket', 'text');
        if (patch.logChannelId) await this.assertChannel(guildId, patch.logChannelId, 'ห้อง Log Transcript', 'text');

        const nextPanelChannelId = patch.panelChannelId !== undefined ? patch.panelChannelId : current.panelChannelId;
        const panelChannelChanged = patch.panelChannelId !== undefined && patch.panelChannelId !== current.panelChannelId;

        const data = {
            categoryId: patch.categoryId !== undefined ? patch.categoryId : current.categoryId,
            logChannelId: patch.logChannelId !== undefined ? patch.logChannelId : current.logChannelId,
            panelChannelId: nextPanelChannelId,
            panelMessageId: panelChannelChanged ? null : current.panelMessageId,
            staffRoleIds: toJsonValue(patch.staffRoleIds !== undefined ? patch.staffRoleIds : current.staffRoleIds),
            panelTitle: patch.panelTitle !== undefined ? patch.panelTitle : current.panelTitle,
            panelDescription: patch.panelDescription !== undefined ? patch.panelDescription : current.panelDescription,
            panelColor: patch.panelColor !== undefined ? patch.panelColor : current.panelColor,
            dmTranscript: patch.dmTranscript !== undefined ? patch.dmTranscript : current.dmTranscript,
            maxOpenPerUser: patch.maxOpenPerUser !== undefined ? patch.maxOpenPerUser : current.maxOpenPerUser,
        };

        const row = await this.prisma.ticketConfig.upsert({
            where: { guildId },
            create: { guildId, ...data },
            update: data,
        });

        const config = this.toConfigDto(guildId, row);
        const warning = await this.permissionWarning(guildId, config);
        config.warning = warning;
        return { config, warning };
    }

    async publishPanel(guildId: string): Promise<PublishTicketPanelResponse> {
        this.discord.requireReady();
        const config = await this.getConfig(guildId);
        if (!config.panelChannelId) {
            throw badRequest('กรุณาเลือกห้องสำหรับส่งแผงเปิด Ticket และกดบันทึกก่อน');
        }

        const channel = await this.discord.fetchGuildChannel(guildId, config.panelChannelId);
        if (!channel || !channel.isSendable()) {
            throw badRequest('ไม่พบห้องแผง หรือบอทไม่สามารถส่งข้อความในห้องนี้ได้');
        }

        const payload = ticketPanelMessage(config);
        const channelName = 'name' in channel ? String(channel.name) : config.panelChannelId;

        let existingMessage: Message | null = null;
        if (config.panelMessageId && 'messages' in channel) {
            existingMessage = await channel.messages.fetch(config.panelMessageId).catch(() => null);
        }

        try {
            if (existingMessage?.editable) {
                await existingMessage.edit(payload);
                return {
                    success: true,
                    channelName,
                    edited: true,
                    messageId: existingMessage.id,
                    message: `อัปเดตแผง Ticket ใน #${channelName} แล้ว`,
                    config,
                };
            }

            const sent = await (channel as SendableChannels).send(payload);
            const updatedRow = await this.prisma.ticketConfig.upsert({
                where: { guildId },
                create: {
                    guildId,
                    categoryId: config.categoryId,
                    logChannelId: config.logChannelId,
                    panelChannelId: config.panelChannelId,
                    panelMessageId: sent.id,
                    staffRoleIds: toJsonValue(config.staffRoleIds),
                    panelTitle: config.panelTitle,
                    panelDescription: config.panelDescription,
                    panelColor: config.panelColor,
                    dmTranscript: config.dmTranscript,
                    maxOpenPerUser: config.maxOpenPerUser,
                },
                update: { panelMessageId: sent.id },
            });
            const nextConfig = this.toConfigDto(guildId, updatedRow, config.warning);
            return {
                success: true,
                channelName,
                edited: false,
                messageId: sent.id,
                message: `ส่งแผง Ticket เข้า #${channelName} แล้ว`,
                config: nextConfig,
            };
        } catch (err) {
            this.logger.warn(`ส่งแผง Ticket (${guildId}) ไม่สำเร็จ: ${(err as Error).message}`);
            throw badRequest(`ส่งข้อความเข้า #${channelName} ไม่ได้ — กรุณาตรวจสิทธิ์ ส่งข้อความ และ ฝังลิงก์ ของบอทในห้องนี้`);
        }
    }

    async reconcileOpenTickets(guildId: string, openerId: string): Promise<{ ticket: Ticket; channel: GuildBasedChannel }[]> {
        const openTickets = await this.prisma.ticket.findMany({
            where: { guildId, openerId, status: 'OPEN' },
            orderBy: { id: 'asc' },
        });
        const active: { ticket: Ticket; channel: GuildBasedChannel }[] = [];
        for (const ticket of openTickets) {
            const channel = ticket.channelId ? await this.discord.fetchGuildChannel(guildId, ticket.channelId) : null;
            if (channel && 'guild' in channel) {
                active.push({ ticket, channel });
            } else if (Date.now() - ticket.createdAt.getTime() > 60_000 || ticket.channelId) {
                await this.prisma.ticket.updateMany({
                    where: { id: ticket.id, status: 'OPEN' },
                    data: { status: 'CLOSED', closedAt: new Date() },
                });
            }
        }
        return active;
    }

    async createTicket(guildId: string, openerId: string, subject: string | null = null): Promise<Ticket> {
        for (let attempt = 0; attempt < 3; attempt++) {
            const last = await this.prisma.ticket.findFirst({
                where: { guildId },
                orderBy: { ticketNumber: 'desc' },
                select: { ticketNumber: true },
            });
            const ticketNumber = (last?.ticketNumber ?? 0) + 1;
            try {
                return await this.prisma.ticket.create({
                    data: { guildId, ticketNumber, openerId, status: 'OPEN', subject },
                });
            } catch (err) {
                if ((err as { code?: string })?.code === 'P2002' && attempt < 2) continue;
                throw err;
            }
        }
        throw badRequest('สร้างหมายเลข Ticket ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }

    findTicket(guildId: string, ticketId: number): Promise<Ticket | null> {
        return this.prisma.ticket.findFirst({ where: { id: ticketId, guildId } });
    }

    async markChannelDeleted(channelId: string): Promise<void> {
        await this.prisma.ticket.updateMany({
            where: { channelId, status: 'OPEN' },
            data: { status: 'CLOSED', closedAt: new Date() },
        });
    }

    private resolveUserNameSync(guildId: string, userId: string | null): string | null {
        if (!userId) return null;
        if (!this.discord.ready) return null;
        const guild = this.discord.guild(guildId);
        const member = guild?.members.cache.get(userId);
        if (member) return member.displayName;
        const user = this.discord.client.users.cache.get(userId);
        if (user) return user.globalName || user.username;
        return null;
    }

    private async resolveUserNameAsync(guildId: string, userId: string | null): Promise<string | null> {
        if (!userId) return null;
        const cached = this.resolveUserNameSync(guildId, userId);
        if (cached) return cached;
        return (await this.discord.displayName(userId)) ?? null;
    }

    private toItemDto(guildId: string, row: Ticket): TicketItemDto {
        return {
            id: row.id,
            guildId: row.guildId,
            ticketNumber: row.ticketNumber,
            channelId: row.channelId,
            openerId: row.openerId,
            openerName: this.resolveUserNameSync(guildId, row.openerId),
            claimedById: row.claimedById,
            claimedByName: this.resolveUserNameSync(guildId, row.claimedById),
            status: (row.status === 'CLOSED' ? 'CLOSED' : 'OPEN') as TicketStatus,
            subject: row.subject,
            hasTranscript: Boolean(row.transcriptMarkdown),
            closedById: row.closedById,
            closedByName: this.resolveUserNameSync(guildId, row.closedById),
            createdAt: row.createdAt.toISOString(),
            closedAt: row.closedAt?.toISOString() ?? null,
        };
    }

    async listTickets(guildId: string, query: TicketListQuery): Promise<TicketListResponse> {
        const page = Math.max(1, Number(query.page) || 1);
        const status = query.status ?? 'ALL';
        const q = typeof query.q === 'string' ? query.q.trim() : undefined;
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || TICKET_LIMITS.pageSize));

        const where: Prisma.TicketWhereInput = { guildId };
        if (status !== 'ALL') {
            where.status = status;
        }
        if (q) {
            const or: Prisma.TicketWhereInput[] = [
                { openerId: { contains: q, mode: 'insensitive' } },
                { claimedById: { contains: q, mode: 'insensitive' } },
                { subject: { contains: q, mode: 'insensitive' } },
            ];
            const withoutHash = q.startsWith('#') ? q.slice(1) : q;
            let startIdx = 0;
            while (startIdx < withoutHash.length && withoutHash.charCodeAt(startIdx) === 48) {
                startIdx += 1;
            }
            const cleanDigits = withoutHash.slice(startIdx);
            if (/^\d{1,10}$/.test(cleanDigits)) {
                const parsedNum = Number(cleanDigits);
                if (Number.isSafeInteger(parsedNum) && parsedNum > 0 && parsedNum <= 2_147_483_647) {
                    or.push({ ticketNumber: parsedNum });
                }
            }
            where.OR = or;
        }

        const [items, total, openCount, closedCount] = await Promise.all([
            this.prisma.ticket.findMany({
                where,
                orderBy: { id: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.ticket.count({ where }),
            this.prisma.ticket.count({ where: { guildId, status: 'OPEN' } }),
            this.prisma.ticket.count({ where: { guildId, status: 'CLOSED' } }),
        ]);

        const userIds = items.flatMap((row) => [row.openerId, row.claimedById, row.closedById].filter((id): id is string => Boolean(id)));
        await this.discord.cacheMembers(guildId, userIds).catch(() => {});

        return {
            items: items.map((row) => this.toItemDto(guildId, row)),
            total,
            openCount,
            closedCount,
            page,
            pageSize,
        };
    }

    async getTicketDetail(guildId: string, ticketId: number): Promise<TicketDetailDto> {
        const row = await this.findTicket(guildId, ticketId);
        if (!row) throw notFound('ไม่พบ Ticket นี้');
        const userIds = [row.openerId, row.claimedById, row.closedById].filter((id): id is string => Boolean(id));
        await this.discord.cacheMembers(guildId, userIds).catch(() => {});
        return {
            ...this.toItemDto(guildId, row),
            transcriptMarkdown: row.transcriptMarkdown,
        };
    }

    async getTranscriptFile(guildId: string, ticketId: number, format: 'md' | 'html'): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
        const row = await this.findTicket(guildId, ticketId);
        if (!row) throw notFound('ไม่พบ Ticket นี้');
        if (!row.transcriptMarkdown) throw notFound('ยังไม่มีบันทึก Transcript สำหรับ Ticket นี้');

        const num = formatTicketNumber(row.ticketNumber);
        if (format === 'md') {
            return {
                buffer: Buffer.from(row.transcriptMarkdown, 'utf8'),
                filename: `ticket-${num}.md`,
                contentType: 'text/markdown; charset=utf-8',
            };
        }

        const [openerName, claimedByName, closedByName] = await Promise.all([
            this.resolveUserNameAsync(guildId, row.openerId),
            this.resolveUserNameAsync(guildId, row.claimedById),
            this.resolveUserNameAsync(guildId, row.closedById),
        ]);
        const guildName = this.discord.guild(guildId)?.name ?? guildId;
        const html = renderTranscriptHtmlFromMarkdown(
            {
                guildName,
                ticketNumber: row.ticketNumber,
                openerId: row.openerId,
                openerName: openerName ?? row.openerId,
                claimedById: row.claimedById,
                claimedByName,
                closedById: row.closedById ?? 'system',
                closedByName: closedByName ?? row.closedById ?? 'System',
                subject: row.subject,
                createdAt: row.createdAt,
                closedAt: row.closedAt ?? new Date(),
            },
            row.transcriptMarkdown,
        );
        return {
            buffer: Buffer.from(html, 'utf8'),
            filename: `ticket-${num}.html`,
            contentType: 'text/html; charset=utf-8',
        };
    }

    async closeTicket(guildId: string, ticketId: number, closedById: string, reason: string): Promise<TicketItemDto> {
        const ticket = await this.findTicket(guildId, ticketId);
        if (!ticket) throw notFound('ไม่พบ Ticket นี้');
        if (ticket.status === 'CLOSED') {
            return this.toItemDto(guildId, ticket);
        }

        const config = await this.getConfig(guildId);
        const channel = ticket.channelId ? await this.discord.fetchGuildChannel(guildId, ticket.channelId) : null;

        let messages: TranscriptMessageLike[] = [];
        if (channel && 'messages' in channel) {
            try {
                messages = await fetchAllChannelMessages(channel);
            } catch (err) {
                this.logger.warn(`ดึงประวัติข้อความ Ticket #${ticket.ticketNumber} (${guildId}) ไม่สำเร็จ: ${(err as Error).message}`);
            }
        }

        const closedAt = new Date();
        const guildName = this.discord.guild(guildId)?.name ?? guildId;
        const [openerName, claimedByName, closedByName] = await Promise.all([
            this.resolveUserNameAsync(guildId, ticket.openerId),
            this.resolveUserNameAsync(guildId, ticket.claimedById),
            this.resolveUserNameAsync(guildId, closedById),
        ]);

        const meta = {
            guildName,
            ticketNumber: ticket.ticketNumber,
            openerId: ticket.openerId,
            openerName: openerName ?? ticket.openerId,
            claimedById: ticket.claimedById,
            claimedByName,
            closedById,
            closedByName: closedByName ?? closedById,
            subject: ticket.subject,
            createdAt: ticket.createdAt,
            closedAt,
        };

        const transcriptMarkdown = buildTranscriptMarkdown(meta, messages);
        const transcriptHtml = buildTranscriptHtml(meta, messages);

        const updated = await this.prisma.ticket.update({
            where: { id: ticket.id },
            data: {
                status: 'CLOSED',
                transcriptMarkdown,
                closedById,
                closedAt,
            },
        });

        const num = formatTicketNumber(ticket.ticketNumber);
        const files: TranscriptAttachmentFile[] = [
            { name: `ticket-${num}.md`, data: Buffer.from(transcriptMarkdown, 'utf8') },
            { name: `ticket-${num}.html`, data: Buffer.from(transcriptHtml, 'utf8') },
        ];
        const summary: TicketTranscriptSummary = {
            ticketNumber: ticket.ticketNumber,
            openerId: ticket.openerId,
            claimedById: ticket.claimedById,
            closedById,
            subject: ticket.subject,
            createdAt: ticket.createdAt,
            closedAt,
            messageCount: messages.length,
        };

        if (config.logChannelId) {
            const logChannel = await this.discord.fetchGuildChannel(guildId, config.logChannelId);
            if (logChannel && logChannel.isSendable()) {
                await (logChannel as SendableChannels)
                    .send(ticketClosedLogMessage(summary, files))
                    .catch((err: Error) => this.logger.warn(`ส่ง Transcript เข้าห้อง log (${guildId}) ไม่สำเร็จ: ${err.message}`));
            }
        }

        if (config.dmTranscript) {
            const opener = await this.discord.fetchUser(ticket.openerId);
            if (opener) {
                await opener
                    .send(ticketClosedDmMessage(guildName, summary, files))
                    .catch((err: Error) => this.logger.debug(`ส่ง DM Transcript ให้ ${ticket.openerId} ไม่สำเร็จ: ${err.message}`));
            }
        }

        if (channel && 'delete' in channel) {
            try {
                await channel.delete(reason);
            } catch (err) {
                if ((err as { code?: number }).code !== 10003) {
                    this.logger.warn(`ลบห้อง Ticket #${num} (${guildId}) ไม่สำเร็จ: ${(err as Error).message}`);
                }
            }
        }

        return this.toItemDto(guildId, updated);
    }
}
