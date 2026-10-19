import crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Guild } from 'discord.js';
import type { Env } from '../config/env.validation';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type {
    CheckRunEvent,
    GithubRepository,
    IssueCommentEvent,
    PullRequestEvent,
    PullRequestReviewCommentEvent,
    PullRequestReviewEvent,
    StatusEvent,
} from './interfaces/github.interface';
import { PrBotSettingsService } from './pr-bot-settings.service';
import { PrBotStatsService } from './pr-bot-stats.service';
import { applyCheckRun, applyPullRequest, applyPullRequestComment, applyReview, applyStatus, normalizeActivity, type PrActivity } from './utils/pr-activity';
import { prPayload } from './utils/pr-bot.embeds';

// ==========================================
// 🔀 PR BOT — แจ้งเตือน GitHub Pull Request เข้า Discord และแก้ข้อความเดิมเมื่อมี review / check / comment หรือ PR ถูก merge/close
// แต่ละเซิร์ฟเวอร์มี webhook ของตัวเอง (/webhook/github/:guildId + secret ของเซิร์ฟเวอร์นั้น)
// webhook เดิม /webhook/github (GITHUB_WEBHOOK_SECRET ใน .env) ยังใช้ได้ — ส่งเข้าเซิร์ฟเวอร์หลัก
// ==========================================
@Injectable()
export class PrBotService {
    private readonly logger = new Logger('PrBot');
    private readonly legacySecret: string;
    private readonly refreshQueue = new Map<string, { started: boolean; promise: Promise<string | null> }>();

    constructor(
        private readonly settings: PrBotSettingsService,
        private readonly discord: DiscordService,
        private readonly prisma: PrismaService,
        config: ConfigService<Env, true>,
        private readonly stats: PrBotStatsService,
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

    // event ที่ต้องเลือกใน GitHub webhook: Pull requests, Pull request reviews, Pull request review comments,
    // Issue comments, Check runs, Statuses — event อื่น (เช่น ping) ไม่ทำอะไร
    async handle(guildId: string, event: string, payload: unknown): Promise<void> {
        switch (event) {
            case 'pull_request':
                return this.handlePullRequest(guildId, payload as PullRequestEvent);
            case 'pull_request_review':
                return this.handleReview(guildId, payload as PullRequestReviewEvent);
            case 'issue_comment':
                return this.handleIssueComment(guildId, payload as IssueCommentEvent);
            case 'pull_request_review_comment':
                return this.handleReviewComment(guildId, payload as PullRequestReviewCommentEvent);
            case 'check_run': {
                const { check_run: run, repository } = payload as CheckRunEvent;
                if (run) return this.handleCommitResult(guildId, repository, run.head_sha, (activity) => applyCheckRun(activity, run));
                return;
            }
            case 'status': {
                const status = payload as StatusEvent;
                return this.handleCommitResult(guildId, status.repository, status.sha, (activity) => applyStatus(activity, status));
            }
        }
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
            // reopen / ready_for_review ส่งข้อความใหม่ (ping อีกรอบ) แต่ยังเก็บ review / comment ที่สะสมไว้
            const previous = await this.prisma.prMessage.findUnique({ where: key, select: { channelId: true, messageId: true, activity: true } });
            const activity = applyPullRequest(normalizeActivity(previous?.activity), pr, repo, action);
            // mention มาจากการตั้งค่าของแอดมิน (ผู้ใช้หรือยศ) — แท็กได้ทั้งสองแบบ
            const message = await channel.send({
                ...prPayload(activity.pr!, activity),
                ...(mention ? { content: mention } : {}),
                allowedMentions: { parse: ['users', 'roles'] },
            });
            await this.stats.record(guildId, message.id, 'sent');
            const data = { channelId: channel.id, messageId: message.id, headSha: activity.pr!.headSha, activity: toJson(activity) };
            await this.prisma.prMessage.upsert({
                where: key,
                create: { guildId, repoFullName: repo.full_name, prNumber: pr.number, ...data },
                update: data,
            });
            // ลบข้อความเดิม ไม่งั้นข้อความ draft / closed จะค้างอยู่ในห้อง และไม่ถูกอัปเดตอีกเลย (1 PR = 1 ข้อความ)
            if (previous && previous.messageId !== message.id) await this.deleteMessage(guildId, previous.channelId, previous.messageId);
            return;
        }

        // action อื่น (closed, synchronize, review_requested, edited, converted_to_draft ฯลฯ) → แก้ข้อความเดิม
        const updated = await this.mutate(guildId, repo.full_name, pr.number, (activity) => applyPullRequest(activity, pr, repo, action));
        if (!updated) return; // ไม่เคยเห็น "opened" มาก่อน (เช่น bot เพิ่งเปิดใช้งาน) → ข้าม
        const messageId = await this.refresh(guildId, repo.full_name, pr.number);
        if (action === 'closed' && messageId) await this.stats.record(guildId, messageId, pr.merged ? 'merged' : 'closed');
    }

    // ข้อความใหม่ส่งสำเร็จแล้ว — ลบข้อความเก่าไม่ได้ (ถูกลบไปแล้ว / ห้องหาย) ก็ไม่ควรทำให้ webhook ล้มเหลว
    private async deleteMessage(guildId: string, channelId: string, messageId: string): Promise<void> {
        try {
            const channel = await this.discord.fetchGuildChannel(guildId, channelId);
            if (!channel || !('messages' in channel)) return;
            const msg = await channel.messages.fetch(messageId).catch(() => null);
            await msg?.delete();
        } catch (err) {
            this.logger.error(`ลบข้อความ PR เดิมไม่สำเร็จ: ${messageId} (${guildId})`, err);
        }
    }

