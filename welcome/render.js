// ==========================================
// 🖼️ RENDER — วาดการ์ดต้อนรับเป็นไฟล์ PNG ด้วย @napi-rs/canvas (ไม่ต้องติดตั้งโปรแกรมอื่นในเครื่อง)
// ลำดับชั้น: สีพื้น → รูปพื้นหลัง → ชั้นสีทับ (overlay) → avatar → ข้อความทีละชั้น
// ใช้ฟังก์ชันเดียวกันทั้งตอนส่งจริงและตอนดูตัวอย่างใน Dashboard ภาพที่เห็นจึงตรงกับของจริงเสมอ
// ==========================================
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { fontString } = require('./fonts');
const { fillPlaceholders } = require('./design');
const store = require('./store');

const AVATAR_TIMEOUT_MS = 5000;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
// รูปที่ใหญ่กว่านี้จะถูกย่อก่อนเก็บลงฐานข้อมูล (การ์ดกว้างได้สูงสุด 2000px อยู่แล้ว)
const MAX_ASSET_SIDE = 2400;

// ==========================================
// รูปพื้นหลัง — decode ครั้งเดียวแล้วเก็บไว้ (รูปในคลังแก้ไม่ได้ มีแต่เพิ่ม/ลบ จึง cache ตาม id ได้เลย)
// ==========================================
const ASSET_CACHE_SIZE = 8;
const assetCache = new Map();

async function loadAssetImage(assetId) {
    if (!assetId) return null;
    if (assetCache.has(assetId)) {
        const cached = assetCache.get(assetId);
        // ย้ายไปท้ายสุด = ใช้ล่าสุด (LRU)
        assetCache.delete(assetId);
        assetCache.set(assetId, cached);
        return cached;
    }
    const file = await store.getAssetFile(assetId);
    if (!file) return null;
    const image = await loadImage(Buffer.from(file.data));
    assetCache.set(assetId, image);
    if (assetCache.size > ASSET_CACHE_SIZE) assetCache.delete(assetCache.keys().next().value);
    return image;
}

const forgetAsset = (assetId) => assetCache.delete(assetId);

// รูปโปรไฟล์ที่เพิ่งโหลด — หน้า Dashboard ขอตัวอย่างใหม่ทุกครั้งที่แก้ค่า จะได้ไม่ต้องโหลดรูปเดิมซ้ำจาก Discord
// (URL มี hash ของรูปอยู่แล้ว ถ้าสมาชิกเปลี่ยนรูป URL ก็เปลี่ยนตาม)
const AVATAR_CACHE_SIZE = 32;
const avatarCache = new Map();

// ดึงรูปโปรไฟล์จาก Discord CDN — ถ้าช้า/ล้ม ให้วาดวงกลมสีแทน ไม่ให้การ์ดทั้งใบส่งไม่ออก
async function loadAvatarImage(user) {
    if (!user) return null;
    try {
        const url = user.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true });
        if (avatarCache.has(url)) return avatarCache.get(url);

        const res = await fetch(url, { signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const image = await loadImage(Buffer.from(await res.arrayBuffer()));

        avatarCache.set(url, image);
        if (avatarCache.size > AVATAR_CACHE_SIZE) avatarCache.delete(avatarCache.keys().next().value);
        return image;
    } catch (err) {
        console.warn(`[Welcome] โหลด avatar ของ ${user.id} ไม่สำเร็จ:`, err.message);
        return null;
    }
}

// ==========================================
// อัปโหลดรูปพื้นหลัง — เช็คชนิดไฟล์จาก byte แรกของไฟล์จริง (ไม่เชื่อ Content-Type ที่ส่งมา)
// ==========================================
function sniffImageType(buffer) {
    if (buffer.length < 12) return null;
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return null;
}

async function prepareAssetUpload(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('ไม่พบไฟล์รูปที่อัปโหลด');
    if (buffer.length > MAX_UPLOAD_BYTES) throw new Error('ไฟล์รูปใหญ่เกิน 8 MB');

    const mimeType = sniffImageType(buffer);
    if (!mimeType) throw new Error('รองรับเฉพาะไฟล์ PNG, JPG, WEBP และ GIF');

    let image;
    try {
        image = await loadImage(buffer);
    } catch {
        throw new Error('เปิดไฟล์รูปไม่ได้ (ไฟล์อาจเสีย)');
    }

    const scale = Math.min(1, MAX_ASSET_SIDE / Math.max(image.width, image.height));
    if (scale === 1) return { mimeType, width: image.width, height: image.height, data: buffer };

    // ย่อรูปใหญ่ลงก่อนเก็บ — PNG/GIF อาจมีส่วนโปร่งใสจึงเก็บเป็น PNG ส่วนรูปถ่ายเก็บเป็น JPEG/WEBP ให้ไฟล์เล็ก
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);
    const canvas = createCanvas(width, height);
    canvas.getContext('2d').drawImage(image, 0, 0, width, height);

    const format = { 'image/jpeg': 'jpeg', 'image/webp': 'webp' }[mimeType] || 'png';
    const data = await canvas.encode(format, format === 'png' ? undefined : 90);
    return { mimeType: `image/${format}`, width, height, data };
}

