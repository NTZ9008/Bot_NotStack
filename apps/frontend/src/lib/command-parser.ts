// ==========================================
// ⌨️ แปลงข้อความที่พิมพ์ในช่อง ⌘K เป็นคำสั่ง (ไทย / อังกฤษ)
//   ให้ xp @boat 500 · เพิ่ม XP boat 1.5k เพราะช่วยงาน · give 500 xp to boat · xp boat -200
//   ตั้ง xp boat 1000 · รีเซ็ต xp boat · log boat · ค้นหา log voice
// ไม่มี dependency — ทดสอบได้ใน Node (tests/frontend-lib.test.cjs)
// ==========================================

export type XpCommandAction = 'add' | 'subtract' | 'set' | 'reset';

export type ParsedCommand = { type: 'xp'; action: XpCommandAction; target: string; amount: number; reason?: string } | { type: 'activity'; query: string };

const XP_WORDS = new Set(['xp', 'exp', 'เอ็กซ์พี', 'เอกซ์พี', 'ค่าประสบการณ์', 'ประสบการณ์']);
const VERBS: Record<string, XpCommandAction> = {
    ให้: 'add',
    เพิ่ม: 'add',
    แจก: 'add',
    give: 'add',
    add: 'add',
    grant: 'add',
    award: 'add',
    ลด: 'subtract',
    หัก: 'subtract',
    ลบ: 'subtract',
    take: 'subtract',
    remove: 'subtract',
    subtract: 'subtract',
    deduct: 'subtract',
    ตั้ง: 'set',
    ตั้งค่า: 'set',
    เซ็ต: 'set',
    set: 'set',
    รีเซ็ต: 'reset',
    รีเซต: 'reset',
    ล้าง: 'reset',
    reset: 'reset',
};
// คำเชื่อมที่ข้ามได้ ("give 500 xp to boat", "ให้ 500 xp แก่ boat")
const FILLERS = new Set(['to', 'from', 'for', 'of', 'แก่', 'กับ', 'ของ', 'ให้', 'จาก', 'เป็น', 'คุณ', 'ไป']);
const REASON_RE = /\s+(?:เพราะ(?:ว่า)?|เนื่องจาก|เหตุผล\s*:?|because|reason\s*:?|\/\/)\s*(.+)$/i;
const ACTIVITY_RE = /^(?:(?:ค้นหา|หา|search|find)\s+)?(?:log|logs|activity|ล็อก|ล็อค|ประวัติ|กิจกรรม)\s+(.+)$/i;
const AMOUNT_RE = /^([+-])?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(k|m|พัน|หมื่น|แสน|ล้าน)?(?:xp|exp)?$/i;
const MULTIPLIER: Record<string, number> = { k: 1e3, m: 1e6, พัน: 1e3, หมื่น: 1e4, แสน: 1e5, ล้าน: 1e6 };

export const MAX_COMMAND_XP = 2_000_000_000;

function parseAmount(token: string): { value: number; sign: '+' | '-' | null } | null {
    const match = AMOUNT_RE.exec(token);
    if (!match) return null;
    const value = Math.round(Number(match[2]!.replace(/,/g, '')) * (match[3] ? MULTIPLIER[match[3].toLowerCase()]! : 1));
    if (!Number.isFinite(value) || value < 0 || value > MAX_COMMAND_XP) return null;
    return { value, sign: (match[1] as '+' | '-' | undefined) ?? null };
}

// <@123> / <@!123> (mention ที่ก๊อปมาจาก Discord) → 123 ; @boat → boat
export function cleanTarget(raw: string): string {
    const mention = /^<@!?(\d{17,20})>$/.exec(raw.trim());
    if (mention) return mention[1]!;
    return raw.trim().replace(/^@+/, '').trim();
}

export const XP_ACTION_LABEL: Record<XpCommandAction, string> = {
    add: 'ให้',
    subtract: 'หัก',
    set: 'ตั้ง',
    reset: 'รีเซ็ต',
};

