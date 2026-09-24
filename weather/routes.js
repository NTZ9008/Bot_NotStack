// ==========================================
// 🌐 WEATHER API ROUTES — ADMIN เท่านั้น
// ใช้แค่ GET/POST เหมือน API อื่น เพราะชั้นหน้าเว็บจริง (Cloudflare / web server) ตอบ 403 กับ PATCH / DELETE
// GET  /api/weather/meta        ค่าคงที่สำหรับสร้างฟอร์ม
// GET  /api/weather/settings    การตั้งค่าปัจจุบัน + เวลาส่งครั้งถัดไป + ผลการส่งครั้งล่าสุด
// POST /api/weather/settings    บันทึก (ส่งมาเฉพาะฟิลด์ที่แก้ก็ได้ เช่นสวิตช์เปิด/ปิดส่งมาแค่ enabled)
// GET  /api/weather/locations   ค้นหาสถานที่ (?q=ชื่อ หรือพิกัด)
// POST /api/weather/preview     สร้างตัวอย่างจากค่าที่กำลังแก้ (ยังไม่บันทึก)
// GET  /api/weather/radar/:key  รูปแผนที่เรดาร์ของตัวอย่างล่าสุด (GIF ใหญ่เกินจะยัดลง JSON)
// POST /api/weather/test        ส่งรายงานจากค่าที่กำลังแก้เข้าห้องจริงทันที
// ==========================================
const store = require('./store');
const { LIMITS, FIELDS, PLACEHOLDERS, CHART_HOURS, RADAR_ZOOMS, SCHEDULE_TIMEZONE, defaultOptions, normalizeOptions } = require('./options');
const { searchLocations, fetchWeather } = require('./api');
const { buildWeatherReport, hasEmbedBody, attachesFiles } = require('./report');
const { getRenderedRadar } = require('./radar');
const { scheduleReport, sendWeatherReport, resolveReportChannel, nextRunAt } = require('./index');

const SNOWFLAKE = /^\d{5,25}$/;

// error ที่ตั้งใจส่งกลับให้ผู้ใช้อ่าน (ข้อความภาษาไทย + status code)
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
        this.expose = true;
    }
}

const auditAs = (action) => (req, res, next) => {
    res.locals.auditAction = action;
    next();
};

// POST ที่แค่สร้างตัวอย่าง ไม่ได้แก้ข้อมูล — ไม่ต้องลง audit log (ถูกเรียกทุกครั้งที่แก้ค่าในฟอร์ม)
const skipAudit = (req, res, next) => {
    res.locals.skipAudit = true;
    next();
};

// error จาก OpenWeatherMap / ห้อง Discord มีข้อความภาษาไทยอยู่แล้ว (expose) — ส่งต่อให้หน้าเว็บได้เลย
function sendError(res, err, fallbackMessage) {
    if (err.expose) return res.status(err.status || 400).json({ error: err.message });
    console.error(`[Weather] ${fallbackMessage}:`, err);
    res.status(500).json({ error: fallbackMessage });
}

// ตรวจค่าที่ส่งมาจากหน้าเว็บ — คืนเฉพาะฟิลด์ที่ส่งมา
function parseSettingsInput(body) {
    const src = body && typeof body === 'object' ? body : {};
    const data = {};
    if (src.enabled !== undefined) {
        if (typeof src.enabled !== 'boolean') throw new HttpError(400, 'enabled ต้องเป็น true หรือ false');
        data.enabled = src.enabled;
    }
    if (src.channelId !== undefined) {
        const channelId = String(src.channelId || '').trim();
        if (channelId && !SNOWFLAKE.test(channelId)) throw new HttpError(400, 'Channel ID ไม่ถูกต้อง');
        data.channelId = channelId;
    }
    if (src.content !== undefined) {
        const content = String(src.content ?? '');
        if (content.length > LIMITS.maxContentLength) throw new HttpError(400, `ข้อความยาวเกิน ${LIMITS.maxContentLength} ตัวอักษร`);
        data.content = content;
    }
    if (src.options !== undefined) data.options = normalizeOptions(src.options);
    return data;
}

function assertValid(settings) {
    if (!hasEmbedBody(settings.options)) {
        throw new HttpError(400, 'รายงานว่างเปล่า — ต้องมีหัวข้อ รายละเอียด ช่องข้อมูล กราฟ หรือเรดาร์ อย่างน้อย 1 อย่าง');
    }
    if (!settings.enabled) return;
    if (!settings.channelId) throw new HttpError(400, 'ต้องเลือกห้องที่จะส่งก่อนเปิดใช้งาน');
    if (!settings.options.schedule.days.length) throw new HttpError(400, 'ต้องเลือกวันที่จะส่งอย่างน้อย 1 วันก่อนเปิดใช้งาน');
}

const view = (settings) => ({ ...settings, nextRunAt: nextRunAt() });

/**
 * @param {import('express').Express} app
 * @param {Function} requireAdmin
 * @param {Function} getClient คืนค่า discord client (อาจยังไม่พร้อมตอนเซิร์ฟเวอร์เพิ่งเปิด)
 */
