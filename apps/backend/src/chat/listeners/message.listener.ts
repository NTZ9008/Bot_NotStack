import { Injectable, Logger } from '@nestjs/common';
import { Events, type Message } from 'discord.js';
import { BotConfigService } from '../../bot-config/bot-config.service';
import { thaiTimestamp } from '../../common/utils/parse.util';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import { DiscordService } from '../../discord/discord.service';
import { LevelsService } from '../../levels/levels.service';
import { LogFilesService } from '../../log-files/log-files.service';
import { LogDispatcher } from '../../log-manager/services/log-dispatcher.service';
import badWords from '../data/bad-words.json';
import { GeminiService, type ModerationVerdict } from '../gemini.service';
import { SpamWindow } from '../spam-window';

// 🛡️ Anti-Spam: ส่งได้ไม่เกิน 6 ข้อความ ภายใน 5 วินาที
const SPAM_LIMIT = 6;
const SPAM_TIME = 5000;

// คำรุนแรงชัดเจน 100% (ต้องตรงทั้งข้อความ) — ลบเลยไม่ต้องถาม AI (ประหยัดโควตา)
const HARD_BAD_WORDS = ['ค', 'ดอ', 'เย็ด'];
// คำที่ต้องสงสัย (มีโอกาสเป็นคำหยาบ แต่ต้องดูบริบท) — ให้ AI ช่วยตัดสิน
const SUSPICIOUS_WORDS = [...new Set((badWords as string[]).map((word) => word.toLowerCase()))];

const ENCOURAGEMENTS = [
    'ทำทุกอย่างให้ดีที่สุด แล้วความสำเร็จจะตามมาเองครับ 😊',
    'วันนี้จะเป็นวันดีแน่นอน! 💪',
    'ความฝันจะไม่เกิดขึ้นเลยถ้าไม่ลงมือทำ',
    'เหนื่อยก็พักนะครับ แล้วลุยต่อ!',
];

// ==========================================
// 💬 MESSAGE PIPELINE — ทุกข้อความผ่านขั้นตอนตามลำดับนี้ (ขั้นไหนจัดการแล้วจะหยุดตรงนั้น)
// 1) บันทึก log  2) Anti-Spam  3) ตรวจลิงก์เชิญ  4) กรองคำหยาบ (AI ช่วยดูบริบท)
// 5) XP  6) AI Chat (แท็กบอท)  7) ตอบกลับอัตโนมัติ
// ขั้น 2 / 4 / 6 / 7 เปิด-ปิดได้ต่อเซิร์ฟเวอร์ที่หน้า Configuration (เซิร์ฟเวอร์ใหม่ปิดไว้ก่อน)
// ==========================================
interface ChatFeatures {
    antiSpam: boolean;
    badWordFilter: boolean;
    aiChat: boolean;
    autoReply: boolean;
}

const NO_FEATURES: ChatFeatures = { antiSpam: false, badWordFilter: false, aiChat: false, autoReply: false };

@Injectable()
export class MessageListener {
    private readonly logger = new Logger('Chat');
    private readonly spam = new SpamWindow(SPAM_LIMIT, SPAM_TIME);

    constructor(
        private readonly discord: DiscordService,
        private readonly config: BotConfigService,
        private readonly logFiles: LogFilesService,
        private readonly logs: LogDispatcher,
        private readonly levels: LevelsService,
        private readonly gemini: GeminiService,
    ) {}

    @OnDiscord(Events.MessageCreate)
    async onMessage(msg: Message): Promise<void> {
        if (msg.author.bot) return;
        // ข้อความใน DM ไม่ผ่านระบบของเซิร์ฟเวอร์
        if (!msg.inGuild()) return;

        this.writeLog(msg);
        const features = await this.features(msg.guildId);

        if (features.antiSpam && (await this.checkSpam(msg))) return;
        // ตรวจลิงก์เชิญเซิร์ฟเวอร์อื่น (เฉพาะบันทึก log ไม่ได้ลบข้อความ)
        this.logs.logInvitePosted(msg);
        if (features.badWordFilter && (await this.filterBadWords(msg))) return;
        await this.levels.awardMessageXp(msg);

        // AI Chat: ต้องแท็กบอท (@Bot) และไม่ใช่การแท็กทุกคน
        const me = this.discord.client.user;
        if (me && msg.mentions.has(me) && !msg.mentions.everyone) {
            if (features.aiChat) await this.aiChat(msg, me.id);
            return;
        }
        if (features.autoReply) this.autoReply(msg);
    }

