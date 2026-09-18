const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { getAllConfigs, updateConfig, getAllLevels, getConfig, addRoomAccess, removeRoomAccess, getActiveRoomAccess, markRoomAccessNotified, deleteRoomAccessRecord,
    getWhitelistChannels, upsertWhitelistChannel, setWhitelistChannelNotify, deleteWhitelistChannel, getWhitelistUsers, addWhitelistUser, removeWhitelistUser,
    getBlacklistChannels, upsertBlacklistChannel, setBlacklistChannelNotify, deleteBlacklistChannel, getBlacklistUsers, addBlacklistUser, removeBlacklistUser
} = require('./db');
const { registerLogManagerRoutes } = require('./logmanager/routes');
const schedule = require('node-schedule');

const app = express();
const port = process.env.PORT || 3035;
const { EmbedBuilder } = require('discord.js');
let discordClient = null;

// Security Middleware (Helmet + CORS)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://static.cloudflareinsights.com"],
            "script-src-attr": ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://cdn.discordapp.com"],
            connectSrc: ["'self'", "https://notstackutdash.arlifzs.site", "https://cloudflareinsights.com"]
        }
    }
}));
app.use(cors({
    origin: function(origin, callback) {
        // ถ้าไม่ใช่ production หรือตรงกับ DASHBOARD_URL หรือเรียกจาก Postman/ตัวเอง(ไม่มี origin) ให้อนุญาต
        if (process.env.NODE_ENV !== 'production' || !origin || origin === (process.env.DASHBOARD_URL || 'https://notstackutdash.arlifzs.site')) {
            callback(null, true);
        } else {
            callback(new Error('ไม่อนุญาตโดย CORS Policy'));
        }
    },
    credentials: true
}));

// Rate Limiting (ป้องกัน Brute Force ทั่วไปและการโจมตี)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 นาที
    max: 5, // จำกัด 5 ครั้งต่อ IP
    message: { error: 'คุณพยายามเข้าสู่ระบบผิดพลาดบ่อยเกินไป กรุณารอสักครู่' }
});

// PR Bot: ต้องมาก่อน express.json() เพื่อให้ signature verify ด้วย raw body ได้
app.use('/webhook', require('./prbot/routes/github'));

app.use(express.json());

app.set('trust proxy', 1); // Trust first proxy (Nginx)

// Session Configuration (ระบบ Login)
app.use(session({
    secret: process.env.SESSION_SECRET || 'super_secret_fallback',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // ถ้าใช้ HTTPS ควรให้เป็น true
        httpOnly: true,
        sameSite: 'strict', // ป้องกัน CSRF
        maxAge: 1000 * 60 * 60 * 24 // ล็อกอินอยู่ได้ 1 วัน
    }
}));

// Serve static assets (เฉพาะ CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Middleware เช็คสิทธิ์การเข้าถึง
const requireAuth = (req, res, next) => {
    if (req.session.loggedIn) {
        next();
    } else {
        res.redirect('/login');
    }
};

const requireApiAuth = (req, res, next) => {
    if (req.session.loggedIn) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized. Please login.' });
    }
};

const pkgVersion = require('./package.json').version;