interface XpDraft {
    hasXpWord: boolean;
    action: XpCommandAction | null;
    target: string;
    amount: { value: number; sign: '+' | '-' | null } | null;
    reason?: string;
}

// แยกส่วนของคำสั่ง XP ที่พิมพ์มาแล้ว (อาจยังไม่ครบ) — ใช้ทั้งตอนแปลงเป็นคำสั่งและตอนแสดงคำแนะนำทีละขั้น
function analyzeXp(input: string): XpDraft {
    let text = input.trim().replace(/\s+/g, ' ');
    let reason: string | undefined;
    const reasonMatch = REASON_RE.exec(text);
    if (reasonMatch) {
        reason = reasonMatch[1]!.trim();
        text = text.slice(0, reasonMatch.index).trim();
    }

    // "500xp" / "xp500" ติดกัน → แยกเป็นสองคำ
    const tokens = text
        .replace(/(\d)(xp|exp)\b/gi, '$1 $2')
        .replace(/\b(xp|exp)([+-]?\d)/gi, '$1 $2')
        .split(' ')
        .filter(Boolean);

    let action: XpCommandAction | null = null;
    let hasXpWord = false;
    let amount: XpDraft['amount'] = null;
    const rest: string[] = [];

    for (const token of tokens) {
        const lower = token.toLowerCase();
        if (XP_WORDS.has(lower)) {
            hasXpWord = true;
            continue;
        }
        if (!action && VERBS[lower] && rest.length === 0) {
            action = VERBS[lower];
            continue;
        }
        if (!amount) {
            const parsed = parseAmount(token);
            if (parsed) {
                amount = parsed;
                continue;
            }
        }
        if (FILLERS.has(lower) && (action || hasXpWord)) continue;
        rest.push(token);
    }

    if (!action && amount?.sign) action = amount.sign === '-' ? 'subtract' : 'add';
    else if (amount?.sign === '-' && action === 'add') action = 'subtract';
    return { hasXpWord, action, target: cleanTarget(rest.join(' ')), amount, ...(reason ? { reason } : {}) };
}

export function parseCommand(input: string): ParsedCommand | null {
    const text = input.trim().replace(/\s+/g, ' ');
    if (!text) return null;

    const activity = ACTIVITY_RE.exec(text);
    if (activity) return { type: 'activity', query: activity[1]!.trim() };

    const { hasXpWord, action, target, amount, reason } = analyzeXp(text);
    // ต้องมีคำว่า xp เสมอ — กันพิมพ์ชื่อเมนูธรรมดาแล้วกลายเป็นคำสั่ง
    if (!hasXpWord || !action || !target) return null;
    if (action === 'reset') return { type: 'xp', action, target, amount: 0, ...(reason ? { reason } : {}) };
    if (!amount || (amount.value === 0 && action !== 'set')) return null;
    return { type: 'xp', action, target, amount: amount.value, ...(reason ? { reason } : {}) };
}

// ==========================================
// 🧭 คำแนะนำระหว่างพิมพ์คำสั่ง — บอกว่าพิมพ์อะไรไปแล้ว และต้องพิมพ์อะไรต่อ
// ==========================================
export interface CommandGuideStep {
    label: string;
    // ค่าที่พิมพ์ไว้แล้ว (ไม่มี = ยังไม่ได้พิมพ์)
    value?: string;
    optional?: boolean;
}

export interface CommandGuide {
    title: string;
    // สิ่งที่ต้องพิมพ์ต่อ (ครบแล้ว = null)
    next: string | null;
    example: string;
    steps: CommandGuideStep[];
}

const LOG_START_RE = /^(?:(?:ค้นหา|หา|search|find)\s+)?(?:log|logs|activity|ล็อก|ล็อค|กิจกรรม)\s*$/i;

