// ==========================================
// 📈 ACTIVITY RECORDER
// บันทึกทุกเหตุการณ์ที่ Log Manager ดักจับได้ลงตาราง activity_events เสมอ
// (ต่างจากการส่ง embed เข้าห้อง Discord ที่ต้องตั้งค่าห้องก่อนถึงจะทำงาน)
// ใช้เป็นแหล่งข้อมูลของ:
//   - หน้า Overview  → กราฟคนเข้า/ออกเซิร์ฟเวอร์, เข้า/ออกห้องเสียง, ใคร active สุด
//   - หน้า Activity Log → ตารางเหตุการณ์ย้อนหลังพร้อมตัวกรอง
// เขียนลง DB แบบรวมเป็นชุด (batch) เพราะ event ของ Discord ยิงถี่มาก
// ==========================================
const { Prisma } = require('@prisma/client');
const { prisma } = require('../prisma/client');
const { LOG_EVENT_MAP, GROUP, COLOR } = require('./events');

// เก็บย้อนหลังกี่วัน (ลบอัตโนมัติโดย cleanup ใน auth/index.js)
const RETENTION_DAYS = Number(process.env.ACTIVITY_LOG_RETENTION_DAYS) || 90;

const FLUSH_DELAY = 2000;   // รอรวม event สักครู่ก่อนเขียนลง DB
const FLUSH_MAX = 100;      // ถ้าค้างถึงจำนวนนี้ เขียนทันทีไม่ต้องรอ
const MAX_ROWS_PER_QUERY = 100000; // เพดานกันดึงข้อมูลหนักเกินไปตอนคำนวณสถิติ

// เหตุการณ์ที่บันทึกเฉพาะในตารางนี้ (ไม่ได้อยู่ในแคตตาล็อกของ Log Manager เพราะไม่ได้ส่งเข้าห้อง Discord)
const EXTRA_EVENTS = {
    messageSent: { label: 'ส่งข้อความ', group: GROUP.MESSAGE, color: COLOR.MEMBER },
    commandUsed: { label: 'ใช้คำสั่งบอท', group: GROUP.MESSAGE, color: COLOR.SECURITY },
};

// จัดกลุ่มเหตุการณ์สำหรับกราฟหน้า Overview
const SERVER_JOIN_KEYS = ['memberJoin'];
const SERVER_LEAVE_KEYS = ['memberLeave', 'memberKick', 'memberBan', 'memberPrune'];
const VOICE_JOIN_KEYS = ['voiceJoin'];
const VOICE_LEAVE_KEYS = ['voiceLeave', 'voiceDisconnected'];
// ย้ายห้อง = ออกจากห้องเดิมแล้วเข้าห้องใหม่ทันที (ใช้ตอนคำนวณเวลาอยู่ในห้องเสียง)
const VOICE_SWITCH_KEYS = ['voiceSwitch', 'voiceMoved'];
const VOICE_KEYS = [...VOICE_JOIN_KEYS, ...VOICE_LEAVE_KEYS, ...VOICE_SWITCH_KEYS];

let clientRef = null;
let enabled = true;

const setClient = (client) => { clientRef = client; };
const isEnabled = () => enabled;
const setEnabled = (value) => { enabled = Boolean(value); };

function eventMeta(eventKey) {
    return LOG_EVENT_MAP.get(eventKey) || EXTRA_EVENTS[eventKey] || null;
}

// แคตตาล็อกให้ Dashboard เอาไปทำ dropdown ตัวกรอง
function listEventTypes() {
    const keys = [...LOG_EVENT_MAP.keys(), ...Object.keys(EXTRA_EVENTS)];
    return keys.map((key) => {
        const meta = eventMeta(key);
        return { key, label: meta?.label || key, group: meta?.group || 'อื่นๆ' };
    });
}

// ==========================================
// 🔤 แปลง mention ของ Discord ให้อ่านออกในหน้าเว็บ
// (<@123> → @ชื่อ, <#123> → #ห้อง, <t:...> → วันเวลา)
// ==========================================
function resolveUserName(id) {
    const user = clientRef?.users?.cache?.get(id);
    return user ? (user.globalName || user.username) : null;
}

function resolveChannelName(id) {
    if (!id) return null;
    const channel = clientRef?.channels?.cache?.get(id);
    return channel?.name || null;
}

function resolveRoleName(id) {
    if (!clientRef?.guilds) return null;
    for (const guild of clientRef.guilds.cache.values()) {
        const role = guild.roles.cache.get(id);
        if (role) return role.name;
    }
    return null;
}

