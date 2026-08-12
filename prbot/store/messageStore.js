const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// เก็บแยกจาก database.sqlite เดิมของบอทหลัก เพื่อไม่ให้ยุ่งกับ schema เดิม
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'messages.sqlite');
const db = new sqlite3.Database(dbPath);

db.run(`CREATE TABLE IF NOT EXISTS pr_messages (
    repoFullName TEXT NOT NULL,
    prNumber INTEGER NOT NULL,
    channelId TEXT NOT NULL,
    messageId TEXT NOT NULL,
    PRIMARY KEY (repoFullName, prNumber)
)`);

function saveMessage(repoFullName, prNumber, channelId, messageId) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR REPLACE INTO pr_messages (repoFullName, prNumber, channelId, messageId) VALUES (?, ?, ?, ?)`,
            [repoFullName, prNumber, channelId, messageId],
            (err) => (err ? reject(err) : resolve())
        );
    });
}

function getMessage(repoFullName, prNumber) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT channelId, messageId FROM pr_messages WHERE repoFullName = ? AND prNumber = ?`,
            [repoFullName, prNumber],
            (err, row) => (err ? reject(err) : resolve(row || null))
        );
    });
}

module.exports = { saveMessage, getMessage };
