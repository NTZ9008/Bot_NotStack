// ==========================================
// 📐 DESIGN — รูปแบบการจัดวางของการ์ดต้อนรับ (เก็บเป็น JSON ในคอลัมน์ welcome_cards.design)
// ทุกค่าที่มาจากหน้าเว็บผ่าน normalizeDesign ก่อนเสมอ: ตัดฟิลด์แปลกปลอม, บีบตัวเลขให้อยู่ในช่วง, สีต้องเป็น #RRGGBB
// ตัวแปรในข้อความ ({user} {server} ...) แทนค่าด้วย fillPlaceholders ตอนวาดรูป/ส่งข้อความ
// ==========================================
const { FONT_IDS, WEIGHT_VALUES, DEFAULT_FONT } = require('./fonts');

const LIMITS = {
    minWidth: 400,
    maxWidth: 2000,
    minHeight: 150,
    maxHeight: 1200,
    maxTexts: 12,
    maxTextLength: 200,
    maxContentLength: 2000,
    maxNameLength: 80,
};

const FITS = ['cover', 'contain', 'stretch'];
const SHAPES = ['circle', 'rounded', 'square'];
const ALIGNS = ['left', 'center', 'right'];

// ตัวแปรที่ใช้ได้ทั้งในข้อความบนรูปและข้อความที่ส่งคู่กับรูป
const PLACEHOLDERS = [
    { key: 'user', label: 'ชื่อที่แสดงของสมาชิก (ชื่อเล่นในเซิร์ฟเวอร์ ถ้ามี)' },
    { key: 'username', label: 'username ของสมาชิก' },
    { key: 'mention', label: 'แท็กสมาชิก — ในข้อความจะแท็กจริง ส่วนบนรูปจะเป็น @ชื่อ' },
    { key: 'server', label: 'ชื่อเซิร์ฟเวอร์' },
    { key: 'memberCount', label: 'จำนวนสมาชิกทั้งหมด (= สมาชิกคนที่เท่าไร)' },
    { key: 'id', label: 'User ID ของสมาชิก' },
];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function defaultText(overrides = {}) {
    return {
        text: 'ข้อความใหม่',
        x: 512,
        y: 225,
        font: DEFAULT_FONT,
        weight: 700,
        size: 40,
        color: '#ffffff',
        align: 'center',
        maxWidth: 900,
        letterSpacing: 0,
        strokeWidth: 0,
        strokeColor: '#000000',
        shadow: true,
        ...overrides,
    };
}

function defaultDesign() {
    return {
        width: 1024,
        height: 450,
        background: {
            color: '#312e81',
            fit: 'cover',
            blur: 0,
            overlayColor: '#000000',
            overlayOpacity: 0.3,
        },
        avatar: {
            visible: true,
            x: 512,
            y: 150,
            size: 180,
            shape: 'circle',
            borderWidth: 7,
            borderColor: '#ffffff',
        },
        texts: [
            defaultText({ text: 'WELCOME', y: 297, weight: 900, size: 60, letterSpacing: 6 }),
            defaultText({ text: '{user}', y: 355, size: 42, color: '#fde68a' }),
            defaultText({ text: 'สมาชิกคนที่ #{memberCount} ของ {server}', y: 407, font: 'noto-sans-thai', weight: 400, size: 24, color: '#e2e8f0' }),
        ],
    };
}

