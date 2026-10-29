import type { SKRSContext2D } from '@napi-rs/canvas';
import { formatBaht, roundMoney, type FundMemberView, type FundTopicDetail } from '@notstack/shared';
import { fontString } from '../../common/canvas/fonts';
import { renderSurface } from '../../common/utils/render-surface';

// ==========================================
// 🖼️ FUND REPORT CARD RENDERER — วาดการ์ดสรุปรายงานการเก็บเงินเป็น PNG ด้วย @napi-rs/canvas
// ใช้อิคอนเวกเตอร์ที่วาดด้วย path แทนอิโมจิทั้งหมด เพื่อให้แสดงผลคมชัดเหมือนกันทุกอุปกรณ์
// ==========================================
const WIDTH = 1040;
const PAD = 36;
const font = (weight: number, size: number) => fontString('kanit', weight, size);

type IconName = 'wallet' | 'target' | 'banknote' | 'clock' | 'users' | 'receipt' | 'calendar' | 'check' | 'partial' | 'unpaid';

function truncateText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let out = text;
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
        out = out.slice(0, -1);
    }
    return `${out}…`;
}

// วาดไอคอนเวกเตอร์สไตล์ Lucide ลงบน Canvas (ไม่พึ่งพาฟอนต์อิโมจิ)
function drawVectorIcon(ctx: SKRSContext2D, name: IconName, cx: number, cy: number, size: number, color: string): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.8, size * 0.1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const r = size / 2;

    switch (name) {
        case 'wallet': {
            ctx.beginPath();
            ctx.roundRect(cx - r, cy - r * 0.78, size, size * 0.78 * 2, 4);
            ctx.stroke();
            ctx.beginPath();
            ctx.roundRect(cx + r * 0.15, cy - r * 0.28, r * 0.85, r * 0.56, 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx + r * 0.5, cy, Math.max(1.5, size * 0.06), 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case 'target': {
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case 'banknote': {
            ctx.beginPath();
            ctx.roundRect(cx - r, cy - r * 0.65, size, r * 1.3, 3);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - r * 0.65, cy - r * 0.25);
            ctx.lineTo(cx - r * 0.65, cy + r * 0.25);
            ctx.moveTo(cx + r * 0.65, cy - r * 0.25);
            ctx.lineTo(cx + r * 0.65, cy + r * 0.25);
            ctx.stroke();
            break;
        }
        case 'clock': {
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx, cy - r * 0.5);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx + r * 0.38, cy + r * 0.24);
            ctx.stroke();
            break;
        }
        case 'users': {
            ctx.beginPath();
            ctx.arc(cx - r * 0.22, cy - r * 0.32, r * 0.34, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx - r * 0.22, cy + r * 0.72, r * 0.62, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx + r * 0.42, cy - r * 0.28, r * 0.26, 0, Math.PI * 2);
            ctx.stroke();
            break;
        }
        case 'receipt': {
            ctx.beginPath();
            ctx.roundRect(cx - r * 0.72, cy - r * 0.9, r * 1.44, r * 1.8, 3);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - r * 0.38, cy - r * 0.35);
            ctx.lineTo(cx + r * 0.38, cy - r * 0.35);
            ctx.moveTo(cx - r * 0.38, cy + r * 0.05);
            ctx.lineTo(cx + r * 0.38, cy + r * 0.05);
            ctx.moveTo(cx - r * 0.38, cy + r * 0.45);
            ctx.lineTo(cx + r * 0.12, cy + r * 0.45);
            ctx.stroke();
            break;
        }
        case 'calendar': {
            ctx.beginPath();
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
            break;
        }
        case 'check': {
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - r * 0.38, cy + r * 0.02);
            ctx.lineTo(cx - r * 0.08, cy + r * 0.32);
            ctx.lineTo(cx + r * 0.42, cy - r * 0.26);
            ctx.stroke();
            break;
        }
        case 'partial': {
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - r * 0.36, cy);
            ctx.lineTo(cx + r * 0.36, cy);
            ctx.stroke();
            break;
        }
        case 'unpaid': {
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - r * 0.32, cy - r * 0.32);
            ctx.lineTo(cx + r * 0.32, cy + r * 0.32);
            ctx.moveTo(cx + r * 0.32, cy - r * 0.32);
            ctx.lineTo(cx - r * 0.32, cy + r * 0.32);
            ctx.stroke();
            break;
        }
    }
    ctx.restore();
}

