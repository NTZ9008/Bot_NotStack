import type { SKRSContext2D } from '@napi-rs/canvas';
import { formatBaht, roundMoney, type FundMemberView, type FundTopicDetail } from '@notstack/shared';
import { fontString } from '../../common/canvas/fonts';
import { renderSurface } from '../../common/utils/render-surface';

// ==========================================
// FUND REPORT CARD RENDERER — วาดการ์ดสรุปรายงานการเก็บเงินเป็น PNG ด้วย @napi-rs/canvas
// เลย์เอาต์: ส่วนหัว / ยอดหลักพร้อมแถบความคืบหน้า / สถิติย่อย / รายชื่อสมาชิก / ส่วนท้าย
// ตัวอักษรใหญ่ขึ้นจากรุ่นก่อน เพราะ Discord ย่อรูปลงราวครึ่งหนึ่งในหน้าแชท
// ==========================================
const WIDTH = 960;
const PAD = 44;
const RADIUS = 16;
const font = (weight: number, size: number) => fontString('kanit', weight, size);

const C = {
    bg: '#0F172A',
    ink: '#F1F5FB',
    muted: '#8A96B0',
    line: '#272E3F',
    paid: '#10B981',
    owe: '#F59E0B',
    member: '#38BDF8',
    danger: '#EF4444',
};

type Tone = 'paid' | 'partial' | 'unpaid' | 'closed';

function truncateText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let out = text;
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
    return `${out}…`;
}

