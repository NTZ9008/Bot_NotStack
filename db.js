const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        db.run(`CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT,
            description TEXT
        )`, (err) => {
            if (err) {
                console.error('Error creating table', err);
            } else {
                // Initialize default values if not exists
                const defaults = [
                    { key: 'LOG_CHANNEL_ID', value: '1369338812819312731', description: 'ห้องสำหรับส่ง Log ทั่วไป' },
                    { key: 'ALERT_CHANNEL_ID', value: '1333089825376436295', description: 'ห้องสำหรับแจ้งเตือนความปลอดภัย' },
                    { key: 'GENERAL_CHANNEL_ID', value: '1273939427575595184', description: 'ห้องสำหรับส่งพยากรณ์อากาศ' },
                    { key: 'WELCOME_CHANNEL_ID', value: '1403025308512157746', description: 'ห้อง Welcome' },
                    { key: 'GOODBYE_CHANNEL_ID', value: '1403025414447956019', description: 'ห้อง Goodbye' },
                    { key: 'NEWS_CHANNEL_ID', value: '', description: 'ห้องสำหรับประกาศข่าวสาร' }
                ];
                
                const stmt = db.prepare('INSERT OR IGNORE INTO config (key, value, description) VALUES (?, ?, ?)');
                defaults.forEach(item => {
                    stmt.run(item.key, item.value, item.description);
                });
                stmt.finalize();
            }
        });

        // สร้าง Table สำหรับ Levels
        db.run(`CREATE TABLE IF NOT EXISTS levels (
            userId TEXT PRIMARY KEY,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 0
        )`, (err) => {
            if (err) {
                console.error('Error creating levels table', err);
            } else {
                // Migrate from levels.json if exists
                const levelsFile = path.join(__dirname, 'levels.json');
                if (fs.existsSync(levelsFile)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(levelsFile, 'utf8'));
                        const stmt = db.prepare('INSERT OR IGNORE INTO levels (userId, xp, level) VALUES (?, ?, ?)');
                        for (const userId in data) {
                            stmt.run(userId, data[userId].xp, data[userId].level);
                        }
                        stmt.finalize();
                        
                        // ถ้าย้ายเสร็จแล้ว เปลี่ยนชื่อไฟล์เพื่อไม่ให้มันโหลดซ้ำ
                        fs.renameSync(levelsFile, path.join(__dirname, 'levels_migrated.json'));
                        console.log('✅ Migrated levels.json to SQLite database');
                    } catch (e) {
                        console.error('Error migrating levels:', e);
                    }
                }
            }
        });

        // สร้าง Table สำหรับ Room Access แบบมีเวลา
        db.run(`CREATE TABLE IF NOT EXISTS room_access (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT,
            roomId TEXT,
            expireAt INTEGER,
            notified INTEGER DEFAULT 0
        )`, (err) => {
            if (err) console.error('Error creating room_access table', err);
        });
    }
});

const getConfig = (key) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT value FROM config WHERE key = ?', [key], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.value : null);
        });
    });
};

