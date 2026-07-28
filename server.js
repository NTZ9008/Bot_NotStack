const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const fs = require('fs');
const { getAllConfigs, updateConfig, getAllLevels, getConfig } = require('./db');

const app = express();
const port = process.env.PORT || 3035;
const { EmbedBuilder } = require('discord.js');

// Security Middleware (Helmet + CORS)
app.use(helmet({
    contentSecurityPolicy: false, // ปิดไว้เพื่อให้ดึงรูป/ฟอนต์จากภายนอกได้ง่าย
}));
app.use(cors());
app.use(express.json());

// Session Configuration (ระบบ Login)
app.use(session({
    secret: process.env.SESSION_SECRET || 'super_secret_fallback',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // ถ้าใช้ HTTPS ให้เปลี่ยนเป็น true
        httpOnly: true,
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

// --- HTML Routes ---
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/login', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// --- Auth API ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    // ดึงรหัสจาก .env ถ้าไม่มีค่าให้ใช้ค่าเริ่มต้น
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'adminbot';
    
    if (username === adminUser && password === adminPass) {
        req.session.loggedIn = true;
        res.json({ success: true, message: 'Logged in successfully' });
    } else {
        res.status(401).json({ error: 'รหัสผ่านหรือชื่อผู้ใช้ไม่ถูกต้อง' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
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
        const levels = await getAllLevels();
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
    const filename = req.params.filename;
    // ป้องกัน Directory Traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
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

const startServer = (client) => {
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

    app.listen(port, () => {
        console.log(`🚀 Secure Dashboard Server running on http://localhost:${port}`);
    });
};

module.exports = { startServer };