export async function renderFundReportCard(topic: FundTopicDetail, compact = false): Promise<Buffer> {
    const remaining = Math.max(0, roundMoney(topic.target - topic.collected));
    const ratio = topic.target > 0 ? Math.max(0, Math.min(1, topic.collected / topic.target)) : topic.memberCount > 0 ? 1 : 0;
    const pct = Math.round(ratio * 100);
    const done = topic.memberCount > 0 && topic.paidCount === topic.memberCount;

    const order: Record<FundMemberView['status'], number> = { unpaid: 0, partial: 1, paid: 2 };
    const sortedMembers = [...topic.members].sort(
        (a, b) => order[a.status] - order[b.status] || a.displayName.localeCompare(b.displayName, 'th'),
    );
    const maxShownMembers = 12;
    const visibleMembers = sortedMembers.slice(0, maxShownMembers);
    const memberRows = Math.ceil(visibleMembers.length / 2);
    const extraMembers = Math.max(0, sortedMembers.length - visibleMembers.length);

    const hasDescription = Boolean(topic.description.trim());
    const headerHeight = hasDescription ? 132 : 98;
    const progressSectionHeight = 68;
    const statsGridHeight = 204;
    const membersSectionHeight = visibleMembers.length > 0 ? 52 + memberRows * 56 + (extraMembers > 0 ? 28 : 0) : 0;
    const footerHeight = 52;
    const HEIGHT = PAD + headerHeight + progressSectionHeight + statsGridHeight + membersSectionHeight + footerHeight;

    const { ctx, encode } = renderSurface(WIDTH, HEIGHT, compact);

    // 1. พื้นหลังการ์ด + แถบสีด้านซ้าย
    const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bgGrad.addColorStop(0, '#18191c');
    bgGrad.addColorStop(1, '#111214');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.roundRect(0, 0, WIDTH, HEIGHT, 20);
    ctx.fill();

    // ขอบการ์ดบางๆ
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, WIDTH - 2, HEIGHT - 2, 20);
    ctx.stroke();

    // แถบสีสถานะด้านซ้าย
    const accentColor = done ? '#10b981' : topic.closed ? '#64748b' : '#f59e0b';
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.roundRect(0, 0, 8, HEIGHT, [20, 0, 0, 20]);
    ctx.fill();

    // 2. ส่วนหัวรายงาน (ไอคอน Wallet + ชื่อหัวข้อ + ป้ายสถานะ)
    let y = PAD;
    ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
    ctx.beginPath();
    ctx.roundRect(PAD, y, 48, 48, 12);
    ctx.fill();
    drawVectorIcon(ctx, 'wallet', PAD + 24, y + 24, 24, accentColor);

    // ป้ายสถานะมุมขวาบน
    const statusLabel = topic.closed ? 'ปิดการเก็บแล้ว' : done ? 'เก็บครบตามเป้า' : 'กำลังเปิดรับเงิน';
    const statusBg = topic.closed ? 'rgba(100, 116, 139, 0.2)' : done ? 'rgba(16, 185, 129, 0.16)' : 'rgba(245, 158, 11, 0.16)';
    const statusText = topic.closed ? '#cbd5e1' : done ? '#34d399' : '#fbbf24';
    ctx.font = font(700, 16);
    const pillW = ctx.measureText(statusLabel).width + 32;
    const pillX = WIDTH - PAD - pillW;
    ctx.fillStyle = statusBg;
    ctx.beginPath();
    ctx.roundRect(pillX, y + 6, pillW, 34, 17);
    ctx.fill();
    ctx.fillStyle = statusText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(statusLabel, pillX + pillW / 2, y + 23);

    // ชื่อหัวข้อ
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f8fafc';
    ctx.font = font(700, 28);
    const maxTitleW = pillX - (PAD + 64) - 16;
    ctx.fillText(truncateText(ctx, `รายงานการเก็บเงิน: ${topic.name}`, maxTitleW), PAD + 64, y + 34);

    if (hasDescription) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = font(400, 17);
        const firstLine = topic.description.trim().split(/\r?\n/)[0] ?? '';
        ctx.fillText(truncateText(ctx, firstLine, WIDTH - PAD * 2 - 64), PAD + 64, y + 66);
    }

    y += headerHeight - 24;

    // 3. หลอดความคืบหน้า (Progress Bar)
    const barW = WIDTH - PAD * 2;
    const barH = 28;
    ctx.fillStyle = '#23252a';
    ctx.beginPath();
    ctx.roundRect(PAD, y, barW, barH, 14);
    ctx.fill();

    if (ratio > 0) {
        const fillW = Math.max(24, Math.round(barW * ratio));
        const barGrad = ctx.createLinearGradient(PAD, y, PAD + fillW, y);
        if (done || pct >= 100) {
            barGrad.addColorStop(0, '#10b981');
            barGrad.addColorStop(1, '#34d399');
        } else {
            barGrad.addColorStop(0, '#f59e0b');
            barGrad.addColorStop(1, '#fbbf24');
        }
        ctx.fillStyle = barGrad;
        ctx.beginPath();
        ctx.roundRect(PAD, y, fillW, barH, 14);
        ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 15);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${pct}%`, PAD + barW - 14, y + barH / 2);

    y += progressSectionHeight;

    // 4. ตารางสรุป 6 ช่อง (3 คอลัมน์ × 2 แถว)
    const cols = 3;
    const gap = 16;
    const tileW = Math.floor((WIDTH - PAD * 2 - gap * (cols - 1)) / cols);
    const tileH = 86;

    const rateLabel = topic.dailyRate && topic.dailyRate > 0 ? 'ยอดรายวัน' : 'ยอดต่อคน';
    const rateValue =
        topic.dailyRate && topic.dailyRate > 0 ? `${formatBaht(topic.dailyRate)} / วัน` : formatBaht(topic.amountPerMember);
    const dueValue = topic.dueDate
        ? new Date(topic.dueDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'ไม่กำหนด';

    const tiles: { icon: IconName; label: string; value: string; color: string; valueColor: string }[] = [
        { icon: 'target', label: 'ยอดเป้าหมาย', value: formatBaht(topic.target), color: '#f43f5e', valueColor: '#f8fafc' },
        { icon: 'banknote', label: 'เก็บได้แล้ว', value: formatBaht(topic.collected), color: '#10b981', valueColor: '#34d399' },
        {
            icon: 'clock',
            label: 'คงค้าง',
            value: formatBaht(remaining),
            color: '#f59e0b',
            valueColor: remaining > 0 ? '#fbbf24' : '#94a3b8',
        },
        {
            icon: 'users',
            label: 'จ่ายครบแล้ว',
            value: `${topic.paidCount} / ${topic.memberCount} คน`,
            color: '#38bdf8',
            valueColor: '#f8fafc',
        },
        { icon: 'receipt', label: rateLabel, value: rateValue, color: '#a78bfa', valueColor: '#f8fafc' },
        { icon: 'calendar', label: 'ครบกำหนด', value: dueValue, color: '#fb923c', valueColor: '#f8fafc' },
    ];

    tiles.forEach((tile, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const tx = PAD + col * (tileW + gap);
        const ty = y + row * (tileH + gap);

        ctx.fillStyle = '#202227';
        ctx.beginPath();
        ctx.roundRect(tx, ty, tileW, tileH, 14);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tx, ty, tileW, tileH, 14);
        ctx.stroke();

        // วงกลมไอคอน
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        ctx.roundRect(tx + 14, ty + 14, 30, 30, 8);
        ctx.fill();
        drawVectorIcon(ctx, tile.icon, tx + 29, ty + 29, 17, tile.color);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#94a3b8';
        ctx.font = font(400, 15);
        ctx.fillText(tile.label, tx + 54, ty + 35);

        ctx.fillStyle = tile.valueColor;
        ctx.font = font(700, 22);
        ctx.fillText(truncateText(ctx, tile.value, tileW - 28), tx + 16, ty + 70);
    });

    y += statsGridHeight;

    // 5. รายชื่อสมาชิกและสถานะรายคน (ถ้ามีสมาชิก)
    if (visibleMembers.length > 0) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#cbd5e1';
        ctx.font = font(700, 17);
        ctx.fillText(`สถานะสมาชิกรายคน (${topic.paidCount}/${topic.memberCount} คนจ่ายครบ)`, PAD, y + 26);

        const listTop = y + 40;
        const mCols = 2;
        const mGap = 12;
        const mW = Math.floor((WIDTH - PAD * 2 - mGap) / mCols);
        const mH = 46;

        visibleMembers.forEach((m, idx) => {
            const col = idx % mCols;
            const row = Math.floor(idx / mCols);
            const mx = PAD + col * (mW + mGap);
            const my = listTop + row * (mH + 10);

            ctx.fillStyle = '#1e2025';
            ctx.beginPath();
            ctx.roundRect(mx, my, mW, mH, 10);
            ctx.fill();

            const statusColor = m.status === 'paid' ? '#10b981' : m.status === 'partial' ? '#f59e0b' : '#ef4444';
            const statusIcon: IconName = m.status === 'paid' ? 'check' : m.status === 'partial' ? 'partial' : 'unpaid';
            drawVectorIcon(ctx, statusIcon, mx + 22, my + mH / 2, 18, statusColor);

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#f1f5f9';
            ctx.font = font(700, 15);
            ctx.fillText(truncateText(ctx, m.displayName, mW * 0.45), mx + 40, my + mH / 2);

            ctx.textAlign = 'right';
            ctx.font = font(400, 14);
            ctx.fillStyle = m.status === 'paid' ? '#34d399' : '#fbbf24';
            const amountText =
                m.status === 'paid'
                    ? `ครบ ${formatBaht(m.paid)}`
                    : `${formatBaht(m.paid)} / ค้าง ${formatBaht(m.remaining)}`;
            ctx.fillText(truncateText(ctx, amountText, mW * 0.46), mx + mW - 14, my + mH / 2);
        });

        if (extraMembers > 0) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#64748b';
            ctx.font = font(400, 14);
            ctx.fillText(`…และสมาชิกอีก ${extraMembers} คน`, WIDTH / 2, listTop + memberRows * 56 + 14);
        }
        y += membersSectionHeight;
    }

    // 6. ส่วนท้ายการ์ด (Footer)
    const nowText = new Date().toLocaleString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#64748b';
    ctx.font = font(400, 14);
    ctx.fillText(`NotStack • ระบบเก็บเงินตามเป้า • อัปเดตเมื่อ ${nowText}`, PAD, HEIGHT - 18);

    return encode();
}