function plainAmount(value: number): string {
    return formatBaht(value).replace(/\s*บาท\s*$/, '');
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

export async function renderFundReportCard(topic: FundTopicDetail, compact = false): Promise<Buffer> {
    const remaining = Math.max(0, roundMoney(topic.target - topic.collected));
    const ratio = topic.target > 0 ? Math.max(0, Math.min(1, topic.collected / topic.target)) : topic.memberCount > 0 ? 1 : 0;
    const pct = Math.round(ratio * 100);
    const done = topic.memberCount > 0 && topic.paidCount === topic.memberCount;
    const order: Record<FundMemberView['status'], number> = { unpaid: 0, partial: 1, paid: 2 };
    const sorted = [...topic.members].sort(
        (a, b) => b.remaining - a.remaining || order[a.status] - order[b.status] || a.displayName.localeCompare(b.displayName, 'th'),
    );
    const counts = { unpaid: 0, partial: 0, paid: 0 };
    for (const m of sorted) counts[m.status]++;
    const visible = sorted.slice(0, 14);
    const extra = sorted.length - visible.length;
    const description = topic.description.trim().split(/\r?\n/)[0] ?? '';
    const headerH = description ? 120 : 92;
    const heroH = 260;
    const ROW_H = 48;
    const SECTION_H = 42;
    const memberSectionCount = counts.paid > 0 ? 3 : 2;
    const membersH = visible.length > 0 ? 46 + memberSectionCount * SECTION_H + visible.length * ROW_H + (extra > 0 ? 32 : 0) : 0;
    const footerGap = 28;
    const footerH = 64;
    const HEIGHT = PAD + headerH + heroH + membersH + footerGap + footerH;

    const { ctx, encode } = renderSurface(WIDTH, HEIGHT, compact);
    ctx.textBaseline = 'alphabetic';

    // 1. พื้นการ์ด navy และเส้นขอบแบบงานพิมพ์
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, WIDTH, HEIGHT, RADIUS);
    ctx.clip();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(1, 1, WIDTH - 2, HEIGHT - 2, RADIUS);
    ctx.stroke();

    // 2. ส่วนหัวแบบหัวกระดาษและตราสถานะ
    let y = PAD;
    const statusLabel = topic.closed ? 'ปิดการเก็บแล้ว' : done ? 'เก็บครบแล้ว' : 'เปิดรับเงิน';
    const statusColor = topic.closed ? C.muted : C.paid;
    ctx.font = font(500, 14);
    const stampW = ctx.measureText(statusLabel).width + 24;
    const stampX = WIDTH - PAD - stampW;
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(stampX, y + 5, stampW, 30, 6);
    ctx.stroke();
    ctx.fillStyle = statusColor;
    ctx.textAlign = 'left';
    ctx.fillText(statusLabel, stampX + 12, y + 25);

    const titleX = PAD;
    ctx.fillStyle = C.muted;
    ctx.font = font(500, 13);
    ctx.fillText('รายงานการเก็บเงิน', titleX, y + 18);
    ctx.fillStyle = C.ink;
    ctx.font = font(600, 28);
    ctx.fillText(truncateText(ctx, topic.name, stampX - titleX - 20), titleX, y + 54);
    if (description) {
        ctx.fillStyle = C.muted;
        ctx.font = font(400, 16);
        ctx.fillText(truncateText(ctx, description, WIDTH - titleX - PAD), titleX, y + 90);
    }
    y += headerH;

    // 3. ยอดหลัก แถบความคืบหน้า และตัวเลขสรุปที่คั่นด้วยเส้น
    const infoX = PAD;
    const infoW = WIDTH - PAD * 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.font = font(500, 14);
    ctx.fillText('เก็บได้แล้ว', infoX, y + 24);
    ctx.fillStyle = C.paid;
    ctx.font = font(600, 56);
    const collectedText = plainAmount(topic.collected);
    ctx.fillText(collectedText, infoX, y + 82);
    const ux = infoX + ctx.measureText(collectedText).width + 12;
    ctx.fillStyle = C.muted;
    ctx.font = font(500, 18);
    ctx.fillText(truncateText(ctx, `/ ${formatBaht(topic.target)}`, Math.max(0, WIDTH - PAD - ux - 70)), ux, y + 78);

    ctx.textAlign = 'right';
    ctx.fillStyle = C.ink;
    ctx.font = font(500, 18);
    ctx.fillText(`${pct}%`, WIDTH - PAD, y + 76);

    const progressY = y + 98;
    ctx.fillStyle = C.line;
    ctx.beginPath();
    ctx.roundRect(infoX, progressY, infoW, 6, 3);
    ctx.fill();
    if (ratio > 0) {
        ctx.fillStyle = C.paid;
        ctx.beginPath();
        ctx.roundRect(infoX, progressY, Math.max(6, infoW * ratio), 6, 3);
        ctx.fill();
    }

    // สถิติสามคอลัมน์แบบไม่มีพื้นการ์ด
    const due = dueInfo(topic.dueDate, topic.closed);
    const rate = topic.dailyRate && topic.dailyRate > 0 ? `${formatBaht(topic.dailyRate)}/วัน` : `${formatBaht(topic.amountPerMember)}/คน`;
    const chips: { label: string; value: string; sub: string; color: string }[] = [
        { label: 'คงค้าง', value: formatBaht(remaining), sub: rate, color: remaining > 0 ? C.owe : C.muted },
        {
            label: 'จ่ายครบ',
            value: `${topic.paidCount}/${topic.memberCount} คน`,
            sub: counts.unpaid > 0 ? `ยังไม่จ่าย ${counts.unpaid} คน` : 'ทุกคนเริ่มจ่ายแล้ว',
            color: C.member,
        },
        { label: 'ครบกำหนด', value: due.date, sub: due.hint, color: C.ink },
    ];
    const statsY = y + 132;
    const statsH = 92;
    const statW = infoW / 3;
    const statAccents = [C.owe, C.member, C.line];
    chips.forEach((chip, i) => {
        const cx = infoX + i * statW;
        ctx.fillStyle = statAccents[i] ?? C.line;
        ctx.fillRect(cx, statsY, statW, 2);
        if (i > 0) {
            ctx.strokeStyle = C.line;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx, statsY);
            ctx.lineTo(cx, statsY + statsH);
            ctx.stroke();
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = C.muted;
        ctx.font = font(500, 13);
        const statInset = i === 0 ? 0 : 20;
        ctx.fillText(chip.label, cx + statInset, statsY + 20);
        ctx.fillStyle = chip.color;
        ctx.font = font(600, 20);
        ctx.fillText(truncateText(ctx, chip.value, statW - statInset - 16), cx + statInset, statsY + 50);
        if (chip.sub) {
            ctx.fillStyle = C.muted;
            ctx.font = font(400, 13);
            ctx.fillText(truncateText(ctx, chip.sub, statW - statInset - 16), cx + statInset, statsY + 74);
        }
    });
    y += heroH;

    // 4. รายชื่อสมาชิกแบบตารางคอลัมน์เดียว แบ่งตามสถานะ
    if (visible.length > 0) {
        ctx.textAlign = 'left';
        ctx.fillStyle = C.ink;
        ctx.font = font(600, 18);
        ctx.fillText('สถานะสมาชิก', PAD, y + 28);

        const sectionHeading = (label: string, top: number) => {
            ctx.textAlign = 'left';
            ctx.fillStyle = C.muted;
            ctx.font = font(600, 13);
            ctx.fillText(label, PAD, top + 20);
            ctx.strokeStyle = C.line;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(PAD, top + 29);
            ctx.lineTo(WIDTH - PAD, top + 29);
            ctx.stroke();
        };
        const sectionMembers = [
            { label: `ยังไม่จ่าย (${counts.unpaid})`, members: visible.filter((m) => m.status === 'unpaid') },
            { label: `จ่ายบางส่วน (${counts.partial})`, members: visible.filter((m) => m.status === 'partial') },
            ...(counts.paid > 0 ? [{ label: `จ่ายครบ (${counts.paid})`, members: visible.filter((m) => m.status === 'paid') }] : []),
        ];
        let rowY = y + 48;
        const tableW = WIDTH - PAD * 2;
        const nameW = tableW - 160 - 90 - 90 - 16 * 3;
        const barX = PAD + nameW + 16;
        const paidRight = barX + 160 + 16 + 90;
        const oweRight = paidRight + 16 + 90;
        for (const section of sectionMembers) {
            sectionHeading(section.label, rowY);
            rowY += SECTION_H;
            for (const m of section.members) {
                const ratioPaid = m.target > 0 ? Math.max(0, Math.min(1, m.paid / m.target)) : m.status === 'paid' ? 1 : 0;
                const baseline = rowY + 30;
                ctx.textAlign = 'left';
                ctx.fillStyle = C.ink;
                ctx.font = font(500, 16);
                ctx.fillText(truncateText(ctx, m.displayName, nameW - 8), PAD, baseline);

                ctx.fillStyle = C.line;
                ctx.beginPath();
                ctx.roundRect(barX, rowY + 23, 160, 3, 2);
                ctx.fill();
                if (ratioPaid > 0) {
                    ctx.fillStyle = C.paid;
                    ctx.beginPath();
                    ctx.roundRect(barX, rowY + 23, Math.max(3, 160 * ratioPaid), 3, 2);
                    ctx.fill();
                }

                ctx.textAlign = 'right';
                ctx.fillStyle = C.muted;
                ctx.font = font(400, 14);
                ctx.fillText(`${plainAmount(m.paid)}/${plainAmount(m.target)}`, paidRight, baseline);

                ctx.fillStyle = m.status === 'paid' ? C.paid : m.remaining === m.target ? C.danger : C.owe;
                ctx.font = font(600, 16);
                ctx.fillText(m.status === 'paid' ? 'ครบ' : `ค้าง ${plainAmount(m.remaining)}`, oweRight, baseline);

                ctx.strokeStyle = C.line;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(PAD, rowY + ROW_H);
                ctx.lineTo(WIDTH - PAD, rowY + ROW_H);
                ctx.stroke();
                rowY += ROW_H;
            }
        }

        if (extra > 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = C.muted;
            ctx.font = font(400, 13);
            ctx.fillText(`และสมาชิกอีก ${extra} คน`, WIDTH / 2, rowY + 22);
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
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, HEIGHT - footerH);
    ctx.lineTo(WIDTH - PAD, HEIGHT - footerH);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.font = font(500, 13);
    ctx.fillText('NotStack • ระบบเก็บเงินตามเป้า', PAD, HEIGHT - 22);
    ctx.textAlign = 'right';
    ctx.fillText(`อัปเดต ${nowText}`, WIDTH - PAD, HEIGHT - 22);

    return encode();
}
