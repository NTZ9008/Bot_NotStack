import type { SKRSContext2D } from '@napi-rs/canvas';
import { formatBaht, type FundReportCardData, type FundReportMemberRow } from '@notstack/shared';
import { fontString } from '../../common/canvas/fonts';
import { renderSurface } from '../../common/utils/render-surface';
import { drawPill, drawProgressTrack, fitText, plainAmount, rgba, truncateText, type ReportThemeRenderer } from './report-theme.types';

// ==========================================
// 💼 MINIMAL FINANCE THEME — รายงานการเงินระดับพรีเมียม / Modern Editorial
// ==========================================
const WIDTH = 1000;
const PAD = 42;
const RADIUS = 18;

const P = {
    bg: '#F8F6F0',
    surface: '#FFFFFF',
    primary: '#059669',
    secondary: '#164E3B',
    accent: '#D4A853',
    text: '#1F2937',
    muted: '#6B7280',
    line: '#E6E1D6',
    oweText: '#B45309',
    oweBg: '#FEF3C7',
    unpaidText: '#B91C1C',
    unpaidBg: '#FEE2E2',
    paidBg: '#ECFDF5',
    track: '#EDE9DF',
};

const headingFont = (weight: number, size: number) => fontString('noto-sans-thai', weight, size);
const bodyFont = (weight: number, size: number) => fontString('sarabun', weight, size);

function drawEditorialHeader(ctx: SKRSContext2D, data: FundReportCardData, headerH: number): void {
    // Deep Forest background band with architectural wave & gold rule
    ctx.save();
    ctx.fillStyle = P.secondary;
    ctx.fillRect(0, 0, WIDTH, headerH);

    // Subtle organic wave highlight on top-right
    ctx.fillStyle = rgba(P.primary, 0.28);
    ctx.beginPath();
    ctx.moveTo(WIDTH * 0.42, 0);
    ctx.bezierCurveTo(WIDTH * 0.58, headerH * 0.62, WIDTH * 0.82, headerH * 0.25, WIDTH, headerH * 0.72);
    ctx.lineTo(WIDTH, 0);
    ctx.closePath();
    ctx.fill();

    // Soft gold architectural accent line at bottom of header
    ctx.fillStyle = P.accent;
    ctx.fillRect(0, headerH - 4, WIDTH, 4);
    ctx.restore();

    // Status pill right
    const badgeColor = data.closed ? '#E5E7EB' : P.accent;
    const badgeW = drawPill(ctx, 0, PAD - 4, 32, 16, data.statusLabel, {
        font: headingFont(600, 13),
        bg: rgba(badgeColor, 0.16),
        border: badgeColor,
        borderWidth: 1.2,
        textColor: data.closed ? '#F3F4F6' : '#FDE68A',
        padX: 14,
        alignRight: WIDTH - PAD,
    });

    const maxTitleW = WIDTH - PAD * 2 - badgeW - 24;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = P.accent;
    ctx.font = bodyFont(700, 13);
    ctx.fillText('FINANCIAL COLLECTION STATEMENT  •  รายงานสรุปการเก็บเงิน', PAD, PAD + 14);

    const fittedTitle = fitText(ctx, (s) => headingFont(700, s), data.title, 32, 22, maxTitleW);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = headingFont(700, fittedTitle.size);
    ctx.fillText(fittedTitle.text, PAD, PAD + 56);

    if (data.description) {
        ctx.fillStyle = rgba(P.bg, 0.84);
        ctx.font = bodyFont(400, 16);
        ctx.fillText(truncateText(ctx, data.description, WIDTH - PAD * 2), PAD, PAD + 88);
    }
}

function drawCheckBadge(ctx: SKRSContext2D, cx: number, cy: number, status: FundReportMemberRow['status']): void {
    ctx.save();
    const color = status === 'paid' ? P.primary : status === 'partial' ? P.oweText : P.unpaidText;
    const fill = status === 'paid' ? P.paidBg : status === 'partial' ? P.oweBg : P.unpaidBg;
    ctx.fillStyle = fill;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (status === 'paid') {
        ctx.moveTo(cx - 4, cy);
        ctx.lineTo(cx - 1, cy + 3.5);
        ctx.lineTo(cx + 4.5, cy - 3);
    } else if (status === 'partial') {
        ctx.moveTo(cx - 4, cy);
        ctx.lineTo(cx + 4, cy);
    } else {
        ctx.moveTo(cx - 3, cy - 3);
        ctx.lineTo(cx + 3, cy + 3);
        ctx.moveTo(cx + 3, cy - 3);
        ctx.lineTo(cx - 3, cy + 3);
    }
    ctx.stroke();
    ctx.restore();
}

