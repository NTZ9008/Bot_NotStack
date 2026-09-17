// ==========================================
// 💾 DATABASE (PostgreSQL ผ่าน Prisma)
// โครงสร้างตารางอยู่ใน prisma/schema.prisma — สร้าง/อัปเดตตารางด้วย `npm run db:migrate`
// ฟังก์ชันด้านล่างคืนค่ารูปแบบเดิมตอนใช้ SQLite (เช่น expireAt เป็นเลข ms) โค้ดส่วนอื่นจึงเรียกใช้ได้เหมือนเดิม
// ==========================================
const path = require('path');
const fs = require('fs');
const { prisma } = require('./prisma/client');

const CONFIG_DEFAULTS = [
    { key: 'LOG_CHANNEL_ID', value: '1369338812819312731', description: 'ห้องสำหรับส่ง Log ทั่วไป' },
    { key: 'ALERT_CHANNEL_ID', value: '1333089825376436295', description: 'ห้องสำหรับแจ้งเตือนความปลอดภัย' },
    { key: 'GENERAL_CHANNEL_ID', value: '1273939427575595184', description: 'ห้องสำหรับส่งพยากรณ์อากาศ' },
    { key: 'WELCOME_CHANNEL_ID', value: '1403025308512157746', description: 'ห้อง Welcome' },
    { key: 'GOODBYE_CHANNEL_ID', value: '1403025414447956019', description: 'ห้อง Goodbye' },
    { key: 'NEWS_CHANNEL_ID', value: '', description: 'ห้องสำหรับประกาศข่าวสาร' }
];

// เติมค่า default ที่ยังไม่มี (skipDuplicates = ON CONFLICT DO NOTHING → ไม่ทับค่าที่แอดมินตั้งไว้แล้ว)
async function initDatabase() {
    await prisma.config.createMany({ data: CONFIG_DEFAULTS, skipDuplicates: true });

    // Migrate from levels.json if exists
    const levelsFile = path.join(__dirname, 'levels.json');
    if (fs.existsSync(levelsFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(levelsFile, 'utf8'));
            await prisma.level.createMany({
                data: Object.entries(data).map(([userId, d]) => ({ userId, xp: d.xp, level: d.level })),
                skipDuplicates: true,
            });

            // ถ้าย้ายเสร็จแล้ว เปลี่ยนชื่อไฟล์เพื่อไม่ให้มันโหลดซ้ำ
            fs.renameSync(levelsFile, path.join(__dirname, 'levels_migrated.json'));
            console.log('✅ Migrated levels.json to PostgreSQL database');
        } catch (e) {
            console.error('Error migrating levels:', e);
        }
    }
}
initDatabase().catch(err => console.error('Error initializing database', err));

const getConfig = async (key) => {
    const row = await prisma.config.findUnique({ where: { key }, select: { value: true } });
    return row ? row.value : null;
};

const getAllConfigs = () => prisma.config.findMany({
    select: { key: true, value: true, description: true },
    orderBy: { sortOrder: 'asc' },
});

const updateConfig = async (key, value) => {
    const { count } = await prisma.config.updateMany({ where: { key }, data: { value } });
    return count;
};

// --- Levels Functions ---
const getAllLevels = () => prisma.level.findMany({
    orderBy: [{ level: 'desc' }, { xp: 'desc' }],
});

// เซฟทุกคนใน memory รวดเดียวด้วย query เดียว (INSERT ... ON CONFLICT + UNNEST)
// ถ้าใช้ prisma.level.upsert ทีละคน จะยิงหลาย round trip ไปเซิร์ฟเวอร์ Postgres ทุกครั้งที่มีคนได้ XP
const saveAllLevelsToDB = async (levelsData) => {
    const userIds = Object.keys(levelsData);
    if (userIds.length === 0) return;
    const xps = userIds.map(id => levelsData[id].xp);
    const levels = userIds.map(id => levelsData[id].level);

    await prisma.$executeRaw`
        INSERT INTO levels (user_id, xp, level)
        SELECT * FROM UNNEST(${userIds}::text[], ${xps}::int[], ${levels}::int[])
        ON CONFLICT (user_id) DO UPDATE SET xp = EXCLUDED.xp, level = EXCLUDED.level`;
};

// --- Room Access Functions ---
// expireAt เก็บเป็น timestamptz ใน Postgres แต่ภายนอกยังรับ/คืนเป็นเลข ms (แบบ Date.now()) เหมือนเดิม
const addRoomAccess = async (userId, roomId, expireAt) => {
    const record = await prisma.roomAccess.create({
        data: { userId, roomId, expireAt: new Date(expireAt) },
    });
    return record.id;
};

const removeRoomAccess = async (userId, roomId) => {
    const { count } = await prisma.roomAccess.deleteMany({ where: { userId, roomId } });
    return count;
};

