const { Client, GatewayIntentBits, Events, Collection, ChannelType, AuditLogEvent, Partials } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const schedule = require("node-schedule");
const { getWeatherEmbed } = require("./commands/weather.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getConfig, saveAllLevelsToDB, getAllLevels, getWhitelistChannel, getWhitelistUsers, getBlacklistChannel, getBlacklistUsers } = require('./db.js');
const { startServer } = require('./server.js');
const { initLogManager, logFilterAction, logInvitePosted } = require('./logmanager');

dotenv.config();

// ==========================================
// 🤖 CLIENT SETUP
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildModeration,             // Log Manager: แบน / ปลดแบน / audit log
        GatewayIntentBits.GuildInvites,                // Log Manager: คำเชิญของเซิร์ฟเวอร์
        GatewayIntentBits.GuildExpressions,            // Log Manager: อีโมจิ / สติกเกอร์
        GatewayIntentBits.GuildScheduledEvents,        // Log Manager: กิจกรรมของเซิร์ฟเวอร์
        GatewayIntentBits.AutoModerationConfiguration, // Log Manager: กฎ AutoMod
        GatewayIntentBits.AutoModerationExecution      // Log Manager: AutoMod ทำงาน
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// เริ่มทำงาน Dashboard Server
startServer(client);

// ==========================================
// ⚙️ CONFIG & SETTINGS (ตั้งค่าระบบถูกย้ายไป DB แล้ว)
// ==========================================

// 🛡️ Security Config (ตั้งค่าความปลอดภัย)
const SPAM_LIMIT = 6;       // จำนวนข้อความสูงสุด
const SPAM_TIME = 5000;     // ภายใน 5 วินาที
// Voice Spam Map (เก็บข้อมูลคนแกล้งลากเพื่อน)
const voiceSpamMap = new Map();

// ตัวแปรเก็บสถานะชั่วคราว (Memory Cache)
const spamMap = new Map();

// AIE
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ตั้งค่าโควตา (Gemini Flash ให้ฟรีประมาณ 250 ครั้ง/วัน)
const AI_DAILY_LIMIT = 250; 
let aiUsage = {
    date: new Date().toDateString(),
    count: 0 
};



// โหลดคำหยาบ (Bad Words)
const badWordsFile = path.join(__dirname, 'badWords.json');
let badWordsSet = new Set();
if (fs.existsSync(badWordsFile)) {
    try {
        const badWordsData = JSON.parse(fs.readFileSync(badWordsFile, 'utf8'));
        badWordsSet = new Set(badWordsData);
    } catch (err) {
        console.error("Error reading badWords.json:", err);
    }
}

// ==========================================
// 🏆 LEVEL & XP SYSTEM SETUP (Migrated to DB)
// ==========================================
let levelsData = {};
// ข้อมูลจะถูกโหลดเข้า memory ตอน ClientReady

// Cooldown map สำหรับป้องกันการสแปม XP
const xpCooldownMap = new Set();

// ==========================================
// 1️⃣ COMMAND HANDLER & READY EVENT
// ==========================================
client.commands = new Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`🛡️ Security Systems: Active`);

    // เริ่มระบบ Log Management (ตั้งค่าได้จาก Dashboard แท็บ Log Management)
    try {
        await initLogManager(client);
    } catch (err) {
        console.error("❌ Error starting Log Manager:", err);
    }

    // โหลด Levels จาก DB เข้า Memory
    try {
        const rows = await getAllLevels();
        rows.forEach(r => {
            levelsData[r.userId] = { xp: r.xp, level: r.level };
        });
        console.log(`✅ Loaded ${rows.length} users' levels from DB`);
    } catch (err) {
        console.error("❌ Error loading levels from DB:", err);
    }

    // ตั้งเวลาส่งพยากรณ์อากาศ 7 โมงเช้า
    schedule.scheduleJob("0 7 * * *", async () => {
        const genChannelId = await getConfig('GENERAL_CHANNEL_ID');
        if (!genChannelId) return console.log("❌ ไม่พบการตั้งค่าช่องทั่วไป");
        const channel = await client.channels.fetch(genChannelId).catch(() => null);
        if (!channel) return console.log("❌ ไม่พบช่องทั่วไปสำหรับพยากรณ์อากาศ");

        const embed = await getWeatherEmbed("Salaya,TH", process.env.OPENWEATHER_KEY);
        if (!embed) return channel.send("❌ ไม่สามารถดึงข้อมูลอากาศได้ตอนนี้");

        channel.send({ content: "☀️ พยากรณ์อากาศวันนี้", embeds: [embed] });
    });

    // ==========================================
    // 🎙️ VOICE CHANNEL XP SYSTEM
    // ==========================================
    setInterval(() => {
        let isUpdated = false;
        
        client.guilds.cache.forEach(guild => {
            // หาห้อง Voice ทั้งหมด (ChannelType 2 = GuildVoice)
            const voiceChannels = guild.channels.cache.filter(c => c.type === 2); 
            
            voiceChannels.forEach(voiceChannel => {
                if (voiceChannel.members.size > 0) {
                    voiceChannel.members.forEach(member => {
                        // บอท, คนที่ปิดหูฟัง (Deaf), และ คนที่ปิดไมค์ (Mute) จะไม่ได้ XP
                        // ให้ XP เฉพาะคนที่เปิดเสียงฟัง และ เปิดไมค์ เท่านั้น!
                        const isMuted = member.voice.selfMute || member.voice.serverMute;
                        const isDeaf = member.voice.selfDeaf || member.voice.serverDeaf;

                        if (!member.user.bot && !isDeaf && !isMuted) {
                            const userId = member.user.id;
                            
                            if (!levelsData[userId]) {
                                levelsData[userId] = { xp: 0, level: 0 };
                            }
                            
                            // สุ่มแจก XP (5-10 XP) ทุกๆ 1 นาทีที่อยู่ใน Voice
                            const xpToAdd = Math.floor(Math.random() * 6) + 5;
                            levelsData[userId].xp += xpToAdd;
                            
                            const currentLevel = levelsData[userId].level;
                            const nextLevelXp = 100 * Math.pow(currentLevel + 1, 2);
                            
                            if (levelsData[userId].xp >= nextLevelXp) {
                                levelsData[userId].level += 1;
                                

                            }
                            isUpdated = true;
                        }
                    });
                }
            });
        });

        // ถ้ามีการแจก XP ให้เซฟลง Database
        if (isUpdated) {
            saveAllLevelsToDB(levelsData).catch(err => console.error("❌ Error saving voice levels to DB:", err));
        }
    }, 60000); // ทำงานเช็คทุกๆ 1 นาที (60000 ms)
});