function registerWeatherRoutes(app, requireAdmin, getClient) {
    app.get('/api/weather/meta', requireAdmin, (req, res) => {
        const botUser = getClient()?.user;
        res.json({
            // ใช้ทำกรอบข้อความจำลองแบบ Discord ในหน้าตัวอย่าง
            bot: botUser ? { name: botUser.displayName || botUser.username, avatar: botUser.displayAvatarURL({ size: 64 }) } : null,
            apiKeyConfigured: Boolean(process.env.OPENWEATHER_KEY),
            timezone: SCHEDULE_TIMEZONE,
            fields: FIELDS,
            placeholders: PLACEHOLDERS,
            chartHours: CHART_HOURS,
            radarZooms: RADAR_ZOOMS,
            limits: LIMITS,
            defaultOptions: defaultOptions(),
        });
    });

    app.get('/api/weather/settings', requireAdmin, async (req, res) => {
        try {
            res.json(view(await store.getSettings()));
        } catch (err) {
            sendError(res, err, 'โหลดการตั้งค่ารายงานสภาพอากาศไม่สำเร็จ');
        }
    });

    app.post('/api/weather/settings', requireAdmin, auditAs('weather.settings_update'), async (req, res) => {
        try {
            const current = await store.getSettings();
            const data = parseSettingsInput(req.body);
            assertValid({ ...current, ...data });

            const settings = await store.updateSettings(data);
            scheduleReport(settings);

            // เตือน (แต่ไม่ห้ามบันทึก) ถ้าห้องที่เลือกบอทส่งเข้าไปไม่ได้ — แอดมินอาจไปแก้สิทธิ์ใน Discord ทีหลัง
            let warning = null;
            const client = getClient();
            if (settings.enabled && client?.isReady()) {
                warning = await resolveReportChannel(client, settings.channelId, attachesFiles(settings.options))
                    .then(() => null, (err) => err.message);
            }
            res.json({ success: true, settings: view(settings), warning });
        } catch (err) {
            sendError(res, err, 'บันทึกการตั้งค่าไม่สำเร็จ');
        }
    });

    app.get('/api/weather/locations', requireAdmin, async (req, res) => {
        try {
            res.json(await searchLocations(String(req.query.q || '').slice(0, 100)));
        } catch (err) {
            sendError(res, err, 'ค้นหาสถานที่ไม่สำเร็จ');
        }
    });

    app.post('/api/weather/preview', requireAdmin, skipAudit, async (req, res) => {
        try {
            const { content = '', options } = parseSettingsInput({ content: req.body?.content ?? '', options: req.body?.options });
            const weather = await fetchWeather(options.location);
            const report = await buildWeatherReport({ content, options }, weather);
            // รูปกราฟเล็กพอส่งเป็น data URL ได้ แต่ภาพเรดาร์ (GIF หลาย MB) ให้หน้าเว็บโหลดผ่าน URL แยก เบราว์เซอร์จะได้ cache ไว้
            const files = Object.fromEntries(report.files.map((file) => [
                file.name,
                file.key ? `/api/weather/radar/${file.key}` : `data:${file.contentType};base64,${file.buffer.toString('base64')}`,
            ]));
            res.set('Cache-Control', 'no-store').json({
                content: report.content,
                embeds: report.embeds.map((embed) => embed.toJSON()),
                files,
                warnings: report.warnings,
                fetchedAt: weather.fetchedAt,
            });
        } catch (err) {
            sendError(res, err, 'สร้างตัวอย่างรายงานไม่สำเร็จ');
        }
    });

    app.get('/api/weather/radar/:key', requireAdmin, async (req, res) => {
        const map = /^[0-9a-f]{16}$/.test(req.params.key) ? await getRenderedRadar(req.params.key) : null;
        if (!map) return res.status(404).json({ error: 'ไม่พบภาพเรดาร์นี้ (หมดอายุแล้ว) — แก้ค่าใดๆ เพื่อสร้างตัวอย่างใหม่' });
        res.set('Cache-Control', 'private, max-age=600').type(map.contentType).send(map.buffer);
    });

    app.post('/api/weather/test', requireAdmin, auditAs('weather.test_send'), async (req, res) => {
        try {
            const client = getClient();
            if (!client?.isReady()) throw new HttpError(503, 'บอทยังไม่ออนไลน์ กรุณาลองใหม่อีกครั้ง');

            const input = parseSettingsInput({
                channelId: req.body?.channelId ?? '',
                content: req.body?.content ?? '',
                options: req.body?.options,
            });
            if (!input.channelId) throw new HttpError(400, 'กรุณาเลือกห้องที่จะส่งก่อน');
            assertValid({ ...input, enabled: false });

            // ใช้ข้อมูลอากาศชุดเดียวกับตัวอย่างที่เห็นในหน้าเว็บ (cache 10 นาที)
            const channel = await sendWeatherReport(client, input, { fresh: false });
            res.json({ success: true, message: `ส่งรายงานทดสอบเข้า #${channel.name} แล้ว` });
        } catch (err) {
            sendError(res, err, 'ส่งรายงานทดสอบไม่สำเร็จ');
        }
    });
}

module.exports = { registerWeatherRoutes };
