import crypto from 'node:crypto';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PR_CONFIG_KEYS, SNOWFLAKE_RE, type PrBotSettings } from '@notstack/shared';
import { z } from 'zod';
import { BotConfigService } from '../bot-config/bot-config.service';
import { badRequest } from '../common/exceptions/api.exception';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';

// org/repo ที่เคยใช้ตอน migrate จาก key เดี่ยวรุ่นก่อน (ไม่ได้ผูกกับ logic การ route อีกต่อไป)
const LEGACY_PEGASUS_ORG = 'MUDST-2026-Pegasus';
const LEGACY_PEGASUS_TCG_WEB_REPO = `${LEGACY_PEGASUS_ORG}/pegasus-tcg-web`;

const DESCRIPTIONS = {
    [PR_CONFIG_KEYS.defaultChannel]: 'ห้องสำหรับแจ้งเตือน Pull Request (GitHub PR Bot) — ค่า default สำหรับ org/repo ที่ไม่ได้กำหนดไว้ใน PR_ORG_CHANNEL_MAP',
    [PR_CONFIG_KEYS.orgChannelMap]: `JSON กำหนด channel เฉพาะราย GitHub organization เช่น {"${LEGACY_PEGASUS_ORG}":"1234567890123456789"} — org ไหนไม่ได้ระบุในนี้จะใช้ PR_CHANNEL_ID (default) แทน`,
    [PR_CONFIG_KEYS.repoMentionMap]: `JSON กำหนด mention (ชื่อ Role หรือ mention tag) เฉพาะราย GitHub repo (owner/repo) เช่น {"${LEGACY_PEGASUS_ORG}/pegasus-tcg-api":"frontman-pegasus"} — repo ไหนไม่ได้ระบุในนี้จะไม่ mention เลย`,
    [PR_CONFIG_KEYS.webhookSecret]: 'secret ของ GitHub webhook ของเซิร์ฟเวอร์นี้ (ใส่ในช่อง Secret ตอนสร้าง webhook ที่ GitHub)',
};

const jsonMap = z.record(z.string(), z.unknown());

// ==========================================
// 🔀 PR BOT SETTINGS (ต่อเซิร์ฟเวอร์) — ห้อง default / ห้องแยกตาม org / mention แยกตาม repo / webhook secret
// เก็บในตาราง config (key PR_*) — อ่านค่าสดทุกครั้ง เพราะแอดมินแก้ผ่านหน้า Dashboard ได้ตลอดเวลา
// ==========================================
@Injectable()
export class PrBotSettingsService implements OnApplicationBootstrap {
    private readonly logger = new Logger('PrBot');

