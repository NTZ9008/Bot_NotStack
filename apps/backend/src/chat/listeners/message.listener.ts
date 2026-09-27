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
import { AI_DAILY_LIMIT, GeminiService } from '../gemini.service';

// 🛡️ Anti-Spam: ส่งได้ไม่เกิน 6 ข้อความ ภายใน 5 วินาที
const SPAM_LIMIT = 6;
const SPAM_TIME = 5000;

// คำรุนแรงชัดเจน 100% (ต้องตรงทั้งข้อความ) — ลบเลยไม่ต้องถาม AI (ประหยัดโควตา)
const HARD_BAD_WORDS = ['ค', 'ดอ', 'เย็ด'];
// คำที่ต้องสงสัย (มีโอกาสเป็นคำหยาบ แต่ต้องดูบริบท) — ให้ AI ช่วยตัดสิน
const SUSPICIOUS_WORDS = (badWords as string[]).map((word) => word.toLowerCase());

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
    private readonly spam = new Map<string, { count: number; lastMsg: number }>();

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

        this.writeLog(msg);
        // ข้อความใน DM ไม่ผ่านระบบของเซิร์ฟเวอร์
        if (!msg.guildId) return;
        const features = await this.features(msg.guildId);

        if (features.antiSpam && (await this.checkSpam(msg))) return;
        // ตรวจลิงก์เชิญเซิร์ฟเวอร์อื่น (เฉพาะบันทึก log ไม่ได้ลบข้อความ)
        this.logs.logInvitePosted(msg);
        if (features.badWordFilter && (await this.filterBadWords(msg))) return;
        this.levels.awardMessageXp(msg);

        // AI Chat: ต้องแท็กบอท (@Bot) และไม่ใช่การแท็กทุกคน
        const me = this.discord.client.user;
        if (me && msg.mentions.has(me) && !msg.mentions.everyone) {
            if (features.aiChat) await this.aiChat(msg);
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

    // --- 1) ไฟล์ log รายวัน + Activity Log (เก็บแค่ว่าใครส่งที่ห้องไหนเมื่อไหร่ ไม่เก็บเนื้อหาข้อความ) ---
    private writeLog(msg: Message): void {
        // ไฟล์ log รวมทุกเซิร์ฟเวอร์ — เซิร์ฟเวอร์อื่นนอกจากเซิร์ฟเวอร์หลักมีชื่อเซิร์ฟเวอร์กำกับ
        const where = msg.guild && !this.discord.isHome(msg.guild.id) ? `[${msg.guild.name}] ` : '';
        const line = `[${thaiTimestamp()}] ${where}#${this.channelName(msg)} (${msg.author.tag}): ${msg.content}\n`;
        this.logFiles.appendMessage(line);
        this.logger.log(line.trim());

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
        const now = Date.now();
        const key = `${msg.guildId}:${msg.author.id}`;
        const data = this.spam.get(key) ?? { count: 0, lastMsg: 0 };
        if (now - data.lastMsg > SPAM_TIME) data.count = 0;
        data.count++;
        data.lastMsg = now;
        this.spam.set(key, data);
        // ล้างคนที่เงียบไปนานแล้วออกจาก memory
        if (this.spam.size > 1000) {
            for (const [id, entry] of this.spam) if (now - entry.lastMsg > SPAM_TIME) this.spam.delete(id);
        }

        // อนุญาตครบ SPAM_LIMIT ข้อความ และเริ่มลบตั้งแต่ข้อความถัดไป
        if (data.count <= SPAM_LIMIT) return false;
        msg.delete().catch(() => {});
        if (data.count === SPAM_LIMIT + 1) {
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
    private async filterBadWords(msg: Message): Promise<boolean> {
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

        // คำต้องสงสัย ให้ AI วิเคราะห์บริบท
        try {
            const prompt = `
            วิเคราะห์ข้อความต่อไปนี้ว่าเป็นการด่าทอ, คุกคาม, หรือใช้คำหยาบคายในบริบทที่รุนแรงหรือไม่?
            ข้อความ: "${msg.content}"

            กติกา:
            - ถ้าเป็นการด่าทอ คุกคาม หรือหยาบคายรุนแรง ให้ตอบแค่คำว่า "BAD"
            - ถ้าเป็นคำหยาบแต่ใช้คุยเล่นกับเพื่อน (เช่น กู มึง บ้าบอ) หรือเป็นบริบทปกติ ให้ตอบแค่คำว่า "PASS"

            ตอบแค่ BAD หรือ PASS เท่านั้น ห้ามพิมพ์คำอื่น:
            `;
            const analysis = (await this.gemini.generate(prompt)).trim().toUpperCase();
            if (analysis === 'BAD') {
                remove(`⚠️ ข้อความของคุณดูรุนแรงไปนิดนึงนะครับ <@${msg.author.id}>`, 'Smart Filter (AI ตรวจพบเนื้อหารุนแรง)');
                return true;
            }
            // AI ตอบ PASS (หรือตอบอย่างอื่น) → ปล่อยผ่าน
            return false;
        } catch (err) {
            // AI พัง → ยึดตามระบบเดิมไปก่อน (เผื่อเหนียว)
            this.logger.error(`AI Smart Filter Error: ${(err as Error).message}`);
            remove(`⚠️ แชทนี้จะสุดยอดเมื่อมีคุณอยู่ (กรุณาสุภาพครับ) <@${msg.author.id}>`, 'Bad Words Filter (AI ไม่พร้อมใช้งาน — ใช้ระบบสำรอง)');
            return true;
        }
    }

    // --- 6) AI Chat (Gemini) + โควตาต่อวัน ---
    private async aiChat(msg: Message): Promise<void> {
        if (this.gemini.quotaExhausted()) {
            await msg
                .reply(`🚫 **โควตา AI ประจำวันหมดแล้วครับ!** (${AI_DAILY_LIMIT}/${AI_DAILY_LIMIT})\nระบบจะรีเซ็ตใหม่พรุ่งนี้ครับ หรือใช้คำสั่ง \`/weather\` เช็คอากาศแทนได้ครับ 🌦️`)
                .catch(() => {});
            return;
        }

        if (msg.channel.isSendable()) await msg.channel.sendTyping().catch(() => {}); // ขึ้นสถานะ "กำลังพิมพ์..."
        try {
            // ตัดการแท็กชื่อบอทออก ให้เหลือแต่คำถาม
            const question = msg.content.replace(/<@!?[0-9]+>/, '').trim();
            if (!question) {
                await msg.reply('ว่างายยย มีอะไรให้ช่วยมั้ยครับ? 🤖');
                return;
            }

            const prompt = `
            คุณชื่อ Bot_NotStack บอทดูแลความปลอดภัยประจำเซิร์ฟเวอร์
            บุคลิก: กวนนิดๆ, เป็นกันเอง, ตอบสั้นกระชับ, ใช้ Emoji บ้าง
            ห้ามตอบเรื่องผิดกฎหมาย หรือเรื่อง 18+ เด็ดขาด
            User ถามว่า: "${question}"
            `;
            const text = await this.gemini.generate(prompt);
            // Discord จำกัด 2000 ตัวอักษร
            await msg.reply(text.length > 2000 ? `${text.substring(0, 1990)}...` : text);
            this.gemini.countUsage();
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
