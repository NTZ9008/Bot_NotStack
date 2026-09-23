// ==========================================
// 🌐 WELCOME API ROUTES — ADMIN เท่านั้น
// การ์ด:      GET/POST /api/welcome/cards, PATCH/DELETE /api/welcome/cards/:id
// คลังรูป:    GET/POST /api/welcome/assets, GET /api/welcome/assets/:id/image, PATCH/DELETE /api/welcome/assets/:id
// ตัวอย่าง:   POST /api/welcome/preview (วาดรูปจากค่าที่กำลังแก้ ยังไม่บันทึก), POST /api/welcome/test (ส่งเข้าห้องจริง)
// ==========================================
const express = require('express');
const store = require('./store');
const { FONTS, WEIGHTS } = require('./fonts');
const { LIMITS, FITS, SHAPES, ALIGNS, PLACEHOLDERS, defaultDesign, defaultText, normalizeDesign, buildVars } = require('./design');
const { MAX_UPLOAD_BYTES, loadAssetImage, forgetAsset, loadAvatarImage, prepareAssetUpload, renderWelcomeImage } = require('./render');
const { buildWelcomePayload, resolveTargetChannel } = require('./index');

const SNOWFLAKE = /^\d{5,25}$/;
const DEFAULT_CARD_NAME = 'การ์ดต้อนรับใหม่';

// error ที่ตั้งใจส่งกลับให้ผู้ใช้อ่าน (ข้อความภาษาไทย + status code)
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const parseId = (value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
};

// ตั้งชื่อ action ใน audit log (ถ้าไม่ตั้ง จะได้ชื่อแบบ api.patch /api/welcome/cards/3 แยกกันทุก id)
const auditAs = (action) => (req, res, next) => {
    res.locals.auditAction = action;
    if (req.params.id) res.locals.auditTargetId = req.params.id;
    next();
};

// POST ที่แค่วาดรูปตัวอย่าง ไม่ได้แก้ข้อมูล — ไม่ต้องลง audit log (ถูกเรียกทุกครั้งที่ขยับ slider)
const skipAudit = (req, res, next) => {
    res.locals.skipAudit = true;
    next();
};

function sendError(res, err, fallbackMessage) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(`[Welcome] ${fallbackMessage}:`, err);
    res.status(500).json({ error: fallbackMessage });
}

// ==========================================
// ตรวจค่าของการ์ดที่ส่งมาจากหน้าเว็บ — คืนเฉพาะฟิลด์ที่ส่งมา (ใช้ได้ทั้งสร้างใหม่และแก้บางส่วน)
// ==========================================
async function parseCardInput(body) {
    const src = body && typeof body === 'object' ? body : {};
    const data = {};

    if (src.name !== undefined) {
        const name = String(src.name).trim();
        if (!name) throw new HttpError(400, 'กรุณาตั้งชื่อการ์ด');
        data.name = name.slice(0, LIMITS.maxNameLength);
    }
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
    if (src.design !== undefined) {
        data.design = normalizeDesign(src.design);
    }
    if (src.backgroundId !== undefined) {
        if (src.backgroundId === null || src.backgroundId === '') {
            data.backgroundId = null;
        } else {
            const backgroundId = parseId(src.backgroundId);
            if (!backgroundId || !(await store.getAssetInfo(backgroundId))) throw new HttpError(400, 'ไม่พบรูปพื้นหลังนี้ในคลังรูป (อาจถูกลบไปแล้ว)');
            data.backgroundId = backgroundId;
        }
    }
    return data;
}

// การ์ดที่เปิดใช้งานต้องมีห้องปลายทางเสมอ
function assertSendable(card) {
    if (card.enabled && !card.channelId) throw new HttpError(400, 'ต้องเลือกห้องที่จะส่งก่อนเปิดใช้งานการ์ด');
}