    constructor(
        private readonly config: BotConfigService,
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    // migration ครั้งเดียวของเซิร์ฟเวอร์หลัก: key เดี่ยวรุ่นก่อน (เจาะจง org/repo เดียว) → JSON map
    onApplicationBootstrap(): void {
        const guildId = this.discord.homeGuildId;
        for (const entry of [
            { mapKey: PR_CONFIG_KEYS.orgChannelMap, legacyKey: 'PR_CHANNEL_PEGASUS', legacyMapKeyName: LEGACY_PEGASUS_ORG },
            { mapKey: PR_CONFIG_KEYS.repoMentionMap, legacyKey: 'PR_MENTION_PEGASUS_TCG_WEB', legacyMapKeyName: LEGACY_PEGASUS_TCG_WEB_REPO },
        ]) {
            this.migrateSingleKeyToMap(guildId, entry).catch((err: Error) => this.logger.error(`ไม่สามารถย้าย ${entry.legacyKey} ไป ${entry.mapKey} ได้: ${err.message}`));
        }
    }

    private async migrateSingleKeyToMap(guildId: string, { mapKey, legacyKey, legacyMapKeyName }: { mapKey: string; legacyKey: string; legacyMapKeyName: string }) {
        if (await this.prisma.config.findUnique({ where: { guildId_key: { guildId, key: mapKey } } })) return;
        const legacyValue = await this.config.get(guildId, legacyKey);
        if (!legacyValue) return;
        await this.config.set(guildId, mapKey, JSON.stringify({ [legacyMapKeyName]: legacyValue }), DESCRIPTIONS[mapKey as keyof typeof DESCRIPTIONS]);
        await this.config.remove(guildId, legacyKey);
    }

    private async getJsonMap(guildId: string, key: string): Promise<Record<string, string>> {
        const raw = await this.config.get(guildId, key);
        if (!raw) return {};
        try {
            const parsed = jsonMap.safeParse(JSON.parse(raw));
            if (!parsed.success) return {};
            return Object.fromEntries(Object.entries(parsed.data).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
        } catch (err) {
            this.logger.error(`รูปแบบ JSON ใน ${key} (${guildId}) ไม่ถูกต้อง: ${(err as Error).message}`);
            return {};
        }
    }

    private static lookupCaseInsensitive(map: Record<string, string>, key: string): string | null {
        const matchedKey = Object.keys(map).find((k) => k.toLowerCase() === key.toLowerCase());
        return matchedKey ? map[matchedKey]! : null;
    }

    getDefaultChannelId(guildId: string): Promise<string | null> {
        return this.config.get(guildId, PR_CONFIG_KEYS.defaultChannel);
    }

    async getChannelIdForOrg(guildId: string, orgLogin: string): Promise<string | null> {
        return PrBotSettingsService.lookupCaseInsensitive(await this.getJsonMap(guildId, PR_CONFIG_KEYS.orgChannelMap), orgLogin);
    }

    async getMentionForRepo(guildId: string, repoFullName: string): Promise<string | null> {
        return PrBotSettingsService.lookupCaseInsensitive(await this.getJsonMap(guildId, PR_CONFIG_KEYS.repoMentionMap), repoFullName);
    }

    // secret ของ webhook ของเซิร์ฟเวอร์นี้ — สร้างให้เองครั้งแรก
    async getWebhookSecret(guildId: string, { create = false } = {}): Promise<string | null> {
        const secret = await this.config.get(guildId, PR_CONFIG_KEYS.webhookSecret);
        if (secret || !create) return secret;
        return this.rotateWebhookSecret(guildId);
    }

    async rotateWebhookSecret(guildId: string): Promise<string> {
        const secret = crypto.randomBytes(24).toString('hex');
        await this.config.set(guildId, PR_CONFIG_KEYS.webhookSecret, secret, DESCRIPTIONS[PR_CONFIG_KEYS.webhookSecret]);
        return secret;
    }

    async read(guildId: string): Promise<PrBotSettings> {
        return {
            defaultChannelId: (await this.getDefaultChannelId(guildId)) ?? '',
            orgChannels: await this.getJsonMap(guildId, PR_CONFIG_KEYS.orgChannelMap),
            repoMentions: await this.getJsonMap(guildId, PR_CONFIG_KEYS.repoMentionMap),
            webhookPath: `/webhook/github/${guildId}`,
            webhookSecret: (await this.getWebhookSecret(guildId, { create: true })) ?? '',
        };
    }

    // บันทึกเฉพาะส่วนที่ส่งมา
    async update(guildId: string, input: { defaultChannelId?: string; orgChannels?: Record<string, string>; repoMentions?: Record<string, string> }): Promise<PrBotSettings> {
        const assertChannel = async (channelId: string, label: string) => {
            if (!SNOWFLAKE_RE.test(channelId)) throw badRequest(`Channel ID ของ ${label} ไม่ถูกต้อง`);
            if (this.discord.ready && !(await this.discord.fetchGuildChannel(guildId, channelId))) throw badRequest(`ไม่พบห้องของ ${label} ในเซิร์ฟเวอร์นี้`);
        };
        if (input.defaultChannelId !== undefined) {
            // เว้นว่างได้ (= ปิดการแจ้งเตือนของ org/repo ที่ไม่ได้ระบุห้องไว้)
            if (input.defaultChannelId) await assertChannel(input.defaultChannelId, 'ห้อง Default');
            await this.config.set(guildId, PR_CONFIG_KEYS.defaultChannel, input.defaultChannelId, DESCRIPTIONS[PR_CONFIG_KEYS.defaultChannel]);
        }
        if (input.orgChannels !== undefined) {
            for (const [org, channelId] of Object.entries(input.orgChannels)) await assertChannel(channelId, org);
            await this.config.set(guildId, PR_CONFIG_KEYS.orgChannelMap, JSON.stringify(input.orgChannels), DESCRIPTIONS[PR_CONFIG_KEYS.orgChannelMap]);
        }
        if (input.repoMentions !== undefined) {
            await this.config.set(guildId, PR_CONFIG_KEYS.repoMentionMap, JSON.stringify(input.repoMentions), DESCRIPTIONS[PR_CONFIG_KEYS.repoMentionMap]);
        }
        return this.read(guildId);
    }
}
