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

export function parseCommand(input: string): ParsedCommand | null {
    let text = input.trim().replace(/\s+/g, ' ');
    if (!text) return null;

    const activity = ACTIVITY_RE.exec(text);
    if (activity) return { type: 'activity', query: activity[1]!.trim() };

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
    let amount: { value: number; sign: '+' | '-' | null } | null = null;
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

    // ต้องมีคำว่า xp เสมอ — กันพิมพ์ชื่อเมนูธรรมดาแล้วกลายเป็นคำสั่ง
    if (!hasXpWord) return null;
    if (!action) {
        if (!amount?.sign) return null;
        action = amount.sign === '-' ? 'subtract' : 'add';
    } else if (amount?.sign === '-' && action === 'add') {
        action = 'subtract';
    }
    const target = cleanTarget(rest.join(' '));
    if (!target) return null;
    if (action === 'reset') return { type: 'xp', action, target, amount: 0, ...(reason ? { reason } : {}) };
    if (!amount || (amount.value === 0 && action !== 'set')) return null;
    return { type: 'xp', action, target, amount: amount.value, ...(reason ? { reason } : {}) };
}

export const XP_ACTION_LABEL: Record<XpCommandAction, string> = {
    add: 'ให้',
    subtract: 'หัก',
    set: 'ตั้ง',
    reset: 'รีเซ็ต',
};

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
