import crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Guild } from 'discord.js';
import type { Env } from '../config/env.validation';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';
import type { GithubRepository, PullRequestEvent } from './interfaces/github.interface';
import { PrBotSettingsService } from './pr-bot-settings.service';
import { prClosedPayload, prOpenedPayload } from './utils/pr-bot.embeds';

// ==========================================
// 🔀 PR BOT — แจ้งเตือน GitHub Pull Request เข้า Discord และแก้ข้อความเดิมเมื่อ PR ถูก merge/close
// แต่ละเซิร์ฟเวอร์มี webhook ของตัวเอง (/webhook/github/:guildId + secret ของเซิร์ฟเวอร์นั้น)
// webhook เดิม /webhook/github (GITHUB_WEBHOOK_SECRET ใน .env) ยังใช้ได้ — ส่งเข้าเซิร์ฟเวอร์หลัก
// ==========================================
@Injectable()
export class PrBotService {
    private readonly logger = new Logger('PrBot');
    private readonly legacySecret: string;

    constructor(
        private readonly settings: PrBotSettingsService,
        private readonly discord: DiscordService,
        private readonly prisma: PrismaService,
        config: ConfigService<Env, true>,
    ) {
        this.legacySecret = config.get('GITHUB_WEBHOOK_SECRET', { infer: true }) ?? '';
    }

    get homeGuildId(): string {
        return this.discord.homeGuildId;
    }

    // ต้องใช้ raw body (Buffer) ไม่ใช่ JSON ที่ parse แล้ว ไม่งั้น HMAC จะไม่ตรงกัน
    // legacy = webhook เดิมที่ไม่มี guildId ใน URL (ใช้ secret จาก .env)
    async verifySignature(guildId: string, rawBody: Buffer, signatureHeader: unknown, legacy: boolean): Promise<boolean> {
        if (typeof signatureHeader !== 'string') return false;
        const secret = legacy ? this.legacySecret : await this.settings.getWebhookSecret(guildId);
        if (!secret) return false;
        const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`);
        const received = Buffer.from(signatureHeader);
        // timingSafeEqual โยน error ถ้าความยาวไม่เท่ากัน จึงเช็คก่อน
        return expected.length === received.length && crypto.timingSafeEqual(expected, received);
    }

    async handle(guildId: string, event: string, payload: unknown): Promise<void> {
        if (event === 'pull_request') await this.handlePullRequest(guildId, payload as PullRequestEvent);
    }

    // แต่ละ GitHub org แยก channel ได้ตาม PR_ORG_CHANNEL_MAP — org ที่ไม่ได้ระบุไว้จะใช้ channel default
    private async resolveChannelId(guildId: string, repo: GithubRepository): Promise<string | null> {
        const orgLogin = repo.full_name.split('/')[0] ?? '';
        return (await this.settings.getChannelIdForOrg(guildId, orgLogin)) || this.settings.getDefaultChannelId(guildId);
    }

    // แต่ละ repo mention role ได้ตาม PR_REPO_MENTION_MAP — repo ที่ไม่ได้ระบุไว้จะไม่ mention เลย
    // ต้องใส่เป็น content ของข้อความ (ไม่ใช่ใน embed) ถึงจะ ping แจ้งเตือนจริงได้ — ข้อจำกัดของ Discord
    private async resolveMention(guildId: string, repo: GithubRepository, guild: Guild | null): Promise<string> {
        const mention = await this.settings.getMentionForRepo(guildId, repo.full_name);
        if (!mention) return '';
        if (mention.startsWith('<@')) return mention; // ตั้งเป็น mention tag ตรงๆ อยู่แล้ว

        // ไม่งั้นถือว่าเป็นชื่อ Role แล้วค้นหาใน guild ของ channel นี้
        const role = guild?.roles.cache.find((r) => r.name === mention);
        if (role) return `<@&${role.id}>`;
        this.logger.error(`ไม่พบ role ชื่อ "${mention}" ใน guild — ส่งเป็นข้อความเฉยๆ แทนการ mention จริง`);
        return `@${mention}`;
    }

    private async handlePullRequest(guildId: string, { action, pull_request: pr, repository: repo }: PullRequestEvent): Promise<void> {
        if (!pr || !repo) return;
        if (!this.discord.ready) return void this.logger.error('Discord client ยังไม่พร้อม');
        const key = { guildId_repoFullName_prNumber: { guildId, repoFullName: repo.full_name, prNumber: pr.number } };

        if (action && ['opened', 'reopened', 'ready_for_review'].includes(action)) {
            const channelId = await this.resolveChannelId(guildId, repo);
            if (!channelId) return void this.logger.error(`ยังไม่ได้ตั้งค่า channel สำหรับ PR นี้ในหน้า Dashboard (${guildId})`);
            const channel = await this.discord.fetchGuildChannel(guildId, channelId);
            if (!channel || !channel.isSendable() || !('messages' in channel)) return void this.logger.error(`ไม่พบ channel: ${channelId} (${guildId})`);
            const mention = await this.resolveMention(guildId, repo, 'guild' in channel ? channel.guild : null);
            // mention มาจากการตั้งค่าของแอดมิน (ผู้ใช้หรือยศ) — แท็กได้ทั้งสองแบบ
            const message = await channel.send({
                ...prOpenedPayload(pr, repo),
                ...(mention ? { content: mention } : {}),
                allowedMentions: { parse: ['users', 'roles'] },
            });
            await this.prisma.prMessage.upsert({
                where: key,
                create: { guildId, repoFullName: repo.full_name, prNumber: pr.number, channelId: channel.id, messageId: message.id },
                update: { channelId: channel.id, messageId: message.id },
            });
            return;
        }

        if (action === 'closed') {
            const existing = await this.prisma.prMessage.findUnique({ where: key, select: { channelId: true, messageId: true } });
            if (!existing) return; // ไม่เคยเห็น "opened" มาก่อน (เช่น bot เพิ่งเปิดใช้งาน) → ข้าม
            // ใช้ห้องที่เคยส่งข้อความจริง ไม่ใช่ค่าห้องปัจจุบันซึ่งอาจถูกแอดมินเปลี่ยนหลังเปิด PR
            const channel = await this.discord.fetchGuildChannel(guildId, existing.channelId);
            if (!channel || !channel.isSendable() || !('messages' in channel)) {
                return void this.logger.error(`ไม่พบ channel เดิม: ${existing.channelId} (${guildId})`);
            }
            const msg = await channel.messages.fetch(existing.messageId).catch(() => null);
            if (!msg) return;
            await msg.edit(prClosedPayload(pr, repo));
        }
    }
}