// Interaction Handler (Slash Commands)
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await command.execute(interaction);
        }
        if (interaction.isStringSelectMenu() || interaction.isModalSubmit() || interaction.isButton()) {
            for (const cmd of client.commands.values()) {
                if (cmd.componentHandler) await cmd.componentHandler(interaction);
            }
        }
    } catch (err) {
        console.error(err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "❌ มีบางอย่างผิดพลาด", flags: 64 });
        }
    }
});

// ==========================================
// 2️⃣ SECURITY: BITRATE MONITOR (จับตาดูการปรับ Bitrate)
// ==========================================
client.on('channelUpdate', async (oldChannel, newChannel) => {
    if (oldChannel.type === ChannelType.GuildVoice && oldChannel.bitrate !== newChannel.bitrate) {
        try {
            await new Promise(r => setTimeout(r, 1000));
            
            const fetchedLogs = await newChannel.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.ChannelUpdate 
            });
            
            const log = fetchedLogs.entries.first();
            let executor = "ไม่ทราบ";
            // ✅ Fix: เพิ่มการเช็ค log.target ก่อนเรียกใช้
            if (log && log.target && log.target.id === newChannel.id && (Date.now() - log.createdTimestamp) < 10000) {
                executor = log.executor ? log.executor.tag : "ไม่ทราบ";
            }

            const alertChannelId = await getConfig('ALERT_CHANNEL_ID');
            let alertChannel = null;
            if (alertChannelId) alertChannel = await client.channels.fetch(alertChannelId).catch(() => null);

            if (alertChannel) {
                const embed = {
                    color: 0xFFA500, // สีส้ม
                    title: '⚠️ มีการเปลี่ยนแปลง Bitrate ห้องเสียง!',
                    fields: [
                        { name: '🔊 ห้อง', value: `${newChannel.name}`, inline: true },
                        { name: '👤 ผู้ปรับเปลี่ยน', value: `${executor}`, inline: true },
                        { name: '📉 เดิม', value: `${oldChannel.bitrate / 1000} kbps`, inline: true },
                        { name: '📈 ใหม่', value: `${newChannel.bitrate / 1000} kbps`, inline: true },
                    ],
                    timestamp: new Date(),
                    footer: { text: 'Security Monitor' }
                };
                alertChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error("❌ Error Bitrate Monitor:", error);
        }
    }
});

