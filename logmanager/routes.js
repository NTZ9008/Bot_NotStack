// ==========================================
// 🌐 LOG MANAGER API ROUTES
// ใช้ requireApiAuth ตัวเดียวกับ endpoint อื่นๆ ของ Dashboard (ต้อง login ก่อน)
// ==========================================
const { ChannelType } = require('discord.js');
const store = require('./store');
const { GROUP_ORDER } = require('./events');

// ช่องที่ส่งข้อความ log ได้ (ข้ามห้องเสียง / หมวดหมู่ / เธรด)
const SENDABLE_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// ห้อง/หมวดหมู่ที่ใส่ใน ignore list ได้ (กว้างกว่าห้องที่ส่ง log ได้)
const IGNORABLE_TYPES = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum,
    ChannelType.GuildCategory,
];

// แปลง user id เป็นชื่อสำหรับแสดงในหน้า Dashboard (ถ้าหาไม่เจอก็คืน id ไปตามเดิม)
async function resolveUserNames(client, userIds = []) {
    const names = {};
    if (!client) return names;
    for (const id of userIds) {
        const user = client.users.cache.get(id) || await client.users.fetch(id).catch(() => null);
        names[id] = user ? (user.globalName || user.username) : id;
    }
    return names;
}

/**
 * @param {import('express').Express} app
 * @param {Function} requireApiAuth middleware ตรวจ session
 * @param {Function} getClient คืนค่า discord client (อาจยังเป็น null ตอน server เพิ่งบูต)
 */
function registerLogManagerRoutes(app, requireApiAuth, getClient) {
    // อ่านการตั้งค่าทั้งหมด
    app.get('/api/log-settings', requireApiAuth, async (req, res) => {
        try {
            await store.initLogSettings();
            const options = store.listOptions();
            res.json({
                systemEnabled: store.isSystemEnabled(),
                groups: GROUP_ORDER,
                events: store.listSettings(),
                options,
                // ชื่อผู้ใช้ที่อยู่ใน ignore list — หน้าเว็บ list สมาชิกทั้งเซิร์ฟเวอร์เองไม่ได้
                ignoredUserNames: await resolveUserNames(getClient(), options.ignoredUsers),
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // อัปเดตทีละรายการ (Dashboard บันทึกอัตโนมัติเมื่อมีการเปลี่ยนค่า)
    app.post('/api/log-settings', requireApiAuth, async (req, res) => {
        const { key, enabled, channelId, color } = req.body || {};
        if (!key || typeof key !== 'string') {
            return res.status(400).json({ error: 'ต้องระบุ key ของ log event' });
        }
        try {
            await store.initLogSettings();
            const updated = await store.updateSetting(key, { enabled, channelId, color });
            res.json({ success: true, setting: updated });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    // เปิด/ปิดระบบ log ทั้งหมด (สวิตช์ใหญ่มุมขวาบน)
    app.post('/api/log-settings/system', requireApiAuth, async (req, res) => {
        const { enabled } = req.body || {};
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'ต้องระบุ enabled เป็น true หรือ false' });
        }
        try {
            await store.initLogSettings();
            const systemEnabled = await store.setSystemEnabled(enabled);
            res.json({ success: true, systemEnabled });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ตั้งห้องเดียวกันให้ทุกรายการรวดเดียว
    app.post('/api/log-settings/apply-all', requireApiAuth, async (req, res) => {
        const { channelId } = req.body || {};
        try {
            await store.initLogSettings();
            await store.setChannelForAll(channelId || '');
            res.json({ success: true, events: store.listSettings() });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    // ตัวกรองส่วนกลาง: ห้อง/คน/ยศ ที่ไม่ต้อง log + จะ log การกระทำของบอทไหม
    app.post('/api/log-settings/options', requireApiAuth, async (req, res) => {
        try {
            await store.initLogSettings();
            const options = await store.updateOptions(req.body || {});
            res.json({ success: true, options });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    // รายชื่อบทบาท ให้ Dashboard เอาไปทำ dropdown ของ ignore list
    app.get('/api/guild-roles', requireApiAuth, async (req, res) => {
        const client = getClient();
        if (!client) {
            return res.status(503).json({ error: 'บอทยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง' });
        }
        try {
            const roles = [];
            for (const guild of client.guilds.cache.values()) {
                for (const role of guild.roles.cache.values()) {
                    if (role.id === guild.id) continue; // ข้าม @everyone
                    roles.push({ id: role.id, name: role.name, position: role.rawPosition ?? 0 });
                }
            }
            roles.sort((a, b) => b.position - a.position);
            res.json(roles);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // รายชื่อห้องข้อความในเซิร์ฟเวอร์ ให้ Dashboard เอาไปทำ dropdown
    app.get('/api/guild-channels', requireApiAuth, async (req, res) => {
        const client = getClient();
        if (!client) {
            return res.status(503).json({ error: 'บอทยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง' });
        }
        try {
            const channels = [];
            for (const guild of client.guilds.cache.values()) {
                for (const channel of guild.channels.cache.values()) {
                    if (!IGNORABLE_TYPES.includes(channel.type)) continue;
                    channels.push({
                        id: channel.id,
                        name: channel.name,
                        category: channel.parent?.name || 'ไม่มีหมวดหมู่',
                        position: channel.rawPosition ?? 0,
                        guildName: guild.name,
                        // ห้องที่ "ส่ง log เข้าไปได้" มีแค่ห้องข้อความ ส่วน ignore list เลือกได้ทุกแบบ
                        sendable: SENDABLE_TYPES.includes(channel.type),
                        isCategory: channel.type === ChannelType.GuildCategory,
                    });
                }
            }
            channels.sort((a, b) => a.category.localeCompare(b.category) || a.position - b.position);
            res.json(channels);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}

module.exports = { registerLogManagerRoutes };