export const ReportThemeMinimalFinance: ReportThemeRenderer = {
    id: 'minimal-finance',
    async render(data: FundReportCardData, compact = false): Promise<Buffer> {
        const headerH = data.description ? 156 : 126;
        const cardGap = 24;
        const heroH = 264;
        const twoCol = data.members.length > 16;
        const ROW_H = twoCol ? 74 : 54;
        const SECTION_H = 40;

        const sections = [
            { key: 'unpaid' as const, label: `ยังไม่ชำระ · Unpaid (${data.unpaidCount})`, members: data.groups.unpaid, accent: P.unpaidText },
            { key: 'partial' as const, label: `ชำระบางส่วน · Partial (${data.partialCount})`, members: data.groups.partial, accent: P.oweText },
            { key: 'paid' as const, label: `ชำระครบแล้ว · Paid (${data.paidCount})`, members: data.groups.paid, accent: P.primary },
        ].filter((s) => s.members.length > 0);

        const rowCountOf = (list: FundReportMemberRow[]) => (twoCol ? Math.ceil(list.length / 2) : list.length);
        const totalRows = sections.reduce((sum, s) => sum + rowCountOf(s.members), 0);
        const ledgerHeaderH = 58;
        const membersCardH = data.members.length > 0 ? ledgerHeaderH + sections.length * SECTION_H + totalRows * ROW_H + 18 : 116;
        const footerH = 58;
        const HEIGHT = headerH + cardGap + heroH + cardGap + membersCardH + 22 + footerH;

        const { ctx, encode } = renderSurface(WIDTH, HEIGHT, compact);
        ctx.textBaseline = 'alphabetic';

        // 1. Warm Ivory rounded card canvas
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, WIDTH, HEIGHT, RADIUS);
        ctx.clip();
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        drawEditorialHeader(ctx, data, headerH);
        ctx.restore();

        ctx.strokeStyle = P.line;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(1, 1, WIDTH - 2, HEIGHT - 2, RADIUS);
        ctx.stroke();

        // 2. Hero Executive Statement Card (White Surface)
        const cardX = PAD;
        const cardW = WIDTH - PAD * 2;
        const heroY = headerH + cardGap;

        ctx.save();
        ctx.shadowColor = rgba(P.secondary, 0.06);
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = P.surface;
        ctx.beginPath();
        ctx.roundRect(cardX, heroY, cardW, heroH, 14);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = P.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(cardX, heroY, cardW, heroH, 14);
        ctx.stroke();

        const innerX = cardX + 28;
        const innerW = cardW - 56;

        ctx.textAlign = 'left';
        ctx.fillStyle = P.muted;
        ctx.font = bodyFont(600, 13);
        ctx.fillText('ยอดเงินที่เก็บได้สุทธิ  •  COLLECTED AMOUNT', innerX, heroY + 34);

        const collectedStr = plainAmount(data.collected);
        ctx.fillStyle = P.primary;
        ctx.font = headingFont(700, 50);
        ctx.fillText(collectedStr, innerX, heroY + 90);
        const amtW = ctx.measureText(collectedStr).width;

        ctx.fillStyle = P.secondary;
        ctx.font = headingFont(600, 20);
        ctx.fillText('บาท', innerX + amtW + 10, heroY + 86);
        const bahtW = ctx.measureText('บาท').width;

        ctx.fillStyle = P.muted;
        ctx.font = bodyFont(500, 17);
        ctx.fillText(
            truncateText(ctx, `/ เป้าหมาย ${formatBaht(data.target)}`, Math.max(0, innerW - amtW - bahtW - 140)),
            innerX + amtW + bahtW + 22,
            heroY + 86,
        );

        // Percentage pill top-right
        ctx.textAlign = 'right';
        ctx.fillStyle = P.secondary;
        ctx.font = headingFont(700, 32);
        ctx.fillText(`${data.progressPct}%`, innerX + innerW, heroY + 84);
        ctx.fillStyle = P.muted;
        ctx.font = bodyFont(500, 12);
        ctx.fillText('ความคืบหน้าสุทธิ', innerX + innerW, heroY + 46);

        // Emerald gradient progress bar with subtle gold milestone ticks
        const barY = heroY + 112;
        const grad = ctx.createLinearGradient(innerX, barY, innerX + innerW, barY);
        grad.addColorStop(0, P.secondary);
        grad.addColorStop(0.55, P.primary);
        grad.addColorStop(1, '#10B981');
        drawProgressTrack(ctx, innerX, barY, innerW, 12, data.progressRatio, P.track, grad, 6);

        ctx.save();
        ctx.strokeStyle = rgba(P.accent, 0.55);
        ctx.lineWidth = 1.5;
        for (const tick of [0.25, 0.5, 0.75]) {
            const tx = innerX + innerW * tick;
            ctx.beginPath();
            ctx.moveTo(tx, barY);
            ctx.lineTo(tx, barY + 12);
            ctx.stroke();
        }
        ctx.restore();

        // Thin separator
        const sepY = heroY + 144;
        ctx.strokeStyle = P.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(innerX, sepY);
        ctx.lineTo(innerX + innerW, sepY);
        ctx.stroke();

        // 4-Column Financial KPI Strip
        const kpis: { label: string; value: string; sub: string; valueColor: string; barColor: string }[] = [
            {
                label: 'ยอดคงค้างรวม',
                value: formatBaht(data.remaining),
                sub: data.outstandingMemberCount > 0 ? `ค้างชำระ ${data.outstandingMemberCount} คน` : 'ครบถ้วนไม่มีค้างชำระ',
                valueColor: data.remaining > 0 ? P.oweText : P.primary,
                barColor: data.remaining > 0 ? P.accent : P.primary,
            },
            {
                label: data.dailyRate ? 'อัตราเก็บรายวัน' : 'ยอดเก็บต่อคน',
                value: data.rateLabel,
                sub: data.dailyRate ? `เฉลี่ย ${formatBaht(data.amountPerMember)}/งวด` : 'ยอดมาตรฐานต่อสมาชิก',
                valueColor: P.text,
                barColor: P.secondary,
            },
            {
                label: 'สมาชิกที่ชำระครบ',
                value: `${data.paidCount} / ${data.memberCount} คน`,
                sub: `ยังไม่จ่าย ${data.unpaidCount} · บางส่วน ${data.partialCount}`,
                valueColor: P.secondary,
                barColor: P.primary,
            },
            {
                label: 'วันครบกำหนด',
                value: data.due.dateLabel,
                sub: data.due.remainingDaysLabel || (data.closed ? 'ปิดรับรายการแล้ว' : 'ไม่จำกัดระยะเวลา'),
                valueColor: data.due.tone === 'unpaid' ? P.unpaidText : data.due.tone === 'partial' ? P.oweText : P.text,
                barColor: P.line,
            },
        ];

        const kpiY = sepY + 16;
        const kpiW = innerW / 4;
        kpis.forEach((kpi, idx) => {
            const kx = innerX + idx * kpiW;
            const inset = idx === 0 ? 0 : 18;
            if (idx > 0) {
                ctx.strokeStyle = P.line;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(kx, kpiY + 4);
                ctx.lineTo(kx, kpiY + 88);
                ctx.stroke();
            }
            ctx.fillStyle = kpi.barColor;
            ctx.fillRect(kx + inset, kpiY, 28, 3);

            ctx.textAlign = 'left';
            ctx.fillStyle = P.muted;
            ctx.font = bodyFont(600, 12);
            ctx.fillText(kpi.label, kx + inset, kpiY + 22);

            ctx.fillStyle = kpi.valueColor;
            ctx.font = headingFont(700, 20);
            ctx.fillText(truncateText(ctx, kpi.value, kpiW - inset - 12), kx + inset, kpiY + 52);

            ctx.fillStyle = P.muted;
            ctx.font = bodyFont(400, 13);
            ctx.fillText(truncateText(ctx, kpi.sub, kpiW - inset - 12), kx + inset, kpiY + 76);
        });

        // 3. Member Ledger Card
        const ledgerY = heroY + heroH + cardGap;
        ctx.save();
        ctx.shadowColor = rgba(P.secondary, 0.05);
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = P.surface;
        ctx.beginPath();
        ctx.roundRect(cardX, ledgerY, cardW, membersCardH, 14);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = P.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(cardX, ledgerY, cardW, membersCardH, 14);
        ctx.stroke();

        // Ledger top bar
        ctx.textAlign = 'left';
        ctx.fillStyle = P.secondary;
        ctx.font = headingFont(700, 17);
        ctx.fillText('รายการสถานะสมาชิก  •  Member Ledger', innerX, ledgerY + 35);

        let pillRight = innerX + innerW;
        const summaryPills = [
            { label: `จ่ายครบ ${data.paidCount}`, bg: P.paidBg, fg: P.primary, border: rgba(P.primary, 0.35) },
            { label: `บางส่วน ${data.partialCount}`, bg: P.oweBg, fg: P.oweText, border: rgba(P.accent, 0.55) },
            { label: `ยังไม่จ่าย ${data.unpaidCount}`, bg: P.unpaidBg, fg: P.unpaidText, border: rgba(P.unpaidText, 0.3) },
        ];
        for (const pill of summaryPills) {
            const pw = drawPill(ctx, 0, ledgerY + 17, 24, 12, pill.label, {
                font: bodyFont(600, 12),
                bg: pill.bg,
                border: pill.border,
                textColor: pill.fg,
                padX: 10,
                alignRight: pillRight,
            });
            pillRight -= pw + 8;
        }

        if (data.members.length === 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = P.muted;
            ctx.font = bodyFont(400, 15);
            ctx.fillText('ยังไม่มีรายชื่อสมาชิกในหัวข้อนี้', WIDTH / 2, ledgerY + 86);
        } else {
            let curY = ledgerY + ledgerHeaderH;
            const colGap = 22;
            const colW = (innerW - colGap) / 2;

            const drawSingleRow = (m: FundReportMemberRow, rx: number, rw: number, top: number) => {
                const cy = top + ROW_H / 2;
                drawCheckBadge(ctx, rx + 12, cy, m.status);

                const statusLabel = m.status === 'paid' ? 'จ่ายครบ' : m.status === 'partial' ? 'บางส่วน' : 'ยังไม่จ่าย';
                const statusBg = m.status === 'paid' ? P.paidBg : m.status === 'partial' ? P.oweBg : P.unpaidBg;
                const statusFg = m.status === 'paid' ? P.primary : m.status === 'partial' ? P.oweText : P.unpaidText;
                const pillW = 76;
                const remainW = 118;
                const amtWCol = 128;
                const barW = 152;
                const nameW = rw - 32 - pillW - remainW - amtWCol - barW - 44;

                ctx.textBaseline = 'middle';
                ctx.textAlign = 'left';
                ctx.fillStyle = P.text;
                ctx.font = bodyFont(600, 15);
                ctx.fillText(truncateText(ctx, m.displayName, nameW), rx + 30, cy + 1);

                const barX = rx + 30 + nameW + 12;
                const barFill = m.status === 'paid' ? P.primary : m.status === 'partial' ? P.accent : P.unpaidText;
                drawProgressTrack(ctx, barX, cy - 3, barW - 44, 6, m.progressRatio, P.track, barFill, 3);
                ctx.textAlign = 'right';
                ctx.fillStyle = P.muted;
                ctx.font = bodyFont(600, 12);
                ctx.fillText(`${m.progressPct}%`, barX + barW, cy + 1);

                const amtRight = barX + barW + 14 + amtWCol;
                ctx.fillStyle = P.text;
                ctx.font = bodyFont(500, 14);
                ctx.fillText(truncateText(ctx, `${plainAmount(m.paid)} / ${plainAmount(m.target)} บ.`, amtWCol), amtRight, cy + 1);

                const remainRight = amtRight + 12 + remainW;
                ctx.fillStyle = m.remaining > 0 ? P.oweText : P.primary;
                ctx.font = bodyFont(700, 14);
                ctx.fillText(
                    truncateText(ctx, m.remaining > 0 ? `ค้าง ${plainAmount(m.remaining)} บ.` : 'ครบ 0 บ.', remainW),
                    remainRight,
                    cy + 1,
                );

                drawPill(ctx, remainRight + 10, cy - 12, 24, 12, statusLabel, {
                    font: bodyFont(600, 12),
                    bg: statusBg,
                    textColor: statusFg,
                    padX: 10,
                    alignRight: rx + rw,
                });

                ctx.textBaseline = 'alphabetic';
                ctx.strokeStyle = P.line;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(rx, top + ROW_H);
                ctx.lineTo(rx + rw, top + ROW_H);
                ctx.stroke();
            };

            const drawCompactRow = (m: FundReportMemberRow, rx: number, rw: number, top: number) => {
                ctx.save();
                ctx.fillStyle = P.bg;
                ctx.strokeStyle = P.line;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(rx, top + 4, rw, ROW_H - 8, 10);
                ctx.fill();
                ctx.stroke();
                ctx.restore();

                drawCheckBadge(ctx, rx + 20, top + 24, m.status);

                const statusLabel = m.status === 'paid' ? 'จ่ายครบ' : m.status === 'partial' ? 'บางส่วน' : 'ยังไม่จ่าย';
                const statusBg = m.status === 'paid' ? P.paidBg : m.status === 'partial' ? P.oweBg : P.unpaidBg;
                const statusFg = m.status === 'paid' ? P.primary : m.status === 'partial' ? P.oweText : P.unpaidText;
                const pillW = drawPill(ctx, 0, top + 13, 22, 11, statusLabel, {
                    font: bodyFont(600, 11),
                    bg: statusBg,
                    textColor: statusFg,
                    padX: 8,
                    alignRight: rx + rw - 12,
                });

                ctx.textBaseline = 'alphabetic';
                ctx.textAlign = 'left';
                ctx.fillStyle = P.text;
                ctx.font = bodyFont(700, 14);
                ctx.fillText(truncateText(ctx, m.displayName, rw - pillW - 58), rx + 36, top + 29);

                // Bottom sub-line: progress bar + paid/target + remaining
                const barX = rx + 14;
                const barW = 92;
                const barFill = m.status === 'paid' ? P.primary : m.status === 'partial' ? P.accent : P.unpaidText;
                drawProgressTrack(ctx, barX, top + 49, barW, 5, m.progressRatio, P.line, barFill, 2.5);

                ctx.fillStyle = P.muted;
                ctx.font = bodyFont(500, 12);
                ctx.fillText(`${plainAmount(m.paid)}/${plainAmount(m.target)} บ. (${m.progressPct}%)`, barX + barW + 10, top + 55);

                ctx.textAlign = 'right';
                ctx.fillStyle = m.remaining > 0 ? P.oweText : P.primary;
                ctx.font = bodyFont(700, 12);
                ctx.fillText(m.remaining > 0 ? `ค้าง ${plainAmount(m.remaining)} บ.` : 'ครบ', rx + rw - 12, top + 55);
            };

            for (const section of sections) {
                ctx.textAlign = 'left';
                ctx.fillStyle = section.accent;
                ctx.font = bodyFont(700, 13);
                ctx.fillText(section.label, innerX, curY + 24);
                ctx.strokeStyle = P.line;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(innerX, curY + 34);
                ctx.lineTo(innerX + innerW, curY + 34);
                ctx.stroke();
                curY += SECTION_H;

                if (twoCol) {
                    for (let i = 0; i < section.members.length; i += 2) {
                        const left = section.members[i];
                        const right = section.members[i + 1];
                        if (left) drawCompactRow(left, innerX, colW, curY);
                        if (right) drawCompactRow(right, innerX + colW + colGap, colW, curY);
                        curY += ROW_H;
                    }
                } else {
                    for (const m of section.members) {
                        drawSingleRow(m, innerX, innerW, curY);
                        curY += ROW_H;
                    }
                }
            }
        }

        // 4. Footer
        ctx.strokeStyle = P.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, HEIGHT - footerH);
        ctx.lineTo(WIDTH - PAD, HEIGHT - footerH);
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.fillStyle = P.muted;
        ctx.font = bodyFont(600, 13);
        ctx.fillText('NotStack Minimal Finance  •  ระบบเก็บเงินตามเป้า', PAD, HEIGHT - 22);
        ctx.textAlign = 'right';
        ctx.fillText(`อัปเดต ${data.generatedAtLabel}`, WIDTH - PAD, HEIGHT - 22);

        return encode();
    },
};