// ==========================================
// 3️⃣ MESSAGE HANDLER (รวม Log, Anti-Spam, Chat Logic, AI)
// ==========================================
client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;

    // --- A. System Log ---
    const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(__dirname, 'logs', `${date}.log`);

    if (!fs.existsSync(path.join(__dirname, 'logs'))) fs.mkdirSync(path.join(__dirname, 'logs'));
    
    const logLine = `[${timestamp}] #${msg.channel.name} (${msg.author.tag}): ${msg.content}\n`;
    fs.appendFile(logFile, logLine, (err) => { if (err) console.error('❌ Log Error:', err); });
    console.log(logLine.trim());

    // --- B. Security: Anti-Spam ---
    if (msg.guild) {
        const userData = spamMap.get(msg.author.id) || { count: 0, lastMsg: 0, timer: null };
        const now = Date.now();

        if (now - userData.lastMsg > SPAM_TIME) {
            userData.count = 0;
            clearTimeout(userData.timer);
        }

        userData.count++;
        userData.lastMsg = now;
        spamMap.set(msg.author.id, userData);

        if (userData.count >= SPAM_LIMIT) {
            msg.delete().catch(() => {});
            if (userData.count === SPAM_LIMIT) {
                logFilterAction({ user: msg.author, channelId: msg.channel.id, reason: 'Anti-Spam (ส่งข้อความถี่เกินกำหนด)', content: msg.content });
                msg.channel.send(`⚠️ <@${msg.author.id}> ใจเย็นๆ ครับ! อย่าส่งข้อความรัวเกินไป`);
                const alertChannelId = await getConfig('ALERT_CHANNEL_ID');
                if (alertChannelId) {
                    const alertChannel = await client.channels.fetch(alertChannelId).catch(() => null);
                    if (alertChannel) alertChannel.send(`🚨 **Anti-Spam:** <@${msg.author.id}> กำลังสแปมในห้อง <#${msg.channel.id}>`);
                }
            }
            return;
        }
    }

    // --- B2. ตรวจลิงก์เชิญเซิร์ฟเวอร์อื่น (เฉพาะบันทึก log ไม่ได้ลบข้อความ) ---
    if (msg.guild) logInvitePosted(msg);

    const contentLower = msg.content.toLowerCase();

    // ====================================================
    // 🤖 C. SMART FILTER: Bad Words (ใช้ AI ตรวจสอบบริบท)
    // ====================================================
    // 1. ตรวจแบบเบสิคก่อน (เพื่อประหยัดโควตา AI)
    const extraBadWords = ['ค', 'ดอ', 'เย็ด']; // คำรุนแรงชัดเจน 100% 
    const isHardcodedBad = extraBadWords.some(w => contentLower === w.toLowerCase());
    
    // คำที่ต้องสงสัย (มีโอกาสเป็นคำหยาบ แต่ต้องดูบริบท)
    const isSuspicious = [...badWordsSet].some(badWord => contentLower.includes(badWord.toLowerCase()));

    // 2. ถ้าเจอคำรุนแรงชัดเจน หรือ เป็นคำต้องสงสัย ให้ AI ช่วยตัดสิน
    if (isHardcodedBad || isSuspicious) {
        
        // ถ้าเป็นคำหยาบชัดเจน ลบเลย ไม่ต้องถาม AI (ประหยัดโควตา)
        if (isHardcodedBad) {
            msg.delete().catch(() => {});
            msg.channel.send(`⚠️ แชทนี้จะสุดยอดเมื่อมีคุณอยู่ (กรุณาสุภาพครับ) <@${msg.author.id}>`);
            logFilterAction({ user: msg.author, channelId: msg.channel.id, reason: 'Bad Words Filter (คำหยาบชัดเจน)', content: msg.content });
            return;
        }

        // ถ้าเป็นคำต้องสงสัย ให้ AI วิเคราะห์
        try {
            const prompt = `
            วิเคราะห์ข้อความต่อไปนี้ว่าเป็นการด่าทอ, คุกคาม, หรือใช้คำหยาบคายในบริบทที่รุนแรงหรือไม่?
            ข้อความ: "${msg.content}"
            
            กติกา:
            - ถ้าเป็นการด่าทอ คุกคาม หรือหยาบคายรุนแรง ให้ตอบแค่คำว่า "BAD"
            - ถ้าเป็นคำหยาบแต่ใช้คุยเล่นกับเพื่อน (เช่น กู มึง บ้าบอ) หรือเป็นบริบทปกติ ให้ตอบแค่คำว่า "PASS"
            
            ตอบแค่ BAD หรือ PASS เท่านั้น ห้ามพิมพ์คำอื่น:
            `;

            const result = await model.generateContent(prompt);
            const analysis = result.response.text().trim().toUpperCase();

            // ถ้า AI ตัดสินว่า BAD ให้ลบ
            if (analysis === "BAD") {
                msg.delete().catch(() => {});
                msg.channel.send(`⚠️ ข้อความของคุณดูรุนแรงไปนิดนึงนะครับ <@${msg.author.id}>`);
                logFilterAction({ user: msg.author, channelId: msg.channel.id, reason: 'Smart Filter (AI ตรวจพบเนื้อหารุนแรง)', content: msg.content });
                
                // แจ้งแอดมินด้วย (Optional)
                // const alertChannel = await client.channels.fetch(ALERT_CHANNEL_ID);
                // if (alertChannel) {
                //     alertChannel.send(`🚨 **Smart Filter:** ลบข้อความของ <@${msg.author.id}> ใน <#${msg.channel.id}>\nข้อความที่โดนลบ: ||${msg.content}||`);
                // }
                return; // จบการทำงาน ไม่ต้องไปทำส่วนอื่นต่อ
            } 
            // ถ้า AI ตอบ PASS (หรือตอบผิดพลาด) ให้ปล่อยผ่าน
            
        } catch (error) {
            console.error("AI Smart Filter Error:", error);
            // ถ้า AI พัง ให้ยึดตามระบบเดิมไปก่อน (เผื่อเหนียว)
            msg.delete().catch(() => {});
            msg.channel.send(`⚠️ แชทนี้จะสุดยอดเมื่อมีคุณอยู่ (กรุณาสุภาพครับ) <@${msg.author.id}>`);
            logFilterAction({ user: msg.author, channelId: msg.channel.id, reason: 'Bad Words Filter (AI ไม่พร้อมใช้งาน — ใช้ระบบสำรอง)', content: msg.content });
            return;
        }
    }

    // ====================================================
    // 🏆 D. LEVEL & XP SYSTEM (ให้ XP เมื่อพิมพ์แชท)
    // ====================================================
    if (msg.guild && !msg.author.bot) {
        const authorId = msg.author.id;
        
        // เช็ค Cooldown (ให้ XP ทุกๆ 1 นาทีเท่านั้น)
        if (!xpCooldownMap.has(authorId)) {
            if (!levelsData[authorId]) {
                levelsData[authorId] = { xp: 0, level: 0 };
            }

            // สุ่ม XP 15-25 หน่วย
            const xpToAdd = Math.floor(Math.random() * 11) + 15;
            levelsData[authorId].xp += xpToAdd;

            // สูตรคำนวณ XP ที่ต้องใช้เพื่ออัปเลเวลถัดไป: 100 * (level + 1)^2
            // Lvl 1 = 100, Lvl 2 = 400, Lvl 3 = 900
            const currentLevel = levelsData[authorId].level;
            const nextLevelXp = 100 * Math.pow(currentLevel + 1, 2);

            if (levelsData[authorId].xp >= nextLevelXp) {
                levelsData[authorId].level += 1;

            }

            // บันทึกข้อมูลลง Database
            saveAllLevelsToDB(levelsData).catch(err => console.error("❌ Error saving levels to DB:", err));

            // ติด Cooldown 1 นาที (60000 ms)
            xpCooldownMap.add(authorId);
            setTimeout(() => {
                xpCooldownMap.delete(authorId);
            }, 60000);
        }
    }

    // ====================================================
    // 🧠 E. AI CHAT SYSTEM (Gemini) + QUOTA CHECK
    // ====================================================
    // เงื่อนไข: ต้องแท็กบอท (@Bot) และไม่ใช่การแท็กทุกคน
    if (msg.mentions.has(client.user) && !msg.mentions.everyone) {

        // 1. เช็ควันใหม่? (ถ้าว้นที่เปลี่ยน ให้รีเซ็ตโควตาเป็น 0)
        const today = new Date().toDateString();
        if (aiUsage.date !== today) {
            aiUsage.date = today;
            aiUsage.count = 0;
            console.log("🔄 รีเซ็ตโควตา AI สำหรับวันใหม่แล้ว");
        }

        // 2. เช็คโควตาหมดหรือยัง?
        if (aiUsage.count >= AI_DAILY_LIMIT) {
            return msg.reply({ 
                content: `🚫 **โควตา AI ประจำวันหมดแล้วครับ!** (${AI_DAILY_LIMIT}/${AI_DAILY_LIMIT})\nระบบจะรีเซ็ตใหม่พรุ่งนี้ครับ หรือใช้คำสั่ง \`/weather\` เช็คอากาศแทนได้ครับ 🌦️`
            });
        }

        // 3. เริ่มประมวลผล
        await msg.channel.sendTyping(); // ขึ้นสถานะ "กำลังพิมพ์..."

        try {
            // ตัดการแท็กชื่อบอทออก ให้เหลือแต่คำถาม
            const question = msg.content.replace(/<@!?[0-9]+>/, '').trim();

            if (!question) {
                return msg.reply("ว่างายยย มีอะไรให้ช่วยมั้ยครับ? 🤖");
            }

            // Prompt Engineering: สั่งบุคลิกบอท
            const prompt = `
            คุณชื่อ Bot_NotStack บอทดูแลความปลอดภัยประจำเซิร์ฟเวอร์
            บุคลิก: กวนนิดๆ, เป็นกันเอง, ตอบสั้นกระชับ, ใช้ Emoji บ้าง
            ห้ามตอบเรื่องผิดกฎหมาย หรือเรื่อง 18+ เด็ดขาด
            User ถามว่า: "${question}"
            `;

            // ส่งให้ Google Gemini
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // 4. ตอบกลับและนับยอด
            // Discord จำกัด 2000 ตัวอักษร
            if (text.length > 2000) {
                msg.reply(text.substring(0, 1990) + "...");
            } else {
                msg.reply(text);
            }

            // เพิ่มจำนวนการใช้งาน
            aiUsage.count++;
            console.log(`🧠 AI Used: ${aiUsage.count}/${AI_DAILY_LIMIT}`);

        } catch (error) {
            console.error("AI Error:", error);
            msg.reply("❌ ตอนนี้สมองผมเบลอ (AI Error) หรือระบบ Google มีปัญหา ลองใหม่ทีหลังนะครับ");
        }
        return;
    }

    // --- D. Auto Reply (Original) ---
    if (msg.content === 'สวัสดีบอท') {
        msg.reply(`สวัสดี <@${msg.author.id}> ครับ`);
    } else if (msg.content === 'Hello bot') {
        msg.reply(`Hello <@${msg.author.id}> 🙋‍♂️`);
    } else if (msg.content.includes('กินข้าวยังบอท')) {
        msg.reply(`กินแล้วครับคุณ <@${msg.author.id}>`);
    } else if (msg.content.includes('หิวข้าว')) {
        msg.reply(`ผมยังไม่หิวครับ แต่คุณหาอะไรทานด้วยนะครับ 🍛`);
    } else if (msg.content.includes('ขอกำลังใจ')) {
        const quotation = [
            "ทำทุกอย่างให้ดีที่สุด แล้วความสำเร็จจะตามมาเองครับ 😊",
            "วันนี้จะเป็นวันดีแน่นอน! 💪",
            "ความฝันจะไม่เกิดขึ้นเลยถ้าไม่ลงมือทำ",
            "เหนื่อยก็พักนะครับ แล้วลุยต่อ!"
        ];
        const randomReply = quotation[Math.floor(Math.random() * quotation.length)];
        msg.reply(randomReply);
    } else if (msg.content === 'จิบรี') {
        msg.reply(`จิบรีครับนาย`);
    }
});