function humanize(text) {
    if (!text) return '';
    return String(text)
        // userLine() ของ Log Manager เขียนเป็น "<@id>\n`tag`" — ยุบให้เหลือชื่อเดียว
        .replace(/<@!?(\d+)>\s*`[^`]*`/g, (_, id) => `@${resolveUserName(id) || id}`)
        .replace(/<@!?(\d+)>/g, (_, id) => `@${resolveUserName(id) || id}`)
        .replace(/<@&(\d+)>/g, (_, id) => `@${resolveRoleName(id) || id}`)
        .replace(/<#(\d+)>/g, (_, id) => `#${resolveChannelName(id) || id}`)
        .replace(/<t:(\d+)(?::[tTdDfFR])?>/g, (_, sec) =>
            new Date(Number(sec) * 1000).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }))
        .replace(/`/g, '')
        .replace(/\s*\n\s*/g, ' · ')
        .trim();
}

const displayName = (user) => (user ? (user.globalName || user.username || user.tag || user.id) : null);

// ชิ้นส่วน SQL ที่ใช้ซ้ำ — ค่าที่ต่อเข้าไปตรงๆ ถูกจำกัดให้เป็นค่าจากรายการที่กำหนดไว้เท่านั้น (ไม่รับค่าดิบจากผู้ใช้)
const INTERVALS = ['hour', 'day'];
const botFilter = (includeBots) => (includeBots ? Prisma.empty : Prisma.sql` AND is_bot = false`);
const safeInterval = (interval) => Prisma.raw(`'${INTERVALS.includes(interval) ? interval : 'day'}'`);
// ชื่อ time zone ผ่าน regex ก่อน (เช่น Asia/Bangkok) — ค่าที่ไม่เข้าเกณฑ์ใช้ค่าเริ่มต้น
const safeTimeZone = (tz) => Prisma.raw(`'${/^[A-Za-z]+(\/[A-Za-z_+-]+){0,2}$/.test(tz || '') ? tz : 'Asia/Bangkok'}'`);

function truncate(value, max) {
    const str = String(value ?? '');
    return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

// ==========================================
// ✍️ บันทึกเหตุการณ์
// ==========================================
const buffer = [];
let flushTimer = null;

/**
 * payload เป็นตัวเดียวกับที่ส่งให้ sendLog() — ฟิลด์ที่ใช้:
 *   context: { userId, isBot, member, channelId }
 *   record:  ข้อมูลเพิ่มที่ call site รู้ดีกว่า เช่น { executor, channelId, userId, user, metadata }
 */
function buildRow(eventKey, payload = {}) {
    const ctx = payload.context || {};
    const extra = payload.record || {};
    const member = ctx.member || extra.member;
    const user = extra.user || member?.user;
    const executor = extra.executor;

    const userId = extra.userId || ctx.userId || user?.id || null;
    const channelId = extra.channelId || ctx.channelId || null;
    const executorId = extra.executorId || executor?.id || null;

    const fields = (payload.fields || [])
        .filter(Boolean)
        .map((f) => ({ name: humanize(f.name), value: truncate(humanize(f.value), 500) }));

    const metadata = { ...(extra.metadata || {}) };
    if (fields.length) metadata.fields = fields;

    return {
        eventKey,
        guildId: extra.guildId || member?.guild?.id || null,
        userId,
        userName: truncate(extra.userName || displayName(user) || (userId ? resolveUserName(userId) : null) || '', 100) || null,
        isBot: Boolean(extra.isBot ?? ctx.isBot ?? user?.bot ?? false),
        channelId,
        channelName: truncate(extra.channelName || resolveChannelName(channelId) || '', 100) || null,
        executorId,
        executorName: truncate(extra.executorName || displayName(executor) || (executorId ? resolveUserName(executorId) : null) || '', 100) || null,
        summary: truncate(humanize(payload.description) || payload.title || eventMeta(eventKey)?.label || eventKey, 500),
        metadata: Object.keys(metadata).length ? metadata : undefined,
        createdAt: new Date(),
    };
}

function record(eventKey, payload) {
    if (!enabled) return;
    try {
        buffer.push(buildRow(eventKey, payload));
    } catch (err) {
        console.error(`❌ Activity (สร้างข้อมูล ${eventKey}):`, err.message);
        return;
    }
    if (buffer.length >= FLUSH_MAX) return void flush();
    if (!flushTimer) {
        flushTimer = setTimeout(flush, FLUSH_DELAY);
        flushTimer.unref?.();
    }
}

async function flush() {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (buffer.length === 0) return;
    const rows = buffer.splice(0, buffer.length);
    try {
        await prisma.activityEvent.createMany({ data: rows });
    } catch (err) {
        console.error('❌ Activity (บันทึกลงฐานข้อมูล):', err.message);
    }
}

// ==========================================
// 🔎 ค้นหาเหตุการณ์ (ตาราง Activity Log — แบ่งหน้าด้วย cursor = id ตัวสุดท้ายของหน้าก่อน)
// ==========================================
function buildWhere({ eventKeys, userId, channelId, q, from, to, includeBots }) {
    const where = {};
    if (eventKeys?.length) where.eventKey = { in: eventKeys };
    if (userId) where.userId = userId;
    if (channelId) where.channelId = channelId;
    if (!includeBots) where.isBot = false;
    if (from || to) where.createdAt = { ...(from && { gte: from }), ...(to && { lte: to }) };
    if (q) {
        where.OR = [
            { userName: { contains: q, mode: 'insensitive' } },
            { executorName: { contains: q, mode: 'insensitive' } },
            { channelName: { contains: q, mode: 'insensitive' } },
            { summary: { contains: q, mode: 'insensitive' } },
            { userId: q },
        ];
    }
    return where;
}

async function queryActivity(filters = {}) {
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const where = buildWhere(filters);
    if (filters.cursor) where.id = { lt: filters.cursor };

    const rows = await prisma.activityEvent.findMany({ where, orderBy: { id: 'desc' }, take: limit + 1 });
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
        ...row,
        label: eventMeta(row.eventKey)?.label || row.eventKey,
        group: eventMeta(row.eventKey)?.group || 'อื่นๆ',
    }));
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

// ==========================================
// 📊 สถิติสำหรับหน้า Overview
// ==========================================

// นับจำนวนเหตุการณ์แยกตามช่วงเวลา (ชั่วโมง/วัน) ตามโซนเวลาที่เลือก
// ให้ Postgres คืนชื่อช่วงเป็นข้อความไปเลย (to_char) จะได้ไม่ต้องแปลงเวลาไปกลับให้เพี้ยน
async function timeSeries({ from, to, interval, includeBots, timeZone }) {
    const rows = await prisma.$queryRaw`
        SELECT to_char(date_trunc(${safeInterval(interval)}, created_at AT TIME ZONE ${safeTimeZone(timeZone)}),
                       'YYYY-MM-DD HH24:00') AS bucket,
               event_key,
               COUNT(*)::int AS total
        FROM activity_events
        WHERE created_at >= ${from}
          AND created_at <= ${to}${botFilter(includeBots)}
        GROUP BY 1, 2
        ORDER BY 1 ASC`;
    return rows.map((row) => ({
        bucket: String(row.bucket),
        eventKey: row.event_key,
        total: Number(row.total),
    }));
}

// ชื่อช่วงเวลาในรูปแบบเดียวกับที่ SQL คืนมา ('YYYY-MM-DD HH:00' ตามโซนเวลาที่เลือก)
function formatBucket(date, timeZone, interval) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
    return `${parts.year}-${parts.month}-${parts.day} ${interval === 'hour' ? parts.hour : '00'}:00`;
}

// เติมช่วงเวลาที่ไม่มีเหตุการณ์ให้ครบ เพื่อให้เส้นกราฟไม่ขาดช่วง
function bucketLabels(from, to, interval, timeZone) {
    const step = interval === 'hour' ? 3600000 : 86400000;
    const labels = [];
    const seen = new Set();
    const push = (date) => {
        const label = formatBucket(date, timeZone, interval);
        if (seen.has(label)) return;
        seen.add(label);
        labels.push(label);
    };

    for (let t = from.getTime(); t <= to.getTime() && labels.length < 2000; t += step) push(new Date(t));
    push(to); // ช่องสุดท้ายต้องครอบคลุมเวลาสิ้นสุดเสมอ
    return labels;
}

// ใครเคลื่อนไหวมากสุด — นับจำนวนเหตุการณ์ทั้งหมด + แยกประเภทที่คนสนใจ
async function topUsers({ from, to, includeBots, limit }) {
    const rows = await prisma.$queryRaw`
        SELECT user_id,
               MAX(user_name) AS user_name,
               bool_or(is_bot) AS is_bot,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE event_key = 'messageSent')::int AS messages,
               COUNT(*) FILTER (WHERE event_key = 'voiceJoin')::int AS voice_joins,
               COUNT(*) FILTER (WHERE event_key = 'commandUsed')::int AS commands,
               MAX(created_at) AS last_seen
        FROM activity_events
        WHERE created_at >= ${from}
          AND created_at <= ${to}
          AND user_id IS NOT NULL${botFilter(includeBots)}
        GROUP BY user_id
        ORDER BY total DESC
        LIMIT ${limit}`;
    return rows.map((row) => ({
        userId: row.user_id,
        userName: row.user_name || row.user_id,
        isBot: row.is_bot,
        total: Number(row.total),
        messages: Number(row.messages),
        voiceJoins: Number(row.voice_joins),
        commands: Number(row.commands),
        lastSeen: row.last_seen,
    }));
}

// ห้องเสียงไหนถูกใช้มากสุด (นับจำนวนครั้งที่มีคนเข้า)
async function topVoiceChannels({ from, to, includeBots, limit }) {
    const rows = await prisma.$queryRaw`
        SELECT channel_id,
               MAX(channel_name) AS channel_name,
               COUNT(*)::int AS joins,
               COUNT(DISTINCT user_id)::int AS members
        FROM activity_events
        WHERE created_at >= ${from}
          AND created_at <= ${to}
          AND channel_id IS NOT NULL
          AND event_key IN ('voiceJoin', 'voiceSwitch', 'voiceMoved')${botFilter(includeBots)}
        GROUP BY channel_id
        ORDER BY joins DESC
        LIMIT ${limit}`;
    return rows.map((row) => ({
        channelId: row.channel_id,
        channelName: row.channel_name || row.channel_id,
        joins: Number(row.joins),
        members: Number(row.members),
    }));
}

/**
 * เวลาที่แต่ละคนอยู่ในห้องเสียง — จับคู่ "เข้า" กับ "ออก" ตามลำดับเวลาของแต่ละคน
 * นับเฉพาะช่วงที่เลือกเท่านั้น (คนที่เข้าห้องอยู่ก่อนช่วงเวลาที่เลือกจะยังไม่ถูกนับจนกว่าจะมี event ใหม่)
 */
async function voiceTime({ from, to, includeBots }) {
    const events = await prisma.activityEvent.findMany({
        where: {
            createdAt: { gte: from, lte: to },
            eventKey: { in: VOICE_KEYS },
            userId: { not: null },
            ...(includeBots ? {} : { isBot: false }),
        },
        select: { userId: true, userName: true, channelId: true, channelName: true, eventKey: true, createdAt: true },
        orderBy: { id: 'asc' },
        take: MAX_ROWS_PER_QUERY,
    });

    const endOfRange = Math.min(to.getTime(), Date.now());
    const open = new Map();       // userId → { at, channelId, channelName }
    const perUser = new Map();    // userId → { userName, ms, sessions }
    const perChannel = new Map(); // channelId → { channelName, ms }

    const close = (userId, at) => {
        const session = open.get(userId);
        if (!session) return;
        open.delete(userId);
        const ms = Math.max(0, Math.min(at, endOfRange) - session.at);
        if (ms <= 0) return;

        const user = perUser.get(userId) || { userName: null, ms: 0, sessions: 0 };
        user.ms += ms;
        user.sessions += 1;
        perUser.set(userId, user);

        if (session.channelId) {
            const channel = perChannel.get(session.channelId) || { channelName: session.channelName, ms: 0 };
            channel.ms += ms;
            if (!channel.channelName) channel.channelName = session.channelName;
            perChannel.set(session.channelId, channel);
        }
    };

    for (const ev of events) {
        const at = ev.createdAt.getTime();
        const isLeave = VOICE_LEAVE_KEYS.includes(ev.eventKey);
        close(ev.userId, at);
        if (!isLeave) open.set(ev.userId, { at, channelId: ev.channelId, channelName: ev.channelName });

        const user = perUser.get(ev.userId) || { userName: null, ms: 0, sessions: 0 };
        if (!user.userName) user.userName = ev.userName;
        perUser.set(ev.userId, user);
    }
    // คนที่ยังอยู่ในห้องตอนสิ้นสุดช่วงเวลา — นับถึงตรงนั้น
    for (const userId of [...open.keys()]) close(userId, endOfRange);

    const users = [...perUser.entries()]
        .map(([userId, v]) => ({ userId, userName: v.userName || userId, minutes: Math.round(v.ms / 60000), sessions: v.sessions }))
        .filter((u) => u.minutes > 0)
        .sort((a, b) => b.minutes - a.minutes);

    const channels = [...perChannel.entries()]
        .map(([channelId, v]) => ({ channelId, channelName: v.channelName || channelId, minutes: Math.round(v.ms / 60000) }))
        .filter((c) => c.minutes > 0)
        .sort((a, b) => b.minutes - a.minutes);

    return { users, channels, truncated: events.length >= MAX_ROWS_PER_QUERY };
}

// สัดส่วนเหตุการณ์แยกตามชนิด (กราฟโดนัท + ยอดรวมด้านบน)
async function eventBreakdown({ from, to, includeBots }) {
    const rows = await prisma.activityEvent.groupBy({
        by: ['eventKey'],
        where: {
            createdAt: { gte: from, lte: to },
            ...(includeBots ? {} : { isBot: false }),
        },
        _count: { _all: true },
        orderBy: { _count: { eventKey: 'desc' } },
    });
    return rows.map((row) => ({
        eventKey: row.eventKey,
        label: eventMeta(row.eventKey)?.label || row.eventKey,
        group: eventMeta(row.eventKey)?.group || 'อื่นๆ',
        total: row._count._all,
    }));
}

const sumKeys = (breakdown, keys) =>
    breakdown.filter((row) => keys.includes(row.eventKey)).reduce((acc, row) => acc + row.total, 0);

async function activityStats({ from, to, interval = 'day', includeBots = false, timeZone = 'Asia/Bangkok', limit = 10 }) {
    const [series, users, channels, breakdown, voice] = await Promise.all([
        timeSeries({ from, to, interval, includeBots, timeZone }),
        topUsers({ from, to, includeBots, limit }),
        topVoiceChannels({ from, to, includeBots, limit }),
        eventBreakdown({ from, to, includeBots }),
        voiceTime({ from, to, includeBots }),
    ]);

    // รวมเป็นชุดข้อมูลที่หน้าเว็บเอาไปวาดกราฟได้เลย
    const labels = bucketLabels(from, to, interval, timeZone);
    const index = new Map(labels.map((label, i) => [label, i]));
    const emptySeries = () => new Array(labels.length).fill(0);
    const datasets = {
        serverJoin: emptySeries(),
        serverLeave: emptySeries(),
        voiceJoin: emptySeries(),
        voiceLeave: emptySeries(),
        total: emptySeries(),
    };

    for (const point of series) {
        const i = index.get(point.bucket);
        if (i === undefined) continue;
        datasets.total[i] += point.total;
        if (SERVER_JOIN_KEYS.includes(point.eventKey)) datasets.serverJoin[i] += point.total;
        else if (SERVER_LEAVE_KEYS.includes(point.eventKey)) datasets.serverLeave[i] += point.total;
        if (VOICE_JOIN_KEYS.includes(point.eventKey)) datasets.voiceJoin[i] += point.total;
        else if (VOICE_LEAVE_KEYS.includes(point.eventKey)) datasets.voiceLeave[i] += point.total;
    }

    const totalEvents = breakdown.reduce((acc, row) => acc + row.total, 0);
    const voiceMinutes = voice.users.reduce((acc, u) => acc + u.minutes, 0);

    return {
        range: { from, to, interval, timeZone, includeBots },
        labels,
        datasets,
        summary: {
            totalEvents,
            serverJoin: sumKeys(breakdown, SERVER_JOIN_KEYS),
            serverLeave: sumKeys(breakdown, SERVER_LEAVE_KEYS),
            voiceJoin: sumKeys(breakdown, VOICE_JOIN_KEYS),
            voiceLeave: sumKeys(breakdown, VOICE_LEAVE_KEYS),
            messages: sumKeys(breakdown, ['messageSent']),
            activeUsers: users.length,
            voiceMinutes,
        },
        topUsers: users,
        topVoiceChannels: channels,
        topVoiceUsers: voice.users.slice(0, limit),
        voiceChannelMinutes: voice.channels.slice(0, limit),
        breakdown: breakdown.slice(0, 15),
        truncated: voice.truncated,
    };
}

// จำนวนเหตุการณ์ทั้งหมดที่เก็บอยู่ + ช่วงเวลาที่มีข้อมูล (ใช้บอกผู้ใช้ว่าเริ่มเก็บตั้งแต่เมื่อไหร่)
async function activityMeta() {
    const [total, oldest] = await Promise.all([
        prisma.activityEvent.count(),
        prisma.activityEvent.findFirst({ orderBy: { id: 'asc' }, select: { createdAt: true } }),
    ]);
    return {
        total,
        since: oldest?.createdAt || null,
        retentionDays: RETENTION_DAYS,
        enabled,
        eventTypes: listEventTypes(),
    };
}

const deleteOldActivityEvents = () =>
    prisma.activityEvent.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000) } },
    });

module.exports = {
    setClient,
    isEnabled,
    setEnabled,
    record,
    flush,
    queryActivity,
    activityStats,
    activityMeta,
    listEventTypes,
    deleteOldActivityEvents,
    RETENTION_DAYS,
};