const getActiveRoomAccess = async () => {
    const rows = await prisma.roomAccess.findMany();
    return rows.map(row => ({ ...row, expireAt: row.expireAt.getTime() }));
};

const markRoomAccessNotified = async (id) => {
    const { count } = await prisma.roomAccess.updateMany({ where: { id }, data: { notified: true } });
    return count;
};

const deleteRoomAccessRecord = async (id) => {
    const { count } = await prisma.roomAccess.deleteMany({ where: { id } });
    return count;
};

// ==========================================
// Voice Guard — Whitelist / Blacklist
// สองระบบมีโครงสร้างเหมือนกันทุกอย่าง ต่างกันแค่ตาราง จึงสร้างชุดฟังก์ชันจาก factory เดียว
// ==========================================

// หน้า Dashboard ส่ง enabled มาเป็น 1/0 — แปลงเป็น boolean ให้ตรงกับคอลัมน์ใน Postgres
const toBoolean = (value) => (typeof value === 'boolean' ? value : Boolean(Number(value)));

<<<<<<< Updated upstream
// Migration: เพิ่มคอลัมน์ notify ให้ตารางเดิม (จะ error ถ้ามีอยู่แล้ว — ปล่อยผ่านได้)
db.run(`ALTER TABLE voice_whitelist_channels ADD COLUMN notify INTEGER DEFAULT 1`, () => {});

const getWhitelistChannels = () => new Promise((resolve, reject) => {
    db.all('SELECT * FROM voice_whitelist_channels', [], (err, rows) => err ? reject(err) : resolve(rows));
});
=======
function createVoiceGuardStore(channelTable, userTable) {
    return {
        getChannels: () => channelTable.findMany(),
>>>>>>> Stashed changes

        getChannel: (channelId) => channelTable.findUnique({ where: { channelId } }),

<<<<<<< Updated upstream
// ON CONFLICT: อัปเดตเฉพาะ enabled โดยไม่แตะ notify ที่มีอยู่
const upsertWhitelistChannel = (channelId, enabled = 1) => new Promise((resolve, reject) => {
    db.run('INSERT INTO voice_whitelist_channels (channelId, enabled) VALUES (?, ?) ON CONFLICT(channelId) DO UPDATE SET enabled = excluded.enabled', [channelId, enabled], function(err) {
        err ? reject(err) : resolve(this.changes);
    });
});

const setWhitelistChannelNotify = (channelId, notify = 1) => new Promise((resolve, reject) => {
    db.run('INSERT INTO voice_whitelist_channels (channelId, notify) VALUES (?, ?) ON CONFLICT(channelId) DO UPDATE SET notify = excluded.notify', [channelId, notify], function(err) {
        err ? reject(err) : resolve(this.changes);
    });
});
=======
        upsertChannel: async (channelId, enabled = 1) => {
            const data = { channelId, enabled: toBoolean(enabled) };
            await channelTable.upsert({ where: { channelId }, create: data, update: data });
            return 1;
        },
>>>>>>> Stashed changes

        deleteChannel: async (channelId) => {
            const [, deletedChannels] = await prisma.$transaction([
                userTable.deleteMany({ where: { channelId } }),
                channelTable.deleteMany({ where: { channelId } }),
            ]);
            return deletedChannels.count;
        },

        getUsers: async (channelId) => {
            const rows = await userTable.findMany({ where: { channelId }, select: { userId: true } });
            return rows.map(r => r.userId);
        },

        getAllUsers: () => userTable.findMany(),

        addUser: async (channelId, userId) => {
            const { count } = await userTable.createMany({ data: [{ channelId, userId }], skipDuplicates: true });
            return count;
        },

        removeUser: async (channelId, userId) => {
            const { count } = await userTable.deleteMany({ where: { channelId, userId } });
            return count;
        },
    };
}

<<<<<<< Updated upstream
// ==========================================
// Voice Guard — Blacklist Tables & Functions
// ==========================================
db.run(`CREATE TABLE IF NOT EXISTS voice_blacklist_channels (
    channelId TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 1
)`);

db.run(`CREATE TABLE IF NOT EXISTS voice_blacklist_users (
    channelId TEXT NOT NULL,
    userId TEXT NOT NULL,
    PRIMARY KEY(channelId, userId)
)`);

// Migration: เพิ่มคอลัมน์ notify ให้ตารางเดิม (จะ error ถ้ามีอยู่แล้ว — ปล่อยผ่านได้)
db.run(`ALTER TABLE voice_blacklist_channels ADD COLUMN notify INTEGER DEFAULT 1`, () => {});

const getBlacklistChannels = () => new Promise((resolve, reject) => {
    db.all('SELECT * FROM voice_blacklist_channels', [], (err, rows) => err ? reject(err) : resolve(rows));
});