    private async handleReview(guildId: string, { action, review, pull_request: pr, repository: repo }: PullRequestReviewEvent): Promise<void> {
        if (!review || !pr || !repo) return;
        await this.update(guildId, repo.full_name, pr.number, (activity) => applyReview(activity, review, pr, repo, action));
    }

    private async handleIssueComment(guildId: string, { action, issue, comment, repository: repo }: IssueCommentEvent): Promise<void> {
        if (!issue?.pull_request || !comment || !repo) return; // comment ใน issue ธรรมดา ไม่ใช่ PR
        await this.update(guildId, repo.full_name, issue.number, (activity) => applyPullRequestComment(activity, 'issue', comment, undefined, repo, action));
    }

    private async handleReviewComment(guildId: string, { action, comment, pull_request: pr, repository: repo }: PullRequestReviewCommentEvent): Promise<void> {
        if (!comment || !pr || !repo) return;
        await this.update(guildId, repo.full_name, pr.number, (activity) => applyPullRequestComment(activity, 'review-comment', comment, pr, repo, action));
    }

    // check_run / status ไม่บอกเลข PR (PR จาก fork ก็ไม่มี) → หา PR จาก commit sha ล่าสุดที่เก็บไว้
    private async handleCommitResult(
        guildId: string,
        repo: GithubRepository | undefined,
        sha: string | undefined,
        apply: (activity: PrActivity) => PrActivity,
    ): Promise<void> {
        if (!repo || !sha) return;
        const rows = await this.prisma.prMessage.findMany({ where: { guildId, repoFullName: repo.full_name, headSha: sha }, select: { prNumber: true } });
        for (const { prNumber } of rows) await this.update(guildId, repo.full_name, prNumber, apply);
    }

    private async update(guildId: string, repoFullName: string, prNumber: number, apply: (activity: PrActivity) => PrActivity): Promise<void> {
        if (!this.discord.ready) return void this.logger.error('Discord client ยังไม่พร้อม');
        if (await this.mutate(guildId, repoFullName, prNumber, apply)) await this.refresh(guildId, repoFullName, prNumber);
    }

    // event หลายตัวมาพร้อมกันได้ (CI หลาย job) — ล็อกแถวไว้ระหว่างอ่าน-แก้-เขียน ไม่งั้นผลของ event หนึ่งจะทับอีกอัน
    private async mutate(guildId: string, repoFullName: string, prNumber: number, apply: (activity: PrActivity) => PrActivity): Promise<boolean> {
        return this.prisma.$transaction(async (tx) => {
            const [row] = await tx.$queryRaw<{ activity: unknown }[]>`
                SELECT activity FROM pr_messages
                WHERE guild_id = ${guildId} AND repo_full_name = ${repoFullName} AND pr_number = ${prNumber}
                FOR UPDATE
            `;
            if (!row) return false;
            const activity = apply(normalizeActivity(row.activity));
            await tx.prMessage.update({
                where: { guildId_repoFullName_prNumber: { guildId, repoFullName, prNumber } },
                data: { activity: toJson(activity), ...(activity.pr?.headSha ? { headSha: activity.pr.headSha } : {}) },
            });
            return true;
        });
    }

    // แก้ข้อความ Discord ตามสถานะล่าสุดใน DB — ทำทีละครั้งต่อ PR และรวบคำขอที่ซ้อนกันเป็นครั้งเดียว
    // (ข้อความที่แก้ทีหลังอ่านสถานะทีหลังเสมอ จึงไม่มีทางถูกข้อความเก่าทับ และไม่ยิง Discord ถี่เกินจำเป็น)
    private refresh(guildId: string, repoFullName: string, prNumber: number): Promise<string | null> {
        const id = `${guildId}:${repoFullName}#${prNumber}`;
        const queued = this.refreshQueue.get(id);
        if (queued && !queued.started) return queued.promise;
        const entry: { started: boolean; promise: Promise<string | null> } = { started: false, promise: Promise.resolve(null) };
        entry.promise = (queued?.promise ?? Promise.resolve(null))
            .catch(() => null)
            .then(() => {
                entry.started = true;
                return this.render(guildId, repoFullName, prNumber);
            })
            .finally(() => {
                if (this.refreshQueue.get(id) === entry) this.refreshQueue.delete(id);
            });
        this.refreshQueue.set(id, entry);
        return entry.promise;
    }

    private async render(guildId: string, repoFullName: string, prNumber: number): Promise<string | null> {
        const where = { guildId_repoFullName_prNumber: { guildId, repoFullName, prNumber } };
        const row = await this.prisma.prMessage.findUnique({ where, select: { channelId: true, messageId: true, activity: true } });
        const activity = normalizeActivity(row?.activity);
        if (!row || !activity.pr) return null; // แถวเก่าที่ยังไม่มีข้อมูล PR — รอ event ที่มี pull_request
        // ใช้ห้องที่เคยส่งข้อความจริง ไม่ใช่ค่าห้องปัจจุบันซึ่งอาจถูกแอดมินเปลี่ยนหลังเปิด PR
        const channel = await this.discord.fetchGuildChannel(guildId, row.channelId);
        if (!channel || !channel.isSendable() || !('messages' in channel)) {
            this.logger.error(`ไม่พบ channel เดิม: ${row.channelId} (${guildId})`);
            return null;
        }
        const msg = await channel.messages.fetch(row.messageId).catch(() => null);
        if (!msg) return null;
        await msg.edit(prPayload(activity.pr, activity));
        return msg.id;
    }
}

const toJson = (activity: PrActivity) => activity as unknown as Prisma.InputJsonValue;