// ==========================================
// 4️⃣ VOICE STATE HANDLER (Anti-Drag & Log)
// ==========================================
client.on('voiceStateUpdate', async (oldState, newState) => {
    const member = newState.member;
    if (member.user.bot) return;

    // Voice Guard: Whitelist check
    if (newState.channelId) {
        const wlChannel = await getWhitelistChannel(newState.channelId);
        if (wlChannel && wlChannel.enabled) {
            const allowedUsers = await getWhitelistUsers(newState.channelId);
            if (!allowedUsers.includes(member.id)) {
                await member.voice.disconnect().catch(() => {});
                await member.send(`❌ คุณไม่ได้อยู่ใน whitelist ของห้อง **${newState.channel?.name || 'ห้องเสียง'}** จึงไม่สามารถเข้าได้`).catch(() => {});
                return;
            }
        }
        // Voice Guard: Blacklist check
        const blChannel = await getBlacklistChannel(newState.channelId);
        if (blChannel && blChannel.enabled) {
            const bannedUsers = await getBlacklistUsers(newState.channelId);
            if (bannedUsers.includes(member.id)) {
                await member.voice.disconnect().catch(() => {});
                await member.send(`🚫 คุณถูกแบนจากห้อง **${newState.channel?.name || 'ห้องเสียง'}** จึงไม่สามารถเข้าได้`).catch(() => {});
                return;
            }
        }
    }

    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        
        // 🚨 START ANTI-FORCE MOVE (กันโดนคนอื่นลาก) 🚨
        try {
            // รอ 1 วินาที เพื่อให้ Audit Log อัปเดต
            await new Promise(r => setTimeout(r, 1000));

            const fetchedLogs = await newState.guild.fetchAuditLogs({
                limit: 5, 
                type: AuditLogEvent.MemberMove
            });

            // STEP 1: หา Log ที่ตรงเป๊ะๆ
            let log = fetchedLogs.entries.find(entry => 
                entry.targetId === member.id && 
                (Date.now() - entry.createdTimestamp) < 10000
            );

            // STEP 2: หา Log สำรอง
            if (!log) {
                log = fetchedLogs.entries.find(entry => 
                    entry.executorId !== member.id && 
                    (Date.now() - entry.createdTimestamp) < 3000
                );
            }

            if (log) {
                const executorId = log.executorId;
                
                // 🛑 กันบอทตีตัวเอง (สำคัญมาก)
                if (executorId === client.user.id) return; 

                const executorTag = log.executor?.tag || "Unknown";
                const targetTag = member.user.tag;

                // ถ้าคนทำไม่ใช่เจ้าตัว -> โดนแกล้ง!
                if (executorId !== member.id) {
                    console.log(`🚨 DETECTED: ${executorTag} dragged ${targetTag}`);

                    // 1. ดึงกลับห้องเดิม
                    if (oldState.channel) {
                        try {
                            await member.voice.setChannel(oldState.channelId);
                            console.log(`🛡️ Auto-Return: ดึงกลับห้องเดิมสำเร็จ`);
                        } catch (err) {
                            console.log(`❌ ดึงกลับไม่ได้: ${err.message}`);
                        }
                    }

                    // 2. จดบัญชีดำ (นับจำนวนครั้ง)
                    const dragData = voiceSpamMap.get(executorId) || { count: 0, timer: null };
                    dragData.count++;
                    if (!dragData.timer) {
                        dragData.timer = setTimeout(() => voiceSpamMap.delete(executorId), 15000);
                    }
                    voiceSpamMap.set(executorId, dragData);

                    // 3. 📝 บันทึกลงไฟล์ .txt แทนการส่งเข้าแชท
                    if (dragData.count >= 2) {
                        const now = new Date();
                        const timestamp = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
                        // ตั้งชื่อไฟล์เป็น abuse_report.log หรือรวมใน log รายวันก็ได้
                        const logFile = path.join(__dirname, 'logs', `abuse_report.log`);

                        if (!fs.existsSync(path.join(__dirname, 'logs'))) fs.mkdirSync(path.join(__dirname, 'logs'));

                        const logMsg = `[${timestamp}] 🚨 ABUSE DETECTED: ${executorTag} (ID: ${executorId}) ลาก ${targetTag} (ID: ${member.id}) ไปมา ${dragData.count} ครั้ง\n`;

                        fs.appendFile(logFile, logMsg, (err) => {
                            if (err) console.error('❌ Error writing abuse log:', err);
                            else console.log('📝 บันทึกพฤติกรรมเกรียนลงไฟล์เรียบร้อย');
                        });
                    }
                    return; 
                }
            }

        } catch (error) {
            console.error("Anti-Force Move Error:", error);
        }
        // 🚨 END ANTI-FORCE MOVE 🚨
    }

    // --- Voice Log (บันทึกการเข้าออกปกติ) ---
    const now = new Date();
    const timestamp = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const logFile = path.join(__dirname, 'logs', `${now.toISOString().split('T')[0]}_history.log`);

    if (!fs.existsSync(path.join(__dirname, 'logs'))) fs.mkdirSync(path.join(__dirname, 'logs'));

    let action = '';
    if (!oldState.channel && newState.channel) {
        action = `✅ ${member.user.username} เข้าห้อง ${newState.channel.name}`;
    } else if (oldState.channel && !newState.channel) {
        action = `❌ ${member.user.username} ออกจากห้อง ${oldState.channel.name}`;
    } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
        action = `🔄 ${member.user.username} ย้ายจากห้อง ${oldState.channel.name} ไปยัง ${newState.channel.name}`;
    }

    if (action) {
        const logLine = `${timestamp} ⏰ ${action}\n`;
        fs.appendFile(logFile, logLine, (err) => { if (err) console.error('Error logging voice:', err); });
        try {
            const logChannelId = await getConfig('LOG_CHANNEL_ID');
            if (logChannelId) {
                const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) await logChannel.send(`📢 ${timestamp} ⏰ ${action}`);
            }
        } catch (error) { console.error("Send Log Error:", error); }
    }
});

