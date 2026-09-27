import path from 'node:path';
import { Logger } from '@nestjs/common';
import { GlobalFonts } from '@napi-rs/canvas';
import { DEFAULT_FONT, WELCOME_WEIGHTS, type WelcomeFontId } from '@notstack/shared';

// ==========================================
// 🔤 FONTS — ฟอนต์ที่ใช้วาดข้อความบนรูป (การ์ดต้อนรับ / กราฟพยากรณ์อากาศ / แผนที่เรดาร์)
// ไฟล์ฟอนต์มากับแพ็กเกจ npm (@expo-google-fonts/*) จึงวาดภาษาไทยได้เหมือนกันทุกเครื่อง
// ไม่ต้องติดตั้งฟอนต์ในเซิร์ฟเวอร์เอง — ฟอนต์ emoji ใช้เป็นตัวสำรองให้ชื่อที่มี emoji ไม่กลายเป็นกล่องสี่เหลี่ยม
// ==========================================
const logger = new Logger('Fonts');

const WEIGHT_DIRS: Record<number, string> = { 300: '300Light', 400: '400Regular', 700: '700Bold', 900: '900Black' };

// family ขึ้นต้นด้วย "WC" กันชื่อชนกับฟอนต์ที่ติดตั้งอยู่ในเครื่อง
const FONT_FILES: Record<WelcomeFontId, { family: string; pkg: string; file: string }> = {
    kanit: { family: 'WC Kanit', pkg: '@expo-google-fonts/kanit', file: 'Kanit' },
    prompt: { family: 'WC Prompt', pkg: '@expo-google-fonts/prompt', file: 'Prompt' },
    'noto-sans-thai': { family: 'WC Noto Sans Thai', pkg: '@expo-google-fonts/noto-sans-thai', file: 'NotoSansThai' },
};

const EMOJI_FAMILY = 'WC Emoji';

const packageDir = (pkg: string) => path.dirname(require.resolve(`${pkg}/package.json`));

function register(file: string, family: string): void {
    try {
        if (!GlobalFonts.registerFromPath(file, family)) throw new Error('ไฟล์ฟอนต์ใช้ไม่ได้');
    } catch (err) {
        logger.error(`โหลดฟอนต์ ${path.basename(file)} ไม่สำเร็จ: ${(err as Error).message}`);
    }
}

let registered = false;

// ลงทะเบียนฟอนต์ครั้งเดียว (เรียกก่อนวาดรูปครั้งแรก)
export function registerFonts(): void {
    if (registered) return;
    registered = true;
    for (const font of Object.values(FONT_FILES)) {
        const dir = packageDir(font.pkg);
        for (const weight of WELCOME_WEIGHTS) {
            const weightDir = WEIGHT_DIRS[weight.value]!;
            register(path.join(dir, weightDir, `${font.file}_${weightDir}.ttf`), font.family);
        }
    }
    register(path.join(packageDir('@expo-google-fonts/noto-color-emoji'), '400Regular', 'NotoColorEmoji_400Regular.ttf'), EMOJI_FAMILY);
}

// ค่า ctx.font — ตัวอักษรที่ฟอนต์หลักไม่มี (emoji / ภาษาอื่น) จะไปใช้ฟอนต์ถัดไปในรายการเอง
export function fontString(fontId: WelcomeFontId, weight: number, size: number): string {
    registerFonts();
    const font = FONT_FILES[fontId] ?? FONT_FILES[DEFAULT_FONT];
    return `${weight} ${size}px "${font.family}", "${EMOJI_FAMILY}", sans-serif`;
}