const getBlacklistChannel = (channelId) => new Promise((resolve, reject) => {
    db.get('SELECT * FROM voice_blacklist_channels WHERE channelId = ?', [channelId], (err, row) => err ? reject(err) : resolve(row));
});

// ON CONFLICT: อัปเดตเฉพาะ enabled โดยไม่แตะ notify ที่มีอยู่
const upsertBlacklistChannel = (channelId, enabled = 1) => new Promise((resolve, reject) => {
    db.run('INSERT INTO voice_blacklist_channels (channelId, enabled) VALUES (?, ?) ON CONFLICT(channelId) DO UPDATE SET enabled = excluded.enabled', [channelId, enabled], function(err) {
        err ? reject(err) : resolve(this.changes);
    });
});

const setBlacklistChannelNotify = (channelId, notify = 1) => new Promise((resolve, reject) => {
    db.run('INSERT INTO voice_blacklist_channels (channelId, notify) VALUES (?, ?) ON CONFLICT(channelId) DO UPDATE SET notify = excluded.notify', [channelId, notify], function(err) {
        err ? reject(err) : resolve(this.changes);
    });
});

const deleteBlacklistChannel = (channelId) => new Promise((resolve, reject) => {
    db.serialize(() => {
        db.run('DELETE FROM voice_blacklist_users WHERE channelId = ?', [channelId]);
        db.run('DELETE FROM voice_blacklist_channels WHERE channelId = ?', [channelId], function(err) {
            err ? reject(err) : resolve(this.changes);
        });
    });
});

const getBlacklistUsers = (channelId) => new Promise((resolve, reject) => {
    db.all('SELECT userId FROM voice_blacklist_users WHERE channelId = ?', [channelId], (err, rows) => {
        err ? reject(err) : resolve(rows.map(r => r.userId));
    });
});

const getAllBlacklistUsers = () => new Promise((resolve, reject) => {
    db.all('SELECT * FROM voice_blacklist_users', [], (err, rows) => err ? reject(err) : resolve(rows));
});

const addBlacklistUser = (channelId, userId) => new Promise((resolve, reject) => {
    db.run('INSERT OR IGNORE INTO voice_blacklist_users (channelId, userId) VALUES (?, ?)', [channelId, userId], function(err) {
        err ? reject(err) : resolve(this.changes);
    });
});

const removeBlacklistUser = (channelId, userId) => new Promise((resolve, reject) => {
    db.run('DELETE FROM voice_blacklist_users WHERE channelId = ? AND userId = ?', [channelId, userId], function(err) {
        err ? reject(err) : resolve(this.changes);
    });
});
=======
const whitelist = createVoiceGuardStore(prisma.voiceWhitelistChannel, prisma.voiceWhitelistUser);
const blacklist = createVoiceGuardStore(prisma.voiceBlacklistChannel, prisma.voiceBlacklistUser);
>>>>>>> Stashed changes

module.exports = {
    prisma, getConfig, getAllConfigs, updateConfig, getAllLevels, saveAllLevelsToDB,
    addRoomAccess, removeRoomAccess, getActiveRoomAccess, markRoomAccessNotified, deleteRoomAccessRecord,
<<<<<<< Updated upstream
    getWhitelistChannels, getWhitelistChannel, upsertWhitelistChannel, setWhitelistChannelNotify, deleteWhitelistChannel,
    getWhitelistUsers, getAllWhitelistUsers, addWhitelistUser, removeWhitelistUser,
    getBlacklistChannels, getBlacklistChannel, upsertBlacklistChannel, setBlacklistChannelNotify, deleteBlacklistChannel,
    getBlacklistUsers, getAllBlacklistUsers, addBlacklistUser, removeBlacklistUser
=======
    getWhitelistChannels: whitelist.getChannels,
    getWhitelistChannel: whitelist.getChannel,
    upsertWhitelistChannel: whitelist.upsertChannel,
    deleteWhitelistChannel: whitelist.deleteChannel,
    getWhitelistUsers: whitelist.getUsers,
    getAllWhitelistUsers: whitelist.getAllUsers,
    addWhitelistUser: whitelist.addUser,
    removeWhitelistUser: whitelist.removeUser,
    getBlacklistChannels: blacklist.getChannels,
    getBlacklistChannel: blacklist.getChannel,
    upsertBlacklistChannel: blacklist.upsertChannel,
    deleteBlacklistChannel: blacklist.deleteChannel,
    getBlacklistUsers: blacklist.getUsers,
    getAllBlacklistUsers: blacklist.getAllUsers,
    addBlacklistUser: blacklist.addUser,
    removeBlacklistUser: blacklist.removeUser,
>>>>>>> Stashed changes
};