// ==========================================
// ==========================================
// 5️⃣ WELCOME / GOODBYE
// ==========================================
client.on(Events.GuildMemberAdd, async member => {
    try {
        const welcomeChannelId = await getConfig('WELCOME_CHANNEL_ID');
        if (!welcomeChannelId) return;
        const channel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
        if (channel) {
            // ใช้ <@${member.id}> เพื่อให้บอทแท็กเรียกคนนั้นเลย
            channel.send(`🎉 ยินดีต้อนรับ <@${member.id}> เข้าสู่เซิร์ฟเวอร์! ขอให้สนุกนะครับ 🥳`);
        }
    } catch (err) {
        console.error("❌ ไม่พบห้อง Welcome:", err);
    }
});

client.on(Events.GuildMemberRemove, async member => {
    try {
        const goodbyeChannelId = await getConfig('GOODBYE_CHANNEL_ID');
        if (!goodbyeChannelId) return;
        const channel = await member.guild.channels.fetch(goodbyeChannelId).catch(() => null);
        if (channel) {
            // ใช้ member.user.username เพื่อแสดงชื่อคนที่ออกไปแล้ว
            channel.send(`📤 คุณ **${member.user.username}** ได้ออกจากเซิร์ฟเวอร์แล้ว โชคดีนะ! 👋`);
        }
    } catch (err) {
        console.error("❌ ไม่พบห้อง Goodbye:", err);
    }
});