// ==========================================
// ตัวช่วยตรวจค่า — ค่าที่ใช้ไม่ได้จะถอยกลับไปใช้ค่า default แทนการโยน error
// (หน้าเว็บส่งทั้งก้อนมาทุกครั้ง ถ้าฟิลด์เดียวพังไม่ควรทำให้บันทึกทั้งการ์ดไม่ได้)
// ==========================================
function num(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

const int = (value, min, max, fallback) => Math.round(num(value, min, max, fallback));
const color = (value, fallback) => (typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback);
const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

function normalizeText(input, width, height) {
    const src = plain(input);
    const base = defaultText({ x: Math.round(width / 2), y: Math.round(height / 2), maxWidth: width - 80 });
    return {
        text: typeof src.text === 'string' ? src.text.slice(0, LIMITS.maxTextLength) : base.text,
        x: int(src.x, 0, width, base.x),
        y: int(src.y, 0, height, base.y),
        font: FONT_IDS.has(src.font) ? src.font : base.font,
        weight: WEIGHT_VALUES.has(Number(src.weight)) ? Number(src.weight) : base.weight,
        size: int(src.size, 8, 200, base.size),
        color: color(src.color, base.color),
        align: oneOf(src.align, ALIGNS, base.align),
        // 0 = ไม่จำกัดความกว้าง, มากกว่านั้น = ย่อตัวอักษรลงเองเมื่อชื่อยาวเกิน
        maxWidth: int(src.maxWidth, 0, width, base.maxWidth),
        letterSpacing: int(src.letterSpacing, 0, 40, base.letterSpacing),
        strokeWidth: int(src.strokeWidth, 0, 20, base.strokeWidth),
        strokeColor: color(src.strokeColor, base.strokeColor),
        shadow: bool(src.shadow, base.shadow),
    };
}

function normalizeDesign(input) {
    const src = plain(input);
    const def = defaultDesign();

    const width = int(src.width, LIMITS.minWidth, LIMITS.maxWidth, def.width);
    const height = int(src.height, LIMITS.minHeight, LIMITS.maxHeight, def.height);

    const bg = plain(src.background);
    const av = plain(src.avatar);

    return {
        width,
        height,
        background: {
            color: color(bg.color, def.background.color),
            fit: oneOf(bg.fit, FITS, def.background.fit),
            blur: int(bg.blur, 0, 30, def.background.blur),
            overlayColor: color(bg.overlayColor, def.background.overlayColor),
            overlayOpacity: Math.round(num(bg.overlayOpacity, 0, 1, def.background.overlayOpacity) * 100) / 100,
        },
        avatar: {
            visible: bool(av.visible, def.avatar.visible),
            x: int(av.x, 0, width, Math.round(width / 2)),
            y: int(av.y, 0, height, Math.round(height / 3)),
            size: int(av.size, 16, Math.min(width, height), Math.min(def.avatar.size, height - 20)),
            shape: oneOf(av.shape, SHAPES, def.avatar.shape),
            borderWidth: int(av.borderWidth, 0, 40, def.avatar.borderWidth),
            borderColor: color(av.borderColor, def.avatar.borderColor),
        },
        texts: (Array.isArray(src.texts) ? src.texts : def.texts)
            .slice(0, LIMITS.maxTexts)
            .map((text) => normalizeText(text, width, height)),
    };
}

// ==========================================
// ตัวแปรในข้อความ
// ==========================================

// ค่าของตัวแปรจากสมาชิก (GuildMember) หรือ User ธรรมดา (ตอนดูตัวอย่างกับคนที่ไม่ได้อยู่ในเซิร์ฟเวอร์)
function buildVars({ member, user, guild }) {
    const target = member?.user || user;
    const displayName = member?.displayName || target?.globalName || target?.username || 'สมาชิกใหม่';
    return {
        user: displayName,
        username: target?.username || 'new_member',
        id: target?.id || '0',
        mentionId: target?.id || null,
        server: guild?.name || 'NotStack',
        memberCount: String(guild?.memberCount ?? 0),
    };
}

/**
 * @param {string} template
 * @param {object} vars จาก buildVars
 * @param {'image'|'message'} target ข้อความบนรูปแท็กคนไม่ได้ → {mention} กลายเป็น @ชื่อ
 */
function fillPlaceholders(template, vars, target = 'image') {
    return String(template || '').replace(/\{(\w+)\}/g, (match, key) => {
        if (key === 'mention') {
            return target === 'message' && vars.mentionId ? `<@${vars.mentionId}>` : `@${vars.user}`;
        }
        return Object.prototype.hasOwnProperty.call(vars, key) && key !== 'mentionId' ? vars[key] : match;
    });
}

module.exports = {
    LIMITS,
    FITS,
    SHAPES,
    ALIGNS,
    PLACEHOLDERS,
    defaultDesign,
    defaultText,
    normalizeDesign,
    buildVars,
    fillPlaceholders,
};
