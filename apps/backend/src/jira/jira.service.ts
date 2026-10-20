import { HttpStatus, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    defaultJiraOptions,
    JIRA_PROJECT_KEY_RE,
    JIRA_SITE_RE,
    normalizeJiraOptions,
    normalizeJiraSiteUrl,
    type JiraConnectionResult,
    type JiraOptions,
    type JiraSettings,
    type JiraTicket as JiraTicketView,
    type JiraTicketPage,
    type JiraTicketStatus,
} from '@notstack/shared';
import { ChannelType, PermissionFlagsBits, type GuildBasedChannel, type Message, type SendableChannels } from 'discord.js';
import { ApiException, badRequest, notFound } from '../common/exceptions/api.exception';
import type { Env } from '../config/env.validation';
import { DiscordService } from '../discord/discord.service';
import type { JiraTicket, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JiraApiError, JiraClient, type JiraCredentials } from './clients/jira.client';
import { panelMessage } from './utils/jira.messages';
import { TokenCipher } from './utils/token-cipher';
import { toJsonValue } from '../prisma/json.util';

const PAGE_SIZE = 20;

export interface StoredJiraSettings {
    enabled: boolean;
    siteUrl: string;
    email: string;
    apiToken: string;
    projectKey: string;
    panelChannelId: string;
    panelMessageId: string;
    logChannelId: string;
    categoryId: string;
    options: JiraOptions;
    updatedAt: Date | null;
}

export interface JiraSettingsPatch {
    enabled?: boolean;
    siteUrl?: string;
    email?: string;
    apiToken?: string;
    projectKey?: string;
    panelChannelId?: string;
    logChannelId?: string;
    categoryId?: string;
    options?: JiraOptions;
}

export const ticketStatus = (ticket: Pick<JiraTicket, 'closedAt' | 'issueKey'>): JiraTicketStatus =>
    ticket.closedAt ? 'closed' : ticket.issueKey ? 'created' : 'open';

const toView = (ticket: JiraTicket): JiraTicketView => ({
    id: ticket.id,
    userId: ticket.userId,
    userName: ticket.userName,
    channelId: ticket.channelId,
    status: ticketStatus(ticket),
    issueKey: ticket.issueKey,
    issueUrl: ticket.issueUrl,
    issueType: ticket.issueType,
    title: ticket.title,
    createdAt: ticket.createdAt.toISOString(),
    cardCreatedAt: ticket.cardCreatedAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
});

const PERMISSION_LABELS: [bigint, string][] = [
    [PermissionFlagsBits.ManageChannels, 'จัดการห้อง (Manage Channels)'],
    [PermissionFlagsBits.ManageRoles, 'จัดการยศ (Manage Roles)'],
    [PermissionFlagsBits.ViewChannel, 'ดูห้อง'],
    [PermissionFlagsBits.SendMessages, 'ส่งข้อความ'],
    [PermissionFlagsBits.EmbedLinks, 'ฝังลิงก์ (Embed Links)'],
];