// --- HTML Routes ---
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/login', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// --- Auth API ---
app.post('/api/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    
    const adminUser = process.env.ADMIN_USERNAME;
    const adminPassHash = process.env.ADMIN_PASSWORD;
    
    if (!adminUser || !adminPassHash) {
        return res.status(500).json({ error: 'ระบบยังไม่ได้ตั้งค่ารหัสผ่านผู้ดูแลระบบใน .env (ADMIN_USERNAME / ADMIN_PASSWORD)' });
    }
    
    if (username === adminUser) {
        const isMatch = await bcrypt.compare(password, adminPassHash);
        if (isMatch) {
            req.session.loggedIn = true;
            return res.json({ success: true, message: 'Logged in successfully' });
        }
    }
    
    res.status(401).json({ error: 'รหัสผ่านหรือชื่อผู้ใช้ไม่ถูกต้อง' });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

// --- Version API ---
app.get('/api/version', requireApiAuth, (req, res) => {
    res.json({ version: pkgVersion });
});

// --- Config API (Protected) ---
app.get('/api/config', requireApiAuth, async (req, res) => {
    try {
        const configs = await getAllConfigs();
        res.json(configs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/config', requireApiAuth, async (req, res) => {
    const { key, value } = req.body;
    if (!key || !value) {
        return res.status(400).json({ error: 'Key and value are required' });
    }
    try {
        const changes = await updateConfig(key, value);
        if (changes > 0) {
            res.json({ success: true, message: 'Config updated successfully' });
        } else {
            res.status(404).json({ error: 'Config key not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Levels API ---
app.get('/api/levels', requireApiAuth, async (req, res) => {
    try {
        let levels = await getAllLevels();
        
        if (discordClient) {
            levels = await Promise.all(levels.map(async (lvl) => {
                let username = 'Unknown User';
                try {
                    let user = discordClient.users.cache.get(lvl.userId);
                    if (!user) {
                        user = await discordClient.users.fetch(lvl.userId).catch(() => null);
                    }
                    if (user) {
                        username = user.globalName || user.username;
                    }
                } catch(e) {}
                
                return {
                    ...lvl,
                    username
                };
            }));
        }

        res.json(levels);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Logs API ---
app.get('/api/logs', requireApiAuth, (req, res) => {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
        return res.json([]);
    }
    fs.readdir(logsDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Error reading logs directory' });
        // คืนค่าเฉพาะไฟล์ .log และเรียงจากใหม่ไปเก่า
        const logFiles = files.filter(f => f.endsWith('.log')).sort().reverse();
        res.json(logFiles);
    });
});

app.get('/api/logs/:filename', requireApiAuth, (req, res) => {
    // ป้องกัน Directory Traversal
    const filename = path.basename(req.params.filename);
    
    if (!filename.endsWith('.log')) {
        return res.status(400).json({ error: 'Invalid file type' });
    }
    
    const filePath = path.join(__dirname, 'logs', filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Log file not found' });
    }
    
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Error reading log file' });
        res.send(data);
    });
});

// --- Log Manager API (ตั้งค่าว่าจะติดตาม log อะไร ส่งเข้าห้องไหน สีอะไร) ---
registerLogManagerRoutes(app, requireApiAuth, () => discordClient);

const startServer = (client) => {
    discordClient = client;
    // PR Bot: ส่งต่อ client ตัวเดียวกับที่บอทหลักใช้ ให้ webhook handler เอาไปส่งข้อความได้
    require('./prbot/discordClient').setClient(client);

    // --- News Notification API ---
    app.post('/api/news', requireApiAuth, async (req, res) => {
        const { type, title, content } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content are required' });
        }
        
        try {
            const newsChannelId = await getConfig('NEWS_CHANNEL_ID');
            if (!newsChannelId) {
                return res.status(400).json({ error: 'ไม่ได้ตั้งค่า NEWS_CHANNEL_ID ใน Configuration' });
            }
            
            const channel = client.channels.cache.get(newsChannelId) || await client.channels.fetch(newsChannelId).catch(() => null);
            if (!channel) {
                return res.status(404).json({ error: 'หาห้องดิสคอร์ดปลายทางไม่พบ กรุณาเช็คไอดีห้องอีกครั้ง' });
            }
            
            let embedColor = '#3B82F6'; // Blue
            let titlePrefix = '📰';
            if (type === 'urgent') {
                embedColor = '#EF4444'; // Red
                titlePrefix = '🚨';
            }
            
            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`${titlePrefix} ${title}`)
                .setDescription(content)
                .setFooter({ text: 'NotStack News Delivery' })
                .setTimestamp();
                
            await channel.send({ embeds: [embed] });
            res.json({ success: true, message: 'ส่งข่าวสารสำเร็จ' });
        } catch (err) {
            console.error('Error sending news:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // --- Room Access API ---
    app.post('/api/grant-access', requireApiAuth, async (req, res) => {
        const { userId, roomId, action, duration } = req.body;
        if (!userId || !roomId || !action) {
            return res.status(400).json({ error: 'User ID, Room ID, and Action are required' });
        }

        try {
            const targetRooms = roomId === 'all' 
                ? ['1475009551475675299', '1430932852928680059', '1420442631120490667', '1383415462158929990'] 
                : [roomId];

            let successCount = 0;
            let errors = [];

            for (const id of targetRooms) {
                try {
                    const channel = await client.channels.fetch(id).catch(() => null);
                    if (!channel) {
                        errors.push(`หาห้อง ${id} ไม่พบ`);
                        continue;
                    }
                    
                    if (action === 'grant') {
                        await channel.permissionOverwrites.edit(userId, {
                            ViewChannel: true,
                            ReadMessageHistory: true,
                            Connect: true,
                            Speak: true,
                            SendMessages: true
                        }, { type: 1 });
                        
                        // Clear old records if any
                        await removeRoomAccess(userId, id);
                        
                        // If duration provided, save to DB
                        if (duration && duration > 0) {
                            const expireAt = Date.now() + (duration * 60 * 1000); // duration is in minutes
                            await addRoomAccess(userId, id, expireAt);
                            
                            // Send DM with native Discord countdown
                            try {
                                const userObj = await client.users.fetch(userId).catch(() => null);
                                if (userObj) {
                                    const unixTime = Math.floor(expireAt / 1000);
                                    await userObj.send(`🎫 คุณได้รับตั๋วเข้าห้อง **${channel.name}** แล้ว (หมดเวลา: <t:${unixTime}:R>)`).catch(() => {});
                                }
                            } catch (dmErr) {
                                console.error('Cannot send DM to user:', dmErr);
                            }
                        }
                    } else if (action === 'revoke') {
                        await channel.permissionOverwrites.delete(userId);
                        await removeRoomAccess(userId, id);
                    }
                    
                    successCount++;
                } catch (e) {
                    errors.push(`เกิดข้อผิดพลาดกับห้อง ${id}: ${e.message}`);
                }
            }

            if (successCount === 0 && errors.length > 0) {
                return res.status(500).json({ error: errors.join(', ') });
            }

            const actionText = action === 'grant' ? 'ให้สิทธิ์' : 'ถอนสิทธิ์';
            res.json({ success: true, message: `${actionText}สำเร็จ ${successCount} ห้อง`, errors: errors.length > 0 ? errors : undefined });
        } catch (err) {
            console.error('Error granting access:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // --- Room Access List API ---
    app.get('/api/room-access-list', requireApiAuth, async (req, res) => {
        try {
            const targetRooms = ['1475009551475675299', '1430932852928680059', '1420442631120490667', '1383415462158929990'];
            const activeAccess = await getActiveRoomAccess();
            
            let resultList = [];

            for (const roomId of targetRooms) {
                // Use force: true to bypass cache and get the latest overwrites
                const channel = await client.channels.fetch(roomId, { force: true }).catch(() => null);
                if (!channel) continue;

                // 1 = Member (User) in Discord.js v14 OverwriteType
                const overwrites = channel.permissionOverwrites.cache.filter(o => o.type === 1 || o.type === 'member');
                
                for (const [userId, overwrite] of overwrites) {
                    if (overwrite.allow.has('ViewChannel')) {
                        let username = userId;
                        let avatar = null;
                        try {
                            const u = await client.users.fetch(userId);
                            username = u.globalName || u.username;
                            avatar = u.displayAvatarURL({ size: 64 });
                        } catch (e) {}

                        const tempRecord = activeAccess.find(r => r.userId === userId && r.roomId === roomId);
                        
                        resultList.push({
                            userId,
                            username,
                            avatar,
                            roomId,
                            roomName: channel.name,
                            type: tempRecord ? 'temporary' : 'permanent',
                            expireAt: tempRecord ? tempRecord.expireAt : null
                        });
                    }
                }
            }

            res.json(resultList);
        } catch (err) {
            console.error('Error fetching room access list:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Check for room access expiry every 5 seconds for precise revocation
    setInterval(async () => {
        try {
            const activeAccess = await getActiveRoomAccess();
            const now = Date.now();
            const notifyBefore = 5 * 60 * 1000; // 5 minutes

            for (const record of activeAccess) {
                // 1. Check if expired
                if (now >= record.expireAt) {
                    try {
                        const channel = await client.channels.fetch(record.roomId).catch(() => null);
                        if (channel) {
                            await channel.permissionOverwrites.delete(record.userId).catch(() => {});
                            
                            // Send expiration message
                            const user = await client.users.fetch(record.userId).catch(() => null);
                            if (user) {
                                user.send(`❌ ตั๋วเข้าห้อง **${channel.name}** ของคุณหมดเวลาแล้ว`).catch(() => {});
                            }
                        }
                        await deleteRoomAccessRecord(record.id);
                    } catch (e) {
                        console.error('Error expiring room access:', e);
                    }
                } 
                // 2. Check if near expiry and not notified
                else if (!record.notified && (record.expireAt - now) <= notifyBefore) {
                    try {
                        const channel = await client.channels.fetch(record.roomId).catch(() => null);
                        const user = await client.users.fetch(record.userId).catch(() => null);
                        if (user && channel) {
                            user.send(`⚠️ ตั๋วเข้าห้อง **${channel.name}** ของคุณกำลังจะหมดเวลา!`).catch(() => {});
                            await markRoomAccessNotified(record.id);
                        }
                    } catch (e) {
                        console.error('Error notifying room access expiry:', e);
                    }
                }
            }
        } catch (error) {
            console.error('Error in room access schedule task:', error);
        }
    }, 5000);

    // ==========================================
    // Voice Guard API — Search Members & Voice Channels
    // ==========================================
    app.get('/api/search-members', requireApiAuth, async (req, res) => {
        const query = (req.query.q || '').trim().toLowerCase();
        if (!query || query.length < 1) return res.json([]);
        try {
            const guild = client.guilds.cache.first();
            if (!guild) return res.json([]);
            const fetched = await guild.members.fetch({ query, limit: 15 });
            const results = fetched.filter(m => !m.user.bot).map(m => ({
                userId: m.id,
                username: m.user.globalName || m.user.username,
                tag: m.user.username,
                avatar: m.user.displayAvatarURL({ size: 64 }),
                nickname: m.nickname || null
            }));
            res.json(results);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/voice-channels', requireApiAuth, async (req, res) => {
        try {
            const guild = client.guilds.cache.first();
            if (!guild) return res.json([]);
            const channels = guild.channels.cache
                .filter(c => c.type === 2)
                .map(c => ({ id: c.id, name: c.name }))
                .sort((a, b) => a.name.localeCompare(b.name));
            res.json(channels);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==========================================
    // Voice Guard API — Whitelist
    // ==========================================
    async function resolveUserInfos(userIds, guild) {
        const result = [];
        for (const userId of userIds) {
            let username = userId;
            let avatar = `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`;
            try {
                let user = client.users.cache.get(userId);
                if (!user) user = await client.users.fetch(userId).catch(() => null);
                if (user) {
                    username = user.globalName || user.username;
                    avatar = user.displayAvatarURL({ size: 64 });
                }
            } catch (e) {}
            result.push({ userId, username, avatar });
        }
        return result;
    }

    app.get('/api/whitelist', requireApiAuth, async (req, res) => {
        try {
            const channels = await getWhitelistChannels();
            const guild = client.guilds.cache.first();
            const result = [];
            for (const ch of channels) {
                const userIds = await getWhitelistUsers(ch.channelId);
                const users = await resolveUserInfos(userIds, guild);
                let channelName = ch.channelId;
                if (guild) {
                    const dc = guild.channels.cache.get(ch.channelId);
                    if (dc) channelName = dc.name;
                }
                result.push({ channelId: ch.channelId, channelName, enabled: ch.enabled, notify: ch.notify, users });
            }
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/whitelist/channel', requireApiAuth, async (req, res) => {
        const { channelId, enabled, notify } = req.body;
        if (!channelId) return res.status(400).json({ error: 'channelId required' });
        try {
            if (notify !== undefined) {
                await setWhitelistChannelNotify(channelId, notify);
            } else {
                await upsertWhitelistChannel(channelId, enabled !== undefined ? enabled : 1);
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/whitelist/channel/delete', requireApiAuth, async (req, res) => {
        try {
            await deleteWhitelistChannel(req.body.channelId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/whitelist/user', requireApiAuth, async (req, res) => {
        const { channelId, userId } = req.body;
        if (!channelId || !userId) return res.status(400).json({ error: 'channelId and userId required' });
        try {
            await addWhitelistUser(channelId, userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/whitelist/user/delete', requireApiAuth, async (req, res) => {
        const { channelId, userId } = req.body;
        if (!channelId || !userId) return res.status(400).json({ error: 'channelId and userId required' });
        try {
            await removeWhitelistUser(channelId, userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==========================================
    // Voice Guard API — Blacklist
    // ==========================================
    app.get('/api/blacklist', requireApiAuth, async (req, res) => {
        try {
            const channels = await getBlacklistChannels();
            const guild = client.guilds.cache.first();
            const result = [];
            for (const ch of channels) {
                const userIds = await getBlacklistUsers(ch.channelId);
                const users = await resolveUserInfos(userIds, guild);
                let channelName = ch.channelId;
                if (guild) {
                    const dc = guild.channels.cache.get(ch.channelId);
                    if (dc) channelName = dc.name;
                }
                result.push({ channelId: ch.channelId, channelName, enabled: ch.enabled, notify: ch.notify, users });
            }
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/blacklist/channel', requireApiAuth, async (req, res) => {
        const { channelId, enabled, notify } = req.body;
        if (!channelId) return res.status(400).json({ error: 'channelId required' });
        try {
            if (notify !== undefined) {
                await setBlacklistChannelNotify(channelId, notify);
            } else {
                await upsertBlacklistChannel(channelId, enabled !== undefined ? enabled : 1);
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/blacklist/channel/delete', requireApiAuth, async (req, res) => {
        try {
            await deleteBlacklistChannel(req.body.channelId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/blacklist/user', requireApiAuth, async (req, res) => {
        const { channelId, userId } = req.body;
        if (!channelId || !userId) return res.status(400).json({ error: 'channelId and userId required' });
        try {
            await addBlacklistUser(channelId, userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/blacklist/user/delete', requireApiAuth, async (req, res) => {
        const { channelId, userId } = req.body;
        if (!channelId || !userId) return res.status(400).json({ error: 'channelId and userId required' });
        try {
            await removeBlacklistUser(channelId, userId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.listen(port, () => {
        console.log(`🚀 Secure Dashboard Server running on http://localhost:${port}`);
    });
};

module.exports = { startServer };

