import type { SKRSContext2D } from '@napi-rs/canvas';
import { formatBaht, roundMoney, type FundMemberView, type FundTopicDetail } from '@notstack/shared';
import { fontString } from '../../common/canvas/fonts';
import { renderSurface } from '../../common/utils/render-surface';

// ==========================================
// FUND REPORT CARD RENDERER — วาดการ์ดสรุปรายงานการเก็บเงินเป็น PNG ด้วย @napi-rs/canvas
// เลย์เอาต์: ส่วนหัว / วงแหวนความคืบหน้า + ยอดหลัก / สถิติย่อย / รายชื่อสมาชิกพร้อมแถบรายคน / ส่วนท้าย
// ตัวอักษรใหญ่ขึ้นจากรุ่นก่อน เพราะ Discord ย่อรูปลงราวครึ่งหนึ่งในหน้าแชท
// ==========================================
const WIDTH = 960;
const PAD = 40;
const RADIUS = 24;
const font = (weight: number, size: number) => fontString('kanit', weight, size);

const C = {
    bg: '#14151a',
    surface: '#1c1e24',
    border: 'rgba(255, 255, 255, 0.07)',
    text: '#f8fafc',
    textSoft: '#cbd5e1',
    muted: '#8b95a7',
    faint: '#5b6474',
    track: '#2a2d35',
};

type Tone = 'paid' | 'partial' | 'unpaid' | 'closed';
const TONE: Record<Tone, { main: string; soft: string; tint: string }> = {
    paid: { main: '#22c55e', soft: '#4ade80', tint: 'rgba(34, 197, 94, 0.14)' },
    partial: { main: '#f59e0b', soft: '#fbbf24', tint: 'rgba(245, 158, 11, 0.14)' },
    unpaid: { main: '#ef4444', soft: '#f87171', tint: 'rgba(239, 68, 68, 0.14)' },
    closed: { main: '#64748b', soft: '#cbd5e1', tint: 'rgba(100, 116, 139, 0.18)' },
};

type IconName = 'wallet' | 'clock' | 'users' | 'calendar';

function truncateText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let out = text;
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
    return `${out}…`;
}

// ตัวเลขเงินแบบไม่มีหน่วย (ใช้ตอนวาดหน่วยแยกด้วยตัวอักษรเล็กกว่า)
function plainAmount(value: number): string {
    return formatBaht(value).replace(/\s*บาท\s*$/, '');
}

// ไอคอนเวกเตอร์สไตล์ Lucide (ไม่พึ่งพาฟอนต์อิโมจิ)
function drawIcon(ctx: SKRSContext2D, name: IconName, cx: number, cy: number, size: number, color: string): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.8, size * 0.1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const r = size / 2;
    ctx.beginPath();
    if (name === 'wallet') {
        ctx.roundRect(cx - r, cy - r * 0.78, size, r * 1.56, 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.roundRect(cx + r * 0.15, cy - r * 0.28, r * 0.85, r * 0.56, 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + r * 0.5, cy, Math.max(1.5, size * 0.06), 0, Math.PI * 2);
        ctx.fill();
    } else if (name === 'clock') {
        ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.5);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + r * 0.38, cy + r * 0.24);
        ctx.stroke();
    } else if (name === 'users') {
        ctx.arc(cx - r * 0.22, cy - r * 0.32, r * 0.34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx - r * 0.22, cy + r * 0.72, r * 0.62, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + r * 0.42, cy - r * 0.28, r * 0.26, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        ctx.roundRect(cx - r * 0.85, cy - r * 0.72, r * 1.7, r * 1.6, 3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.85, cy - r * 0.2);
        ctx.lineTo(cx + r * 0.85, cy - r * 0.2);
        ctx.moveTo(cx - r * 0.4, cy - r * 0.95);
        ctx.lineTo(cx - r * 0.4, cy - r * 0.5);
        ctx.moveTo(cx + r * 0.4, cy - r * 0.95);
        ctx.lineTo(cx + r * 0.4, cy - r * 0.5);
        ctx.stroke();
    }
    ctx.restore();
}

// นับถอยหลังวันครบกำหนด (เทียบวันตามเวลาไทย)
function dueInfo(dueDate: string | null, closed: boolean): { date: string; hint: string; tone: Tone | null } {
    if (!dueDate) return { date: 'ไม่กำหนด', hint: '', tone: null };
    const due = new Date(dueDate);
    const date = due.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
    if (closed) return { date, hint: '', tone: null };
    const dayKey = (d: Date) => Math.floor((d.getTime() + 7 * 3600_000) / 86400_000);
    const diff = dayKey(due) - dayKey(new Date());
    if (diff > 0) return { date, hint: `อีก ${diff} วัน`, tone: diff <= 3 ? 'partial' : null };
    if (diff === 0) return { date, hint: 'ครบกำหนดวันนี้', tone: 'partial' };
    return { date, hint: `เลยกำหนด ${-diff} วัน`, tone: 'unpaid' };
}