export function commandGuide(input: string): CommandGuide | null {
    const text = input.trim().replace(/\s+/g, ' ');
    if (!text) return null;

    if (LOG_START_RE.test(text)) {
        return {
            title: 'ค้นหาในประวัติเซิร์ฟเวอร์',
            next: 'พิมพ์คำที่จะค้น เช่น ชื่อสมาชิก ชื่อห้อง หรือ “ห้องเสียง”',
            example: 'log boat',
            steps: [{ label: 'คำค้น' }],
        };
    }

    if (text === '@') {
        return {
            title: 'ค้นหาสมาชิก',
            next: 'พิมพ์ชื่อหรือ username ต่อจาก @ แล้วเลือกสมาชิก เพื่อดูสิ่งที่ทำได้ (ให้ XP, ดูอันดับ, ดูกิจกรรม)',
            example: '@boat',
            steps: [{ label: 'ชื่อสมาชิก' }],
        };
    }

    // ต้องพิมพ์คำว่า xp แล้วถึงแนะนำ — พิมพ์ “ตั้งค่า” เพื่อหาหน้าเฉยๆ จะไม่ขึ้น
    const draft = analyzeXp(text);
    if (!draft.hasXpWord) return null;

    const action = draft.action;
    const needsAmount = action !== 'reset';
    const steps: CommandGuideStep[] = [
        { label: 'ทำอะไร', value: action ? XP_ACTION_LABEL[action] : undefined },
        { label: 'สมาชิก', value: draft.target ? `@${draft.target}` : undefined },
        ...(needsAmount ? [{ label: 'จำนวน XP', value: draft.amount ? draft.amount.value.toLocaleString('th-TH') : undefined }] : []),
        { label: 'เหตุผล', value: draft.reason, optional: true },
    ];

    let next: string | null = null;
    if (!action) next = 'เริ่มด้วยคำสั่ง ให้ / หัก / ตั้ง / รีเซ็ต';
    else if (!draft.target) next = 'พิมพ์ชื่อสมาชิกหลัง @ (หรือวาง User ID)';
    else if (needsAmount && !draft.amount) next = 'พิมพ์จำนวน XP เช่น 500 หรือ 1.5k';
    else if (!draft.reason) next = 'ใส่เหตุผลได้ด้วยคำว่า “เพราะ…” (ไม่บังคับ) แล้วเลือกสมาชิกด้านล่าง';

    const verb = action ? XP_ACTION_LABEL[action] : 'ให้';
    return {
        title: action === 'reset' ? 'รีเซ็ต XP ของสมาชิก' : `${verb} XP สมาชิก`,
        next,
        example: action === 'reset' ? 'รีเซ็ต xp @boat เพราะเริ่มฤดูกาลใหม่' : `${verb} xp @boat 500 เพราะช่วยตอบคำถาม`,
        steps,
    };
}

// "ให้ 500 XP" / "รีเซ็ต XP"
export function describeXpCommand(action: XpCommandAction, amount: number): string {
    if (action === 'reset') return 'รีเซ็ต XP';
    return `${XP_ACTION_LABEL[action]} ${amount.toLocaleString('th-TH')} XP`;
}

// XP หลังทำคำสั่ง (ใช้แสดงตัวอย่างก่อนยืนยัน — ค่าจริงคำนวณที่ backend)
export function previewXp(action: XpCommandAction, current: number, amount: number): number {
    if (action === 'add') return Math.min(MAX_COMMAND_XP, current + amount);
    if (action === 'subtract') return Math.max(0, current - amount);
    if (action === 'set') return amount;
    return 0;
}

// ==========================================
// 🔎 จับคู่คำค้นแบบง่าย — ทุกคำต้องเจอ (ไม่สนตัวพิมพ์เล็ก/ใหญ่) ; คะแนนสูง = เจอใกล้ต้นข้อความ / ต้นคำ
// ==========================================
export function matchScore(haystack: string, query: string): number {
    const q = query.trim().toLowerCase();
    if (!q) return 1;
    const text = haystack.toLowerCase();
    let score = 0;
    for (const word of q.split(/\s+/)) {
        const index = text.indexOf(word);
        if (index < 0) return 0;
        const atWordStart = index === 0 || /[\s/(·-]/.test(text[index - 1]!);
        score += 1 + (atWordStart ? 1 : 0) + Math.max(0, 1 - index / 40);
    }
    return score;
}