// เตือน (แต่ไม่ห้ามบันทึก) ถ้าห้องที่เลือกบอทส่งรูปเข้าไปไม่ได้ — แอดมินอาจไปแก้สิทธิ์ใน Discord ทีหลัง
async function channelWarning(client, channelId) {
    if (!channelId || !client?.isReady()) return null;
    const channel = client.channels.cache.get(channelId);
    if (!channel?.guild) return `ไม่พบห้อง ${channelId} ในเซิร์ฟเวอร์ที่บอทอยู่`;
    const { error } = await resolveTargetChannel(channel.guild, channelId);
    return error || null;
}

// สมาชิกที่ใช้แสดงในรูปตัวอย่าง: คนที่เลือกในหน้าเว็บ → บัญชี Discord ของแอดมินที่ login อยู่ → ตัวบอทเอง
async function resolveSample(client, req, requestedId, guild = null) {
    if (!client?.isReady()) return { guild: null, member: null, user: null };
    const targetGuild = guild || client.guilds.cache.first() || null;
    const id = SNOWFLAKE.test(String(requestedId || '')) ? String(requestedId) : (req.user.discordId || client.user.id);
    const member = targetGuild ? await targetGuild.members.fetch(id).catch(() => null) : null;
    const user = member?.user || await client.users.fetch(id).catch(() => null);
    return { guild: targetGuild, member, user };
}

/**
 * @param {import('express').Express} app
 * @param {Function} requireAdmin
 * @param {Function} getClient คืนค่า discord client (อาจยังไม่พร้อมตอนเซิร์ฟเวอร์เพิ่งเปิด)
 */