const getAllConfigs = () => {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM config', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const updateConfig = (key, value) => {
    return new Promise((resolve, reject) => {
        db.run('UPDATE config SET value = ? WHERE key = ?', [value, key], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
};

// --- Levels Functions ---
const getAllLevels = () => {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM levels ORDER BY level DESC, xp DESC', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const saveAllLevelsToDB = (levelsData) => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            const stmt = db.prepare('INSERT OR REPLACE INTO levels (userId, xp, level) VALUES (?, ?, ?)');
            for (const userId in levelsData) {
                stmt.run(userId, levelsData[userId].xp, levelsData[userId].level);
            }
            stmt.finalize();
            db.run("COMMIT", (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
};

// --- Room Access Functions ---
const addRoomAccess = (userId, roomId, expireAt) => {
    return new Promise((resolve, reject) => {
        db.run('INSERT INTO room_access (userId, roomId, expireAt) VALUES (?, ?, ?)', [userId, roomId, expireAt], function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
};

const removeRoomAccess = (userId, roomId) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM room_access WHERE userId = ? AND roomId = ?', [userId, roomId], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
};

const getActiveRoomAccess = () => {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM room_access', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const markRoomAccessNotified = (id) => {
    return new Promise((resolve, reject) => {
        db.run('UPDATE room_access SET notified = 1 WHERE id = ?', [id], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
};

const deleteRoomAccessRecord = (id) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM room_access WHERE id = ?', [id], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
};

// ==========================================
// Voice Guard — Whitelist Tables & Functions
// ==========================================
db.run(`CREATE TABLE IF NOT EXISTS voice_whitelist_channels (
    channelId TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 1
)`);

db.run(`CREATE TABLE IF NOT EXISTS voice_whitelist_users (
    channelId TEXT NOT NULL,
    userId TEXT NOT NULL,
    PRIMARY KEY(channelId, userId)
)`);

// Migration: เพิ่มคอลัมน์ notify ให้ตารางเดิม (จะ error ถ้ามีอยู่แล้ว — ปล่อยผ่านได้)
db.run(`ALTER TABLE voice_whitelist_channels ADD COLUMN notify INTEGER DEFAULT 1`, () => {});

const getWhitelistChannels = () => new Promise((resolve, reject) => {
    db.all('SELECT * FROM voice_whitelist_channels', [], (err, rows) => err ? reject(err) : resolve(rows));
});

const getWhitelistChannel = (channelId) => new Promise((resolve, reject) => {
    db.get('SELECT * FROM voice_whitelist_channels WHERE channelId = ?', [channelId], (err, row) => err ? reject(err) : resolve(row));
});

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

const deleteWhitelistChannel = (channelId) => new Promise((resolve, reject) => {
    db.serialize(() => {
        db.run('DELETE FROM voice_whitelist_users WHERE channelId = ?', [channelId]);
        db.run('DELETE FROM voice_whitelist_channels WHERE channelId = ?', [channelId], function(err) {
            err ? reject(err) : resolve(this.changes);
        });
    });
});

const getWhitelistUsers = (channelId) => new Promise((resolve, reject) => {
    db.all('SELECT userId FROM voice_whitelist_users WHERE channelId = ?', [channelId], (err, rows) => {
        err ? reject(err) : resolve(rows.map(r => r.userId));
    });
});

const getAllWhitelistUsers = () => new Promise((resolve, reject) => {
    db.all('SELECT * FROM voice_whitelist_users', [], (err, rows) => err ? reject(err) : resolve(rows));
});

const addWhitelistUser = (channelId, userId) => new Promise((resolve, reject) => {
    db.run('INSERT OR IGNORE INTO voice_whitelist_users (channelId, userId) VALUES (?, ?)', [channelId, userId], function(err) {
        err ? reject(err) : resolve(this.changes);
    });
});

const removeWhitelistUser = (channelId, userId) => new Promise((resolve, reject) => {
    db.run('DELETE FROM voice_whitelist_users WHERE channelId = ? AND userId = ?', [channelId, userId], function(err) {
        err ? reject(err) : resolve(this.changes);
    });
});

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

module.exports = {
    db, getConfig, getAllConfigs, updateConfig, getAllLevels, saveAllLevelsToDB,
    addRoomAccess, removeRoomAccess, getActiveRoomAccess, markRoomAccessNotified, deleteRoomAccessRecord,
    getWhitelistChannels, getWhitelistChannel, upsertWhitelistChannel, setWhitelistChannelNotify, deleteWhitelistChannel,
    getWhitelistUsers, getAllWhitelistUsers, addWhitelistUser, removeWhitelistUser,
    getBlacklistChannels, getBlacklistChannel, upsertBlacklistChannel, setBlacklistChannelNotify, deleteBlacklistChannel,
    getBlacklistUsers, getAllBlacklistUsers, addBlacklistUser, removeBlacklistUser
};