// ==========================================
// 7️⃣ SECURITY: CHANNEL REGION MONITOR
// ==========================================
client.on('channelUpdate', async (oldChannel, newChannel) => {
    // เช็คว่าเป็นห้องเสียงไหม + มีการเปลี่ยน Region ไหม
    if (oldChannel.type === ChannelType.GuildVoice && oldChannel.rtcRegion !== newChannel.rtcRegion) {
        console.log(`🌍 Channel Region Changed: ${oldChannel.rtcRegion} -> ${newChannel.rtcRegion}`);

        try {
            await new Promise(r => setTimeout(r, 1000));

            // ดึง Audit Log ของการแก้ห้อง (ChannelUpdate)
            const fetchedLogs = await newChannel.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.ChannelUpdate
            });

            const log = fetchedLogs.entries.first();
            let executor = "ไม่ทราบ";

            // เช็คว่าเป็น Log ของห้องนี้ + เกิดขึ้นเร็วๆ นี้
            if (log && log.target.id === newChannel.id && (Date.now() - log.createdTimestamp) < 10000) {
                 executor = log.executor ? log.executor.tag : "ไม่ทราบ";
            }

            const alertChannelId = await getConfig('ALERT_CHANNEL_ID');
            let alertChannel = null;
            if (alertChannelId) alertChannel = await client.channels.fetch(alertChannelId).catch(() => null);

            if (alertChannel) {
                const oldReg = oldChannel.rtcRegion || "Automatic (อัตโนมัติ)";
                const newReg = newChannel.rtcRegion || "Automatic (อัตโนมัติ)";

                const embed = {
                    color: 0xFF4500, // สีส้มแดง
                    title: '🌍 มีการเปลี่ยน Region ห้องเสียง!',
                    description: `ห้อง **${newChannel.name}** ถูกเปลี่ยนโซนสัญญาณ`,
                    fields: [
                        { name: '🔊 ห้อง', value: `<#${newChannel.id}>`, inline: true },
                        { name: '👤 ผู้เปลี่ยน', value: `${executor}`, inline: true },
                        { name: '❌ เดิม', value: `${oldReg}`, inline: true },
                        { name: '✅ ใหม่', value: `${newReg}`, inline: true },
                    ],
                    timestamp: new Date(),
                    footer: { text: 'Security Monitor' }
                };
                
                alertChannel.send({ embeds: [embed] });
            }

        } catch (error) {
            console.error("❌ Error Channel Region:", error);
        }
    }
});