    private async features(guildId: string): Promise<ChatFeatures> {
        try {
            const [antiSpam, badWordFilter, aiChat, autoReply] = await Promise.all([
                this.config.isEnabled(guildId, 'ANTI_SPAM_ENABLED'),
                this.config.isEnabled(guildId, 'BAD_WORD_FILTER_ENABLED'),
                this.config.isEnabled(guildId, 'AI_CHAT_ENABLED'),
                this.config.isEnabled(guildId, 'AUTO_REPLY_ENABLED'),
            ]);
            return { antiSpam, badWordFilter, aiChat, autoReply };
        } catch (err) {
            this.logger.error(`โหลดการตั้งค่าของเซิร์ฟเวอร์ ${guildId} ไม่สำเร็จ: ${(err as Error).message}`);
            return NO_FEATURES;
        }
    }

    private channelName(msg: Message): string {
        return ('name' in msg.channel && msg.channel.name) || 'DM';
    }

    private async send(msg: Message, content: string): Promise<void> {
        if (msg.channel.isSendable()) await msg.channel.send(content).catch(() => {});
    }

    // --- 1) ไฟล์ log รายวัน + Activity Log ---
    // ไฟล์ log เก็บเนื้อหาข้อความเฉพาะเซิร์ฟเวอร์หลัก (เซิร์ฟเวอร์อื่นที่เชิญบอทไปไม่ได้ตกลงให้เก็บแชท) และลบเองตาม LOG_RETENTION_DAYS
    // Activity Log เก็บทุกเซิร์ฟเวอร์ แต่เก็บแค่ว่าใครส่งที่ห้องไหนเมื่อไหร่ ไม่เก็บเนื้อหาข้อความ
    private writeLog(msg: Message): void {
        if (this.discord.isHome(msg.guildId)) {
            this.logFiles.appendMessage(`[${thaiTimestamp()}] #${this.channelName(msg)} (${msg.author.tag}): ${msg.content}\n`);
        }

        this.logs.recordActivity(msg.guild, 'messageSent', {
            title: '💬 ส่งข้อความ',
            context: {
                userId: msg.author.id,
                isBot: false,
                channelId: msg.channel.id,
                parentId: 'parentId' in msg.channel ? msg.channel.parentId : null,
                member: msg.member,
            },
            record: { user: msg.author, channelName: this.channelName(msg) },
            description: `${msg.author.username} ส่งข้อความใน #${this.channelName(msg)}`,
        });
    }

    // --- 2) Anti-Spam — คืน true ถ้าเป็นสแปม (ลบข้อความแล้ว) ---
    private async checkSpam(msg: Message): Promise<boolean> {
        const { blocked, warn } = this.spam.check(`${msg.guildId}:${msg.author.id}`);
        if (!blocked) return false;
        msg.delete().catch(() => {});
        if (warn) {
            this.logs.logFilterAction(msg.guild, { user: msg.author, channelId: msg.channel.id, reason: 'Anti-Spam (ส่งข้อความถี่เกินกำหนด)', content: msg.content });
            await this.send(msg, `⚠️ <@${msg.author.id}> ใจเย็นๆ ครับ! อย่าส่งข้อความรัวเกินไป`);
            const alertChannelId = msg.guildId ? await this.config.get(msg.guildId, 'ALERT_CHANNEL_ID') : null;
            if (msg.guildId && alertChannelId) {
                const alertChannel = await this.discord.fetchGuildChannel(msg.guildId, alertChannelId);
                if (alertChannel?.isSendable()) {
                    alertChannel.send(`🚨 **Anti-Spam:** <@${msg.author.id}> กำลังสแปมในห้อง <#${msg.channel.id}>`).catch(() => {});
                }
            }
        }
        return true;
    }