// ==========================================
// 🎫 JIRA — การตั้งค่าของเซิร์ฟเวอร์ (jira_settings) + ข้อความแผง + รายการห้อง/card (jira_tickets)
// ขั้นตอนฝั่ง Discord (กดปุ่ม → สร้างห้อง → เลือกประเภท → pop-up → สร้าง card) อยู่ที่ JiraInteractionListener
// ==========================================
@Injectable()
export class JiraService implements OnApplicationShutdown {
    private readonly logger = new Logger('Jira');
    readonly cipher: TokenCipher;
    // ห้องที่รอปิดอัตโนมัติ (ticket id → timer)
    private readonly autoCloseTimers = new Map<number, NodeJS.Timeout>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
        private readonly jira: JiraClient,
        config: ConfigService<Env, true>,
    ) {
        this.cipher = new TokenCipher(config.get('JWT_SECRET', { infer: true }) ?? config.get('SESSION_SECRET', { infer: true }));
    }

    // ---------- การตั้งค่า ----------

    async getSettings(guildId: string): Promise<StoredJiraSettings> {
        const row = await this.prisma.jiraSetting.findUnique({ where: { guildId } });
        if (!row) {
            return {
                enabled: false,
                siteUrl: '',
                email: '',
                apiToken: '',
                projectKey: '',
                panelChannelId: '',
                panelMessageId: '',
                logChannelId: '',
                categoryId: '',
                options: defaultJiraOptions(),
                updatedAt: null,
            };
        }
        return { ...row, options: normalizeJiraOptions(row.options) };
    }

    view(settings: StoredJiraSettings): JiraSettings {
        const { apiToken, updatedAt, ...rest } = settings;
        return { ...rest, apiTokenSet: Boolean(apiToken), updatedAt: updatedAt?.toISOString() ?? null };
    }

    // ค่าเชื่อมต่อที่ถอดรหัส token แล้ว (null = ยังตั้งไม่ครบ / ถอดรหัสไม่ได้)
    credentials(settings: StoredJiraSettings): JiraCredentials | null {
        const apiToken = this.cipher.decrypt(settings.apiToken);
        if (!settings.siteUrl || !settings.email || !apiToken) return null;
        return { siteUrl: settings.siteUrl, email: settings.email, apiToken };
    }

    // เหตุผลที่ยังเปิดใช้ไม่ได้ (null = พร้อม)
    missingSetup(settings: StoredJiraSettings): string | null {
        if (!settings.siteUrl || !settings.email || !settings.apiToken || !settings.projectKey)
            return 'ยังเชื่อมต่อ Jira ไม่ครบ (site URL / อีเมล / API token / project key)';
        if (!this.cipher.decrypt(settings.apiToken)) return 'อ่าน API token ที่บันทึกไว้ไม่ได้ (JWT_SECRET อาจถูกเปลี่ยน) — กรอก API token ใหม่';
        if (!settings.options.issueTypes.length) return 'ยังไม่ได้เลือกประเภท card ที่ให้เปิดได้';
        if (!settings.panelChannelId) return 'ยังไม่ได้เลือกห้องแผง (ห้องที่มีปุ่มเปิด card)';
        return null;
    }

    private async assertChannel(guildId: string, channelId: string, label: string, kind: 'text' | 'category'): Promise<void> {
        if (!this.discord.ready) return;
        const channel = await this.discord.fetchGuildChannel(guildId, channelId);
        if (!channel) throw badRequest(`ไม่พบ${label}ในเซิร์ฟเวอร์นี้`);
        if (kind === 'category' && channel.type !== ChannelType.GuildCategory) throw badRequest(`${label}ต้องเป็นหมวดหมู่ (category)`);
        if (kind === 'text' && !channel.isSendable()) throw badRequest(`${label}ต้องเป็นห้องข้อความ`);
    }

    async updateSettings(guildId: string, patch: JiraSettingsPatch): Promise<{ settings: StoredJiraSettings; warning: string | null }> {
        const current = await this.getSettings(guildId);
        const next: StoredJiraSettings = { ...current };

        if (patch.siteUrl !== undefined) next.siteUrl = patch.siteUrl;
        if (patch.email !== undefined) next.email = patch.email;
        if (patch.projectKey !== undefined) next.projectKey = patch.projectKey;
        // token ว่าง = ใช้ของเดิม
        if (patch.apiToken) {
            if (!this.cipher.available) throw badRequest('ต้องตั้ง JWT_SECRET (อย่างน้อย 32 ตัวอักษร) ใน .env ของเซิร์ฟเวอร์ก่อน จึงจะบันทึก API token ได้');
            next.apiToken = this.cipher.encrypt(patch.apiToken);
        }
        for (const [key, label, kind] of [
            ['panelChannelId', 'ห้องแผง', 'text'],
            ['logChannelId', 'ห้อง log', 'text'],
            ['categoryId', 'หมวดหมู่ของห้องส่วนตัว', 'category'],
        ] as const) {
            const value = patch[key];
            if (value === undefined) continue;
            if (value) await this.assertChannel(guildId, value, label, kind);
            next[key] = value;
        }
        if (patch.options) next.options = patch.options;
        if (patch.enabled !== undefined) next.enabled = patch.enabled;

        if (next.enabled) {
            const missing = this.missingSetup(next);
            if (missing) throw badRequest(`เปิดใช้งานไม่ได้: ${missing}`);
        }

        const { updatedAt: _updatedAt, ...fields } = next;
        const data = { ...fields, options: toJsonValue(next.options) };
        const row = await this.prisma.jiraSetting.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });
        const settings: StoredJiraSettings = { ...row, options: normalizeJiraOptions(row.options) };
        return { settings, warning: await this.permissionWarning(guildId, settings) };
    }

    // บอทต้องสร้างห้องและตั้งสิทธิ์ห้องได้ — เตือน (ไม่ห้ามบันทึก) เพราะแอดมินอาจไปแก้สิทธิ์ใน Discord ทีหลัง
    async permissionWarning(guildId: string, settings: StoredJiraSettings): Promise<string | null> {
        const guild = this.discord.guild(guildId);
        const me = guild?.members.me;
        if (!guild || !me) return null;
        const problems: string[] = [];
        const scope = settings.categoryId ? guild.channels.cache.get(settings.categoryId) : null;
        const perms = scope ? me.permissionsIn(scope) : me.permissions;
        const missing = PERMISSION_LABELS.filter(([flag]) => !perms.has(flag)).map(([, label]) => label);
        if (missing.length) problems.push(`บอทขาดสิทธิ์${scope ? `ในหมวดหมู่ ${scope.name}` : ''}: ${missing.join(', ')} — สร้างห้องส่วนตัวไม่ได้`);
        if (settings.logChannelId) {
            const log = guild.channels.cache.get(settings.logChannelId);
            if (log && !me.permissionsIn(log).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
                problems.push(`บอทส่งข้อความเข้า #${log.name} ไม่ได้`);
            }
        }
        return problems.length ? problems.join(' · ') : null;
    }

    // ทดสอบด้วยค่าที่กำลังแก้ในหน้าเว็บ (ยังไม่บันทึก) — ช่องที่เว้นว่างใช้ค่าที่บันทึกไว้
    async testConnection(guildId: string, input: { siteUrl?: string; email?: string; apiToken?: string; projectKey?: string }): Promise<JiraConnectionResult> {
        const saved = await this.getSettings(guildId);
        const siteUrl = normalizeJiraSiteUrl(input.siteUrl || saved.siteUrl);
        const email = (input.email || saved.email).trim();
        const projectKey = (input.projectKey || saved.projectKey).trim().toUpperCase();
        const apiToken = input.apiToken || this.cipher.decrypt(saved.apiToken) || '';
        if (!JIRA_SITE_RE.test(siteUrl)) throw badRequest('Jira site URL ไม่ถูกต้อง (เช่น https://your-team.atlassian.net)');
        if (!email || !apiToken) throw badRequest('กรอกอีเมลและ API token ก่อน');
        if (!JIRA_PROJECT_KEY_RE.test(projectKey)) throw badRequest('กรอก project key ก่อน (เช่น PROJ)');

        const creds = { siteUrl, email, apiToken };
        try {
            const accountName = await this.jira.myself(creds);
            const project = await this.jira.project(creds, projectKey);
            return { success: true, accountName, projectName: project.name, issueTypes: project.issueTypes };
        } catch (err) {
            throw this.toApiError(err);
        }
    }

    toApiError(err: unknown): unknown {
        if (err instanceof JiraApiError) return new ApiException(err.status === 401 || err.status === 403 ? HttpStatus.BAD_REQUEST : err.status, err.message);
        return err;
    }

    // ---------- แผง ----------

    // ส่งแผงเข้าห้อง (ถ้าข้อความเดิมยังอยู่ในห้องเดิม = แก้ข้อความเดิมแทนการส่งใหม่)
    async sendPanel(guildId: string): Promise<{ channelName: string; edited: boolean }> {
        this.discord.requireReady();
        const settings = await this.getSettings(guildId);
        if (!settings.panelChannelId) throw badRequest('ยังไม่ได้เลือกห้องแผง');
        const channel = await this.discord.fetchGuildChannel(guildId, settings.panelChannelId);
        if (!channel || !channel.isSendable()) throw badRequest('ไม่พบห้องแผง หรือไม่ใช่ห้องข้อความ');
        const payload = panelMessage(settings.options.panel);
        const name = 'name' in channel ? String(channel.name) : settings.panelChannelId;

        let message: Message | null = null;
        if (settings.panelMessageId && 'messages' in channel) {
            message = await channel.messages.fetch(settings.panelMessageId).catch(() => null);
        }
        try {
            if (message?.editable) {
                await message.edit(payload);
                return { channelName: name, edited: true };
            }
            const sent = await (channel as SendableChannels).send(payload);
            await this.prisma.jiraSetting.update({ where: { guildId }, data: { panelMessageId: sent.id } });
            return { channelName: name, edited: false };
        } catch (err) {
            this.logger.warn(`ส่งแผง Jira (${guildId}) ไม่สำเร็จ: ${(err as Error).message}`);
            throw badRequest(`ส่งข้อความเข้า #${name} ไม่ได้ — ตรวจสิทธิ์ ส่งข้อความ / ฝังลิงก์ ของบอทในห้องนี้`);
        }
    }

    // ---------- ห้อง / card ----------

    async listTickets(guildId: string, page: number, status: 'all' | JiraTicketStatus): Promise<JiraTicketPage> {
        const where: Prisma.JiraTicketWhereInput = { guildId };
        if (status === 'closed') where.closedAt = { not: null };
        if (status === 'open') Object.assign(where, { closedAt: null, issueKey: null });
        if (status === 'created') Object.assign(where, { closedAt: null, issueKey: { not: null } });
        const [items, total, openCount, createdCount] = await Promise.all([
            this.prisma.jiraTicket.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
            this.prisma.jiraTicket.count({ where }),
            this.prisma.jiraTicket.count({ where: { guildId, closedAt: null } }),
            this.prisma.jiraTicket.count({ where: { guildId, issueKey: { not: null } } }),
        ]);
        return { items: items.map(toView), total, openCount, createdCount };
    }

    findTicket(guildId: string, ticketId: number): Promise<JiraTicket | null> {
        return this.prisma.jiraTicket.findFirst({ where: { id: ticketId, guildId } });
    }

    // ห้องที่ยังเปิดอยู่ของผู้ใช้ — ห้องถูกลบไปแล้วโดยไม่ผ่านบอท = ปิดให้เลย
    async findOpenTicket(guildId: string, userId: string): Promise<{ ticket: JiraTicket; channel: GuildBasedChannel } | null> {
        const tickets = await this.prisma.jiraTicket.findMany({ where: { guildId, userId, closedAt: null } });
        for (const ticket of tickets) {
            const channel = ticket.channelId ? await this.discord.fetchGuildChannel(guildId, ticket.channelId) : null;
            if (channel && 'guild' in channel) return { ticket, channel };
            // ไม่มีห้อง: ห้องถูกลบ หรือสร้างห้องไม่สำเร็จค้างไว้ — ถือว่าปิดแล้ว
            if (Date.now() - ticket.createdAt.getTime() > 60_000 || ticket.channelId) await this.markClosed(ticket.id);
        }
        return null;
    }

    async markClosed(ticketId: number): Promise<void> {
        await this.prisma.jiraTicket.updateMany({ where: { id: ticketId, closedAt: null }, data: { closedAt: new Date() } });
    }

    async markChannelDeleted(channelId: string): Promise<void> {
        await this.prisma.jiraTicket.updateMany({ where: { channelId, closedAt: null }, data: { closedAt: new Date() } });
    }

    // ปิดห้อง = ลบห้องใน Discord + บันทึกว่าปิดแล้ว (card ใน Jira ยังอยู่)
    async closeTicket(guildId: string, ticketId: number, reason: string): Promise<JiraTicket> {
        const ticket = await this.findTicket(guildId, ticketId);
        if (!ticket) throw notFound('ไม่พบห้องนี้');
        if (ticket.closedAt) return ticket;
        if (ticket.channelId) {
            const channel = await this.discord.fetchGuildChannel(guildId, ticket.channelId);
            if (channel && 'delete' in channel) {
                try {
                    await channel.delete(reason);
                } catch (err) {
                    if ((err as { code?: number }).code !== 10003) {
                        throw badRequest(`ลบห้องไม่ได้ — ตรวจสิทธิ์ จัดการห้อง ของบอท (${(err as Error).message})`);
                    }
                }
            }
        }
        await this.markClosed(ticket.id);
        return (await this.findTicket(guildId, ticketId))!;
    }

    toTicketView(ticket: JiraTicket): JiraTicketView {
        return toView(ticket);
    }

    // ---------- ปิดห้องอัตโนมัติหลังสร้าง card ----------

    scheduleAutoClose(guildId: string, ticketId: number, delayMs: number): void {
        clearTimeout(this.autoCloseTimers.get(ticketId));
        const timer = setTimeout(
            () => {
                this.autoCloseTimers.delete(ticketId);
                this.closeTicket(guildId, ticketId, `ปิดห้อง Jira ticket #${ticketId} อัตโนมัติหลังสร้าง card`).catch((err: Error) =>
                    this.logger.warn(`ปิดห้อง Jira ticket #${ticketId} อัตโนมัติไม่สำเร็จ: ${err.message}`),
                );
            },
            Math.max(0, delayMs),
        );
        timer.unref();
        this.autoCloseTimers.set(ticketId, timer);
    }

    // บอทรีสตาร์ทระหว่างรอปิด → ตั้งเวลาใหม่จากเวลาที่สร้าง card (เลยเวลาแล้ว = ปิดทันที)
    async resumeAutoClose(now = Date.now()): Promise<number> {
        const tickets = await this.prisma.jiraTicket.findMany({
            where: { closedAt: null, issueKey: { not: null }, cardCreatedAt: { not: null } },
            select: { id: true, guildId: true, cardCreatedAt: true },
        });
        const secondsByGuild = new Map<string, number>();
        let scheduled = 0;
        for (const ticket of tickets) {
            if (!secondsByGuild.has(ticket.guildId)) secondsByGuild.set(ticket.guildId, (await this.getSettings(ticket.guildId)).options.autoCloseSeconds);
            const seconds = secondsByGuild.get(ticket.guildId)!;
            if (seconds <= 0) continue;
            this.scheduleAutoClose(ticket.guildId, ticket.id, ticket.cardCreatedAt!.getTime() + seconds * 1000 - now);
            scheduled++;
        }
        return scheduled;
    }

    onApplicationShutdown(): void {
        for (const timer of this.autoCloseTimers.values()) clearTimeout(timer);
        this.autoCloseTimers.clear();
    }
}