// ==========================================
// 8️⃣ REACTION ROLES (Carl-bot Style)
// ==========================================
const reactionRolesMap = {
    "4️⃣": "DST04",
    "5️⃣": "DST05",
    "6️⃣": "DST06",
    "✨": "คนหน้าตาดีประจำซีซั่น"
};

client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) {
        try { await reaction.fetch(); } catch (err) { return; }
    }
    if (reaction.message.partial) {
        try { await reaction.message.fetch(); } catch (err) { return; }
    }

    if (reaction.message.author.id !== client.user.id) return;
    if (!reaction.message.guild) return;

    const roleName = reactionRolesMap[reaction.emoji.name];
    if (roleName) {
        const role = reaction.message.guild.roles.cache.find(r => r.name === roleName);
        if (role) {
            const member = await reaction.message.guild.members.fetch(user.id);
            if (member) {
                await member.roles.add(role).catch(console.error);
            }
        }
    }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) {
        try { await reaction.fetch(); } catch (err) { return; }
    }
    if (reaction.message.partial) {
        try { await reaction.message.fetch(); } catch (err) { return; }
    }

    if (reaction.message.author.id !== client.user.id) return;
    if (!reaction.message.guild) return;

    const roleName = reactionRolesMap[reaction.emoji.name];
    if (roleName) {
        const role = reaction.message.guild.roles.cache.find(r => r.name === roleName);
        if (role) {
            const member = await reaction.message.guild.members.fetch(user.id);
            if (member) {
                await member.roles.remove(role).catch(console.error);
            }
        }
    }
});

client.login(process.env.TOKEN);