// ==========================================
// วาดแต่ละชั้น
// ==========================================
function drawBackground(ctx, design, image) {
    const { width, height, background } = design;
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, width, height);

    if (image) {
        let w = width;
        let h = height;
        if (background.fit !== 'stretch') {
            const pick = background.fit === 'cover' ? Math.max : Math.min;
            const scale = pick(width / image.width, height / image.height);
            w = image.width * scale;
            h = image.height * scale;
        }
        let x = (width - w) / 2;
        let y = (height - h) / 2;

        ctx.save();
        if (background.blur > 0) {
            // ขยายรูปออกเลยขอบเล็กน้อย ไม่งั้นขอบภาพที่เบลอจะจางเป็นสีพื้น
            const pad = background.blur * 2;
            if (background.fit !== 'contain') {
                x -= pad;
                y -= pad;
                w += pad * 2;
                h += pad * 2;
            }
            ctx.filter = `blur(${background.blur}px)`;
        }
        ctx.drawImage(image, x, y, w, h);
        ctx.restore();
    }

    if (background.overlayOpacity > 0) {
        ctx.save();
        ctx.globalAlpha = background.overlayOpacity;
        ctx.fillStyle = background.overlayColor;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }
}

function shapePath(ctx, cx, cy, half, shape) {
    ctx.beginPath();
    if (shape === 'circle') {
        ctx.arc(cx, cy, half, 0, Math.PI * 2);
    } else {
        ctx.roundRect(cx - half, cy - half, half * 2, half * 2, shape === 'rounded' ? half * 0.28 : 0);
    }
}

function drawAvatar(ctx, avatar, image) {
    if (!avatar.visible) return;
    const half = avatar.size / 2;

    if (avatar.borderWidth > 0) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 18;
        ctx.fillStyle = avatar.borderColor;
        shapePath(ctx, avatar.x, avatar.y, half + avatar.borderWidth, avatar.shape);
        ctx.fill();
        ctx.restore();
    }

    ctx.save();
    shapePath(ctx, avatar.x, avatar.y, half, avatar.shape);
    ctx.clip();
    if (image) {
        ctx.drawImage(image, avatar.x - half, avatar.y - half, avatar.size, avatar.size);
    } else {
        ctx.fillStyle = '#5865f2';
        ctx.fillRect(avatar.x - half, avatar.y - half, avatar.size, avatar.size);
    }
    ctx.restore();
}

function drawText(ctx, layer, vars) {
    const lines = fillPlaceholders(layer.text, vars, 'image').split('\n').map((line) => line.trimEnd());
    if (!lines.some(Boolean)) return;

    const spacing = layer.letterSpacing;
    ctx.letterSpacing = `${spacing}px`;

    // ชื่อยาวเกินกรอบ → ย่อตัวอักษรลงทีละนิดจนพอดี (ไม่ตัดชื่อทิ้ง)
    let size = layer.size;
    const widest = () => Math.max(...lines.map((line) => ctx.measureText(line).width));
    ctx.font = fontString(layer.font, layer.weight, size);
    while (layer.maxWidth > 0 && size > 8 && widest() > layer.maxWidth) {
        size = Math.max(8, Math.floor(size * 0.92));
        ctx.font = fontString(layer.font, layer.weight, size);
    }

    ctx.textAlign = layer.align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    // letterSpacing เว้นที่ท้ายตัวสุดท้ายด้วย — ขยับชดเชยให้ข้อความยังอยู่กึ่งกลาง/ชิดขวาจริง
    const x = layer.x + (layer.align === 'center' ? spacing / 2 : layer.align === 'right' ? spacing : 0);
    const lineHeight = size * 1.25;
    const top = layer.y - ((lines.length - 1) * lineHeight) / 2;

    lines.forEach((line, i) => {
        if (!line) return;
        const y = top + i * lineHeight;
        ctx.save();
        if (layer.shadow) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
            ctx.shadowBlur = Math.max(4, size * 0.18);
            ctx.shadowOffsetY = Math.max(1, size * 0.05);
        }
        if (layer.strokeWidth > 0) {
            ctx.lineWidth = layer.strokeWidth * 2;
            ctx.strokeStyle = layer.strokeColor;
            ctx.strokeText(line, x, y);
            ctx.shadowColor = 'transparent'; // เงาเดียวพอ ไม่ต้องซ้อนทั้งขอบและตัวอักษร
        }
        ctx.fillStyle = layer.color;
        ctx.fillText(line, x, y);
        ctx.restore();
    });

    ctx.letterSpacing = '0px';
}

/**
 * @param {{design: object, background?: import('@napi-rs/canvas').Image|null, avatar?: import('@napi-rs/canvas').Image|null, vars: object}} input
 *   design ต้องผ่าน normalizeDesign มาแล้ว
 * @returns {Promise<Buffer>} ไฟล์ PNG
 */
async function renderWelcomeImage({ design, background = null, avatar = null, vars }) {
    const canvas = createCanvas(design.width, design.height);
    const ctx = canvas.getContext('2d');

    drawBackground(ctx, design, background);
    drawAvatar(ctx, design.avatar, avatar);
    for (const layer of design.texts) drawText(ctx, layer, vars);

    return canvas.encode('png');
}

module.exports = {
    MAX_UPLOAD_BYTES,
    loadAssetImage,
    forgetAsset,
    loadAvatarImage,
    prepareAssetUpload,
    renderWelcomeImage,
};