    // --- 4) กรองคำหยาบ — คืน true ถ้าลบข้อความแล้ว ---
    private async filterBadWords(msg: Message<true>): Promise<boolean> {
        const contentLower = msg.content.toLowerCase();
        const isHardcodedBad = HARD_BAD_WORDS.some((word) => contentLower === word.toLowerCase());
        const isSuspicious = SUSPICIOUS_WORDS.some((word) => contentLower.includes(word));
        if (!isHardcodedBad && !isSuspicious) return false;

        const remove = (warning: string, reason: string) => {
            msg.delete().catch(() => {});
            void this.send(msg, warning);
            this.logs.logFilterAction(msg.guild, { user: msg.author, channelId: msg.channel.id, reason, content: msg.content });
        };

        // คำหยาบชัดเจน ลบเลย ไม่ต้องถาม AI
        if (isHardcodedBad) {
            remove(`⚠️ แชทนี้จะสุดยอดเมื่อมีคุณอยู่ (กรุณาสุภาพครับ) <@${msg.author.id}>`, 'Bad Words Filter (คำหยาบชัดเจน)');
            return true;
        }

        // คำต้องสงสัย ให้ AI วิเคราะห์บริบท — AI ใช้ไม่ได้ (ไม่มี key / โควตาหมด / error) = ปล่อยผ่าน
        // เพราะรายการคำต้องสงสัยจับแบบ "มีคำนี้อยู่ในข้อความ" ซึ่งภาษาไทยไม่มีเว้นวรรค ข้อความปกติจึงติดได้ง่าย (เช่น สีแสด / ขยะ / มึง)
        if ((await this.judge(msg)) === 'BAD') {
            remove(`⚠️ ข้อความของคุณดูรุนแรงไปนิดนึงนะครับ <@${msg.author.id}>`, 'Smart Filter (AI ตรวจพบเนื้อหารุนแรง)');
            return true;
        }
        return false;
    }

    // null = AI ตัดสินไม่ได้
    private async judge(msg: Message<true>): Promise<ModerationVerdict | null> {
        if ((await this.gemini.reserve(msg.guildId)) !== 'ok') return null;
        try {
            return await this.gemini.moderate(msg.content);
        } catch (err) {
            this.logger.error(`AI Smart Filter Error: ${(err as Error).message}`);
            return null;
        }
    }

    // --- 6) AI Chat (Gemini) + โควตาต่อวัน ---
    private async aiChat(msg: Message<true>, botId: string): Promise<void> {
        // ตัดการแท็กชื่อบอทออก ให้เหลือแต่คำถาม
        const question = msg.content.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
        if (!question) {
            await msg.reply('ว่างายยย มีอะไรให้ช่วยมั้ยครับ? 🤖').catch(() => {});
            return;
        }

        const quota = await this.gemini.reserve(msg.guildId);
        if (quota === 'global' || quota === 'guild') {
            const limit = quota === 'global' ? this.gemini.dailyLimit : this.gemini.guildDailyLimit;
            const scope = quota === 'global' ? 'ประจำวัน' : 'ของเซิร์ฟเวอร์นี้วันนี้';
            await msg
                .reply(`🚫 **โควตา AI ${scope}หมดแล้วครับ!** (${limit}/${limit})\nระบบจะรีเซ็ตใหม่พรุ่งนี้ครับ หรือใช้คำสั่ง \`/weather\` เช็คอากาศแทนได้ครับ 🌦️`)
                .catch(() => {});
            return;
        }

        if (msg.channel.isSendable()) await msg.channel.sendTyping().catch(() => {}); // ขึ้นสถานะ "กำลังพิมพ์..."
        try {
            if (quota === 'disabled') throw new Error('ยังไม่ได้ตั้ง GEMINI_KEY');
            const text = await this.gemini.chat(question);
            // Discord จำกัด 2000 ตัวอักษร — คำตอบจาก AI ห้ามแท็กใครหรือยศไหน (แท็กแค่คนที่ถาม)
            await msg.reply({ content: text.length > 2000 ? `${text.substring(0, 1990)}...` : text, allowedMentions: { parse: [], repliedUser: true } });
        } catch (err) {
            this.logger.error(`AI Error: ${(err as Error).message}`);
            await msg.reply('❌ ตอนนี้สมองผมเบลอ (AI Error) หรือระบบ Google มีปัญหา ลองใหม่ทีหลังนะครับ').catch(() => {});
        }
    }

    // --- 7) ตอบกลับอัตโนมัติ ---
    private autoReply(msg: Message): void {
        const reply = (text: string) => void msg.reply(text).catch(() => {});
        const content = msg.content;
        if (content === 'สวัสดีบอท') reply(`สวัสดี <@${msg.author.id}> ครับ`);
        else if (content === 'Hello bot') reply(`Hello <@${msg.author.id}> 🙋‍♂️`);
        else if (content.includes('กินข้าวยังบอท')) reply(`กินแล้วครับคุณ <@${msg.author.id}>`);
        else if (content.includes('หิวข้าว')) reply('ผมยังไม่หิวครับ แต่คุณหาอะไรทานด้วยนะครับ 🍛');
        else if (content.includes('ขอกำลังใจ')) reply(ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]!);
        else if (content === 'จิบรี') reply('จิบรีครับนาย');
    }
}