function registerWelcomeRoutes(app, requireAdmin, getClient) {
    // ค่าคงที่สำหรับสร้างฟอร์มในหน้าเว็บ (ฟอนต์ ตัวแปร ขีดจำกัด ค่าเริ่มต้น)
    app.get('/api/welcome/meta', requireAdmin, (req, res) => {
        const botUser = getClient()?.user;
        res.json({
            // ใช้ทำกรอบข้อความจำลองแบบ Discord ในหน้าตัวอย่าง
            bot: botUser ? { name: botUser.displayName || botUser.username, avatar: botUser.displayAvatarURL({ size: 64 }) } : null,
            fonts: FONTS,
            weights: WEIGHTS,
            fits: FITS,
            shapes: SHAPES,
            aligns: ALIGNS,
            placeholders: PLACEHOLDERS,
            limits: { ...LIMITS, maxUploadBytes: MAX_UPLOAD_BYTES },
            defaultDesign: defaultDesign(),
            defaultText: defaultText(),
        });
    });

    // ==========================================
    // การ์ดต้อนรับ
    // ==========================================
    app.get('/api/welcome/cards', requireAdmin, async (req, res) => {
        try {
            res.json(await store.listCards());
        } catch (err) {
            sendError(res, err, 'โหลดรายการการ์ดไม่สำเร็จ');
        }
    });

    // สร้างใหม่จากค่าเริ่มต้น หรือคัดลอกจากการ์ดเดิม (duplicateOf) — การ์ดใหม่ปิดไว้ก่อนเสมอ
    app.post('/api/welcome/cards', requireAdmin, auditAs('welcome.card_create'), async (req, res) => {
        try {
            const sourceId = parseId(req.body?.duplicateOf);
            const source = sourceId ? await store.getCard(sourceId) : null;
            if (sourceId && !source) throw new HttpError(404, 'ไม่พบการ์ดที่ต้องการคัดลอก');

            const input = await parseCardInput({ ...req.body, enabled: false });
            const card = await store.createCard({
                name: input.name || (source ? `${source.name} (สำเนา)`.slice(0, LIMITS.maxNameLength) : DEFAULT_CARD_NAME),
                enabled: false,
                channelId: input.channelId ?? source?.channelId ?? '',
                content: input.content ?? source?.content ?? 'ยินดีต้อนรับ {mention} เข้าสู่ **{server}** 🎉',
                design: input.design ?? source?.design ?? defaultDesign(),
                backgroundId: input.backgroundId !== undefined ? input.backgroundId : (source?.backgroundId ?? null),
            });
            res.locals.auditTargetId = card.id;
            res.status(201).json({ success: true, card });
        } catch (err) {
            sendError(res, err, 'สร้างการ์ดไม่สำเร็จ');
        }
    });

    // แก้เฉพาะฟิลด์ที่ส่งมา (หน้าแก้ไขส่งมาทั้งก้อน ส่วนสวิตช์ในรายการส่งมาแค่ enabled)
    app.patch('/api/welcome/cards/:id', requireAdmin, auditAs('welcome.card_update'), async (req, res) => {
        try {
            const id = parseId(req.params.id);
            const current = id ? await store.getCard(id) : null;
            if (!current) throw new HttpError(404, 'ไม่พบการ์ดนี้ (อาจถูกลบไปแล้ว)');

            const data = await parseCardInput(req.body);
            assertSendable({ ...current, ...data });

            const card = await store.updateCard(id, data);
            if (!card) throw new HttpError(404, 'ไม่พบการ์ดนี้ (อาจถูกลบไปแล้ว)');
            const warning = card.enabled ? await channelWarning(getClient(), card.channelId) : null;
            res.json({ success: true, card, warning });
        } catch (err) {
            sendError(res, err, 'บันทึกการ์ดไม่สำเร็จ');
        }
    });

    app.delete('/api/welcome/cards/:id', requireAdmin, auditAs('welcome.card_delete'), async (req, res) => {
        try {
            const id = parseId(req.params.id);
            if (!id || !(await store.deleteCard(id))) throw new HttpError(404, 'ไม่พบการ์ดนี้ (อาจถูกลบไปแล้ว)');
            res.json({ success: true });
        } catch (err) {
            sendError(res, err, 'ลบการ์ดไม่สำเร็จ');
        }
    });

    // ==========================================
    // ตัวอย่าง / ทดสอบส่ง — ใช้ค่าที่กำลังแก้อยู่ในหน้าเว็บ (ยังไม่ต้องบันทึก)
    // ==========================================
    app.post('/api/welcome/preview', requireAdmin, skipAudit, async (req, res) => {
        try {
            const design = normalizeDesign(req.body?.design);
            const backgroundId = parseId(req.body?.backgroundId);
            const sample = await resolveSample(getClient(), req, req.body?.userId);
            const vars = buildVars(sample);

            const [background, avatar] = await Promise.all([
                backgroundId ? loadAssetImage(backgroundId).catch(() => null) : null,
                design.avatar.visible ? loadAvatarImage(sample.member?.user || sample.user) : null,
            ]);
            const image = await renderWelcomeImage({ design, background, avatar, vars });

            // vars ส่งกลับไปให้หน้าเว็บแทนค่าตัวแปรในข้อความเองได้ทันทีขณะพิมพ์ (ไม่ต้องรอวาดรูปใหม่)
            const { mentionId, ...publicVars } = vars;
            res.set('Cache-Control', 'no-store').json({
                image: `data:image/png;base64,${image.toString('base64')}`,
                vars: publicVars,
            });
        } catch (err) {
            sendError(res, err, 'สร้างรูปตัวอย่างไม่สำเร็จ');
        }
    });

    app.post('/api/welcome/test', requireAdmin, auditAs('welcome.test_send'), async (req, res) => {
        try {
            const client = getClient();
            if (!client?.isReady()) throw new HttpError(503, 'บอทยังไม่ออนไลน์ กรุณาลองใหม่อีกครั้ง');

            const input = await parseCardInput({
                channelId: req.body?.channelId,
                content: req.body?.content ?? '',
                design: req.body?.design,
                backgroundId: req.body?.backgroundId ?? null,
            });
            if (!input.channelId) throw new HttpError(400, 'กรุณาเลือกห้องที่จะส่งก่อน');

            const guild = client.channels.cache.get(input.channelId)?.guild;
            if (!guild) throw new HttpError(400, `ไม่พบห้อง ${input.channelId} ในเซิร์ฟเวอร์ที่บอทอยู่`);
            const { channel, error } = await resolveTargetChannel(guild, input.channelId);
            if (!channel) throw new HttpError(400, error);

            const sample = await resolveSample(client, req, req.body?.userId, guild);
            await channel.send(await buildWelcomePayload(input, sample));
            res.json({ success: true, message: `ส่งการ์ดทดสอบเข้า #${channel.name} แล้ว` });
        } catch (err) {
            sendError(res, err, 'ส่งการ์ดทดสอบไม่สำเร็จ');
        }
    });

    // ==========================================
    // คลังรูปพื้นหลัง
    // ==========================================
    app.get('/api/welcome/assets', requireAdmin, async (req, res) => {
        try {
            res.json(await store.listAssets());
        } catch (err) {
            sendError(res, err, 'โหลดคลังรูปไม่สำเร็จ');
        }
    });

    // รูปในคลังแก้ไม่ได้ (มีแต่เพิ่ม/ลบ) id เดิมจึงเป็นรูปเดิมตลอด → ให้เบราว์เซอร์ cache ได้ยาว
    app.get('/api/welcome/assets/:id/image', requireAdmin, async (req, res) => {
        try {
            const id = parseId(req.params.id);
            const file = id ? await store.getAssetFile(id) : null;
            if (!file) throw new HttpError(404, 'ไม่พบรูปนี้');
            res.set('Cache-Control', 'private, max-age=31536000, immutable')
                .type(file.mimeType)
                .send(Buffer.from(file.data));
        } catch (err) {
            sendError(res, err, 'โหลดรูปไม่สำเร็จ');
        }
    });

    // อัปโหลดเป็นไฟล์ดิบ (body = ตัวไฟล์รูป, ชื่อไฟล์อยู่ใน ?name=) — ไม่ต้องพึ่ง library multipart
    app.post('/api/welcome/assets', requireAdmin, auditAs('welcome.asset_upload'),
        express.raw({ type: 'image/*', limit: MAX_UPLOAD_BYTES }),
        async (req, res) => {
            try {
                const file = await prepareAssetUpload(req.body).catch((err) => {
                    throw new HttpError(400, err.message);
                });
                const name = String(req.query.name || '').replace(/\.[a-z0-9]{2,5}$/i, '').trim().slice(0, LIMITS.maxNameLength) || 'รูปพื้นหลัง';
                const asset = await store.createAsset({ name, ...file, size: file.data.length });
                res.locals.auditTargetId = asset.id;
                res.locals.audit = { asset: { name, mimeType: asset.mimeType, width: asset.width, height: asset.height, size: asset.size } };
                res.status(201).json({ success: true, asset });
            } catch (err) {
                sendError(res, err, 'อัปโหลดรูปไม่สำเร็จ');
            }
        });

    app.patch('/api/welcome/assets/:id', requireAdmin, auditAs('welcome.asset_rename'), async (req, res) => {
        try {
            const id = parseId(req.params.id);
            const name = String(req.body?.name || '').trim().slice(0, LIMITS.maxNameLength);
            if (!name) throw new HttpError(400, 'กรุณาตั้งชื่อรูป');
            const asset = id ? await store.renameAsset(id, name) : null;
            if (!asset) throw new HttpError(404, 'ไม่พบรูปนี้ (อาจถูกลบไปแล้ว)');
            res.json({ success: true, asset });
        } catch (err) {
            sendError(res, err, 'เปลี่ยนชื่อรูปไม่สำเร็จ');
        }
    });

    app.delete('/api/welcome/assets/:id', requireAdmin, auditAs('welcome.asset_delete'), async (req, res) => {
        try {
            const id = parseId(req.params.id);
            if (!id || !(await store.deleteAsset(id))) throw new HttpError(404, 'ไม่พบรูปนี้ (อาจถูกลบไปแล้ว)');
            forgetAsset(id);
            res.json({ success: true });
        } catch (err) {
            sendError(res, err, 'ลบรูปไม่สำเร็จ');
        }
    });
}

module.exports = { registerWelcomeRoutes };
