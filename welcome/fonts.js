// ==========================================
// 🔤 FONTS — ฟอนต์ที่ใช้วาดข้อความบนการ์ดต้อนรับ
// ไฟล์ฟอนต์มากับแพ็กเกจ npm (@expo-google-fonts/*) จึงวาดภาษาไทยได้เหมือนกันทุกเครื่อง
// ไม่ต้องติดตั้งฟอนต์ในเซิร์ฟเวอร์เอง — ฟอนต์ emoji ใช้เป็นตัวสำรองให้ชื่อที่มี emoji ไม่กลายเป็นกล่องสี่เหลี่ยม
// ==========================================
const path = require('path');
const { GlobalFonts } = require('@napi-rs/canvas');

// น้ำหนักตัวอักษรที่ให้เลือกในหน้า Dashboard (ทุกฟอนต์ในรายการมีครบทั้ง 4 แบบ)
const WEIGHTS = [
    { value: 300, label: 'บาง (Light)', dir: '300Light' },
    { value: 400, label: 'ปกติ (Regular)', dir: '400Regular' },
    { value: 700, label: 'หนา (Bold)', dir: '700Bold' },
    { value: 900, label: 'หนามาก (Black)', dir: '900Black' },
];

// family ขึ้นต้นด้วย "WC" กันชื่อชนกับฟอนต์ที่ติดตั้งอยู่ในเครื่อง
const FONTS = [
    { id: 'kanit', label: 'Kanit', family: 'WC Kanit', pkg: '@expo-google-fonts/kanit', file: 'Kanit' },
    { id: 'prompt', label: 'Prompt', family: 'WC Prompt', pkg: '@expo-google-fonts/prompt', file: 'Prompt' },
    { id: 'noto-sans-thai', label: 'Noto Sans Thai', family: 'WC Noto Sans Thai', pkg: '@expo-google-fonts/noto-sans-thai', file: 'NotoSansThai' },
];

const EMOJI_FAMILY = 'WC Emoji';
const DEFAULT_FONT = FONTS[0].id;
const FONT_MAP = new Map(FONTS.map((font) => [font.id, font]));

function packageDir(pkg) {
    return path.dirname(require.resolve(`${pkg}/package.json`));
}

function register(file, family) {
    try {
        if (!GlobalFonts.registerFromPath(file, family)) throw new Error('ไฟล์ฟอนต์ใช้ไม่ได้');
    } catch (err) {
        console.error(`[Welcome] โหลดฟอนต์ ${path.basename(file)} ไม่สำเร็จ:`, err.message);
    }
}

for (const font of FONTS) {
    const dir = packageDir(font.pkg);
    for (const weight of WEIGHTS) {
        register(path.join(dir, weight.dir, `${font.file}_${weight.dir}.ttf`), font.family);
    }
}
register(path.join(packageDir('@expo-google-fonts/noto-color-emoji'), '400Regular', 'NotoColorEmoji_400Regular.ttf'), EMOJI_FAMILY);

// ค่า ctx.font — ตัวอักษรที่ฟอนต์หลักไม่มี (emoji / ภาษาอื่น) จะไปใช้ฟอนต์ถัดไปในรายการเอง
function fontString(fontId, weight, size) {
    const font = FONT_MAP.get(fontId) || FONT_MAP.get(DEFAULT_FONT);
    return `${weight} ${size}px "${font.family}", "${EMOJI_FAMILY}", sans-serif`;
}

module.exports = {
    FONTS: FONTS.map(({ id, label }) => ({ id, label })),
    WEIGHTS: WEIGHTS.map(({ value, label }) => ({ value, label })),
    FONT_IDS: new Set(FONT_MAP.keys()),
    WEIGHT_VALUES: new Set(WEIGHTS.map((w) => w.value)),
    DEFAULT_FONT,
    fontString,
};