// อักษรตัวแรกของชื่อ สำหรับวงกลมแทนรูปโปรไฟล์ (ข้ามสระ/วรรณยุกต์ไทยที่วางเดี่ยวๆ ไม่ได้)
function initialOf(name: string): string {
    const ch = [...name.trim()].find((c) => /[\p{L}\p{N}]/u.test(c) && !/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(c));
    return (ch ?? '?').toUpperCase();
}

export async function renderFundReportCard(topic: FundTopicDetail, compact = false): Promise<Buffer> {
    const remaining = Math.max(0, roundMoney(topic.target - topic.collected));
    const ratio = topic.target > 0 ? Math.max(0, Math.min(1, topic.collected / topic.target)) : topic.memberCount > 0 ? 1 : 0;
    const pct = Math.round(ratio * 100);
    const done = topic.memberCount > 0 && topic.paidCount === topic.memberCount;
    const statusTone: Tone = topic.closed ? 'closed' : done ? 'paid' : 'partial';
    const accent = TONE[statusTone];

    const order: Record<FundMemberView['status'], number> = { unpaid: 0, partial: 1, paid: 2 };
    const sorted = [...topic.members].sort((a, b) => order[a.status] - order[b.status] || a.displayName.localeCompare(b.displayName, 'th'));
    const counts = { unpaid: 0, partial: 0, paid: 0 };
    for (const m of sorted) counts[m.status]++;
    const visible = sorted.slice(0, 14);
    const extra = sorted.length - visible.length;
    const rows = Math.ceil(visible.length / 2);

    const description = topic.description.trim().split(/\r?\n/)[0] ?? '';
    const headerH = description ? 120 : 92;
    const heroH = 240;
    const ROW_H = 68;
    const ROW_GAP = 12;
    const membersH = visible.length > 0 ? 64 + rows * (ROW_H + ROW_GAP) - ROW_GAP + (extra > 0 ? 40 : 0) + 28 : 0;
    const footerH = 56;
    const HEIGHT = PAD + headerH + heroH + membersH + footerH;

    const { ctx, encode } = renderSurface(WIDTH, HEIGHT, compact);
    ctx.textBaseline = 'alphabetic';

    // 1. พื้นหลัง + แสงสีสถานะจางๆ มุมซ้ายบน
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, WIDTH, HEIGHT, RADIUS);
    ctx.clip();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const glow = ctx.createRadialGradient(140, 0, 0, 140, 0, 560);
    glow.addColorStop(0, accent.tint);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = accent.main;
    ctx.fillRect(0, 0, WIDTH, 6);
    ctx.restore();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, WIDTH - 2, HEIGHT - 2, RADIUS);
    ctx.stroke();

    // 2. ส่วนหัว: ไอคอน + ป้ายย่อย + ชื่อหัวข้อ + ป้ายสถานะ
    let y = PAD;
    ctx.fillStyle = accent.tint;
    ctx.beginPath();
    ctx.roundRect(PAD, y, 56, 56, 16);
    ctx.fill();
    drawIcon(ctx, 'wallet', PAD + 28, y + 28, 28, accent.soft);

    const statusLabel = topic.closed ? 'ปิดการเก็บแล้ว' : done ? 'เก็บครบแล้ว' : 'กำลังเปิดรับเงิน';
    ctx.font = font(600, 18);
    const pillW = ctx.measureText(statusLabel).width + 44;
    const pillX = WIDTH - PAD - pillW;
    ctx.fillStyle = accent.tint;
    ctx.beginPath();
    ctx.roundRect(pillX, y + 8, pillW, 40, 20);
    ctx.fill();
    ctx.fillStyle = accent.main;
    ctx.beginPath();
    ctx.arc(pillX + 20, y + 28, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accent.soft;
    ctx.textAlign = 'left';
    ctx.fillText(statusLabel, pillX + 32, y + 34);

    const titleX = PAD + 76;
    ctx.fillStyle = C.muted;
    ctx.font = font(500, 16);
    ctx.fillText('รายงานการเก็บเงิน', titleX, y + 20);
    ctx.fillStyle = C.text;
    ctx.font = font(700, 32);
    ctx.fillText(truncateText(ctx, topic.name, pillX - titleX - 20), titleX, y + 56);
    if (description) {
        ctx.fillStyle = C.muted;
        ctx.font = font(400, 18);
        ctx.fillText(truncateText(ctx, description, WIDTH - titleX - PAD), titleX, y + 90);
    }
    y += headerH;

    // 3. Hero: วงแหวนความคืบหน้า (ซ้าย) + ยอดเก็บได้ตัวใหญ่ + สถิติย่อย 3 ช่อง (ขวา)
    ctx.fillStyle = C.surface;
    ctx.beginPath();
    ctx.roundRect(PAD, y, WIDTH - PAD * 2, heroH - 24, 20);
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    const ringR = 76;
    const ringCx = PAD + 32 + ringR;
    const ringCy = y + (heroH - 24) / 2;
    ctx.lineCap = 'round';
    ctx.lineWidth = 18;
    ctx.strokeStyle = C.track;
    ctx.beginPath();
    ctx.arc(ringCx, ringCy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    if (ratio > 0) {
        const start = -Math.PI / 2;
        const ringGrad = ctx.createLinearGradient(ringCx - ringR, ringCy - ringR, ringCx + ringR, ringCy + ringR);
        ringGrad.addColorStop(0, accent.soft);
        ringGrad.addColorStop(1, accent.main);
        ctx.strokeStyle = ringGrad;
        ctx.beginPath();
        ctx.arc(ringCx, ringCy, ringR, start, start + Math.PI * 2 * Math.max(ratio, 0.02));
        ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.textAlign = 'center';
    ctx.fillStyle = C.text;
    ctx.font = font(700, 40);
    ctx.fillText(`${pct}%`, ringCx, ringCy + 10);
    ctx.fillStyle = C.muted;
    ctx.font = font(400, 15);
    ctx.fillText('ของเป้าหมาย', ringCx, ringCy + 36);

    const infoX = ringCx + ringR + 44;
    const infoW = WIDTH - PAD - 28 - infoX;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.font = font(500, 17);
    ctx.fillText('เก็บได้แล้ว', infoX, y + 46);
    ctx.fillStyle = accent.soft;
    ctx.font = font(700, 48);
    const collectedText = plainAmount(topic.collected);
    ctx.fillText(collectedText, infoX, y + 98);
    const ux = infoX + ctx.measureText(collectedText).width + 12;
    ctx.fillStyle = C.textSoft;
    ctx.font = font(500, 22);
    ctx.fillText(`/ ${formatBaht(topic.target)}`, ux, y + 96);

    // สถิติย่อย 3 ช่อง
    const due = dueInfo(topic.dueDate, topic.closed);
    const rate = topic.dailyRate && topic.dailyRate > 0 ? `${formatBaht(topic.dailyRate)}/วัน` : `${formatBaht(topic.amountPerMember)}/คน`;
    const chips: { icon: IconName; label: string; value: string; sub: string; color: string; subColor?: string }[] = [
        { icon: 'clock', label: 'คงค้าง', value: formatBaht(remaining), sub: rate, color: remaining > 0 ? TONE.partial.soft : C.textSoft },
        {
            icon: 'users',
            label: 'จ่ายครบ',
            value: `${topic.paidCount}/${topic.memberCount} คน`,
            sub: counts.unpaid > 0 ? `ยังไม่จ่าย ${counts.unpaid} คน` : 'ทุกคนเริ่มจ่ายแล้ว',
            color: C.text,
            subColor: counts.unpaid > 0 ? TONE.unpaid.soft : TONE.paid.soft,
        },
        { icon: 'calendar', label: 'ครบกำหนด', value: due.date, sub: due.hint, color: C.text, subColor: due.tone ? TONE[due.tone].soft : undefined },
    ];
    const chipGap = 12;
    const chipW = (infoW - chipGap * 2) / 3;
    const chipY = y + 124;
    const chipH = 84;
    chips.forEach((chip, i) => {
        const cx = infoX + i * (chipW + chipGap);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.beginPath();
        ctx.roundRect(cx, chipY, chipW, chipH, 14);
        ctx.fill();
        drawIcon(ctx, chip.icon, cx + 24, chipY + 24, 16, C.muted);
        ctx.textAlign = 'left';
        ctx.fillStyle = C.muted;
        ctx.font = font(400, 15);
        ctx.fillText(chip.label, cx + 40, chipY + 29);
        ctx.fillStyle = chip.color;
        ctx.font = font(700, 20);
        ctx.fillText(truncateText(ctx, chip.value, chipW - 28), cx + 16, chipY + 56);
        if (chip.sub) {
            ctx.fillStyle = chip.subColor ?? C.faint;
            ctx.font = font(400, 14);
            ctx.fillText(truncateText(ctx, chip.sub, chipW - 28), cx + 16, chipY + 75);
        }
    });
    y += heroH;

    // 4. รายชื่อสมาชิก 2 คอลัมน์ พร้อมแถบความคืบหน้ารายคน
    if (visible.length > 0) {
        ctx.textAlign = 'left';
        ctx.fillStyle = C.text;
        ctx.font = font(700, 22);
        ctx.fillText('สถานะสมาชิก', PAD, y + 28);

        // ป้ายนับจำนวนตามสถานะ (ชิดขวา)
        const tags: { tone: Tone; label: string }[] = [
            { tone: 'paid', label: `ครบ ${counts.paid}` },
            { tone: 'partial', label: `บางส่วน ${counts.partial}` },
            { tone: 'unpaid', label: `ยังไม่จ่าย ${counts.unpaid}` },
        ];
        ctx.font = font(500, 15);
        let tx = WIDTH - PAD;
        for (const tag of [...tags].reverse()) {
            const w = ctx.measureText(tag.label).width + 34;
            tx -= w;
            ctx.fillStyle = TONE[tag.tone].tint;
            ctx.beginPath();
            ctx.roundRect(tx, y + 6, w, 30, 15);
            ctx.fill();
            ctx.fillStyle = TONE[tag.tone].main;
            ctx.beginPath();
            ctx.arc(tx + 15, y + 21, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = TONE[tag.tone].soft;
            ctx.fillText(tag.label, tx + 25, y + 25);
            tx -= 8;
        }

        const listTop = y + 56;
        const colGap = 14;
        const colW = (WIDTH - PAD * 2 - colGap) / 2;
        visible.forEach((m, idx) => {
            const tone = TONE[m.status];
            const mx = PAD + (idx % 2) * (colW + colGap);
            const my = listTop + Math.floor(idx / 2) * (ROW_H + ROW_GAP);
            ctx.fillStyle = C.surface;
            ctx.beginPath();
            ctx.roundRect(mx, my, colW, ROW_H, 14);
            ctx.fill();

            // วงกลมอักษรย่อ + จุดสถานะ
            const avCx = mx + 34;
            const avCy = my + ROW_H / 2;
            ctx.fillStyle = tone.tint;
            ctx.beginPath();
            ctx.arc(avCx, avCy, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = tone.soft;
            ctx.font = font(700, 18);
            ctx.textAlign = 'center';
            ctx.fillText(initialOf(m.displayName), avCx, avCy + 5);

            const textX = mx + 66;
            const rightX = mx + colW - 18;
            ctx.textAlign = 'right';
            ctx.font = font(600, 17);
            ctx.fillStyle = tone.soft;
            const amount = m.status === 'paid' ? `ครบ ${plainAmount(m.paid)}` : `ค้าง ${plainAmount(m.remaining)}`;
            ctx.fillText(amount, rightX, my + 30);
            const amountW = ctx.measureText(amount).width;

            ctx.textAlign = 'left';
            ctx.fillStyle = C.text;
            ctx.font = font(600, 18);
            ctx.fillText(truncateText(ctx, m.displayName, rightX - textX - amountW - 16), textX, my + 30);

            // แถบความคืบหน้ารายคน + ตัวเลข จ่ายแล้ว/ยอดที่ต้องจ่าย
            const mRatio = m.target > 0 ? Math.max(0, Math.min(1, m.paid / m.target)) : m.status === 'paid' ? 1 : 0;
            ctx.font = font(400, 13);
            const sub = `${plainAmount(m.paid)}/${plainAmount(m.target)}`;
            const subW = ctx.measureText(sub).width;
            ctx.fillStyle = C.muted;
            ctx.textAlign = 'right';
            ctx.fillText(sub, rightX, my + 52);
            const barX = textX;
            const barW = rightX - subW - 12 - barX;
            ctx.fillStyle = C.track;
            ctx.beginPath();
            ctx.roundRect(barX, my + 43, barW, 8, 4);
            ctx.fill();
            if (mRatio > 0) {
                ctx.fillStyle = tone.main;
                ctx.beginPath();
                ctx.roundRect(barX, my + 43, Math.max(8, barW * mRatio), 8, 4);
                ctx.fill();
            }
        });

        if (extra > 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = C.muted;
            ctx.font = font(400, 16);
            ctx.fillText(`และสมาชิกอีก ${extra} คน`, WIDTH / 2, listTop + rows * (ROW_H + ROW_GAP) + 18);
        }
        y += membersH;
    }

    // 5. ส่วนท้าย
    const nowText = new Date().toLocaleString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok',
    });
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, HEIGHT - footerH);
    ctx.lineTo(WIDTH - PAD, HEIGHT - footerH);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = C.faint;
    ctx.font = font(500, 15);
    ctx.fillText('NotStack • ระบบเก็บเงินตามเป้า', PAD, HEIGHT - 22);
    ctx.textAlign = 'right';
    ctx.fillText(`อัปเดต ${nowText}`, WIDTH - PAD, HEIGHT - 22);

    return encode();
}
