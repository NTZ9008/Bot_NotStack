import { formatBaht, type FundReportCardData, type FundReportMemberRow } from '@notstack/shared';
import { fontString } from '../../common/canvas/fonts';
import { renderSurface } from '../../common/utils/render-surface';
import { plainAmount, truncateText, type ReportThemeRenderer } from './report-theme.types';

// ==========================================
// 🌑 DEFAULT THEME — การ์ด navy เดิมของ NotStack (รักษาดีไซน์เดิม 100% + รองรับรายชื่อยาวครบทุกคน)
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

export const ReportThemeDefault: ReportThemeRenderer = {
    id: 'default',
    async render(data: FundReportCardData, compact = false): Promise<Buffer> {
        const headerH = data.description ? 120 : 92;
        const heroH = 260;
        const ROW_H = 48;
        const SECTION_H = 42;
        const twoCol = data.members.length > 18;

        const sections = [
            { label: `ยังไม่จ่าย (${data.unpaidCount})`, members: data.groups.unpaid },
            { label: `จ่ายบางส่วน (${data.partialCount})`, members: data.groups.partial },
            ...(data.paidCount > 0 ? [{ label: `จ่ายครบ (${data.paidCount})`, members: data.groups.paid }] : []),
        ];

        const sectionRows = (list: FundReportMemberRow[]) => (twoCol ? Math.ceil(list.length / 2) : list.length);
        const totalMemberRows = sections.reduce((sum, s) => sum + sectionRows(s.members), 0);
        const membersH = data.members.length > 0 ? 48 + sections.length * SECTION_H + totalMemberRows * ROW_H : 76;
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
        const statusColor = data.closed ? C.muted : C.paid;
        ctx.font = font(500, 14);
        const stampW = ctx.measureText(data.statusLabel).width + 24;
        const stampX = WIDTH - PAD - stampW;
        ctx.strokeStyle = statusColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(stampX, y + 5, stampW, 30, 6);
        ctx.stroke();
        ctx.fillStyle = statusColor;
        ctx.textAlign = 'left';
        ctx.fillText(data.statusLabel, stampX + 12, y + 25);

        const titleX = PAD;
        ctx.fillStyle = C.muted;
        ctx.font = font(500, 13);
        ctx.fillText('รายงานการเก็บเงิน', titleX, y + 18);
        ctx.fillStyle = C.ink;
        ctx.font = font(600, 28);
        ctx.fillText(truncateText(ctx, data.title, stampX - titleX - 20), titleX, y + 54);
        if (data.description) {
            ctx.fillStyle = C.muted;
            ctx.font = font(400, 16);
            ctx.fillText(truncateText(ctx, data.description, WIDTH - titleX - PAD), titleX, y + 90);
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
        const collectedText = plainAmount(data.collected);
        ctx.fillText(collectedText, infoX, y + 82);
        const ux = infoX + ctx.measureText(collectedText).width + 12;
        ctx.fillStyle = C.muted;
        ctx.font = font(500, 18);
        ctx.fillText(truncateText(ctx, `/ ${formatBaht(data.target)}`, Math.max(0, WIDTH - PAD - ux - 70)), ux, y + 78);

        ctx.textAlign = 'right';
        ctx.fillStyle = C.ink;
        ctx.font = font(500, 18);
        ctx.fillText(`${data.progressPct}%`, WIDTH - PAD, y + 76);

        const progressY = y + 98;
        ctx.fillStyle = C.line;
        ctx.beginPath();
        ctx.roundRect(infoX, progressY, infoW, 6, 3);
        ctx.fill();
        if (data.progressRatio > 0) {
            ctx.fillStyle = C.paid;
            ctx.beginPath();
            ctx.roundRect(infoX, progressY, Math.max(6, infoW * data.progressRatio), 6, 3);
            ctx.fill();
        }

        // สถิติสามคอลัมน์แบบไม่มีพื้นการ์ด
        const memberSub =
            data.outstandingMemberCount > 0 ? `ค้างชำระ ${data.outstandingMemberCount} คน · ยังไม่จ่าย ${data.unpaidCount}` : 'ทุกคนจ่ายครบแล้ว';
        const chips: { label: string; value: string; sub: string; color: string }[] = [
            { label: 'คงค้าง', value: formatBaht(data.remaining), sub: data.rateLabel, color: data.remaining > 0 ? C.owe : C.muted },
            { label: 'จ่ายครบ', value: `${data.paidCount}/${data.memberCount} คน`, sub: memberSub, color: C.member },
            { label: 'ครบกำหนด', value: data.due.dateLabel, sub: data.due.remainingDaysLabel, color: C.ink },
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

        // 4. รายชื่อสมาชิก (1 คอลัมน์ปกติ หรือ 2 คอลัมน์เมื่อรายชื่อยาวเพื่อไม่ให้รูปสูงเกิน Discord preview)
        if (data.members.length > 0) {
            ctx.textAlign = 'left';
            ctx.fillStyle = C.ink;
            ctx.font = font(600, 18);
            ctx.fillText('สถานะสมาชิก', PAD, y + 28);

            const drawMemberCell = (m: FundReportMemberRow, cellX: number, cellW: number, rowTop: number) => {
                const baseline = rowTop + 30;
                const barW = twoCol ? 72 : 160;
                const paidW = twoCol ? 76 : 90;
                const oweW = twoCol ? 76 : 90;
                const gap = twoCol ? 10 : 16;
                const nameW = cellW - barW - paidW - oweW - gap * 3;
                const barX = cellX + nameW + gap;
                const paidRight = barX + barW + gap + paidW;
                const oweRight = paidRight + gap + oweW;

                ctx.textAlign = 'left';
                ctx.fillStyle = C.ink;
                ctx.font = font(500, twoCol ? 14 : 16);
                ctx.fillText(truncateText(ctx, m.displayName, nameW - 6), cellX, baseline);

                ctx.fillStyle = C.line;
                ctx.beginPath();
                ctx.roundRect(barX, rowTop + 23, barW, 3, 2);
                ctx.fill();
                if (m.progressRatio > 0) {
                    ctx.fillStyle = C.paid;
                    ctx.beginPath();
                    ctx.roundRect(barX, rowTop + 23, Math.max(3, barW * m.progressRatio), 3, 2);
                    ctx.fill();
                }

                ctx.textAlign = 'right';
                ctx.fillStyle = C.muted;
                ctx.font = font(400, twoCol ? 12 : 14);
                ctx.fillText(truncateText(ctx, `${plainAmount(m.paid)}/${plainAmount(m.target)}`, paidW), paidRight, baseline);

                ctx.fillStyle = m.status === 'paid' ? C.paid : m.remaining === m.target ? C.danger : C.owe;
                ctx.font = font(600, twoCol ? 14 : 16);
                ctx.fillText(truncateText(ctx, m.status === 'paid' ? 'ครบ' : `ค้าง ${plainAmount(m.remaining)}`, oweW), oweRight, baseline);

                ctx.strokeStyle = C.line;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(cellX, rowTop + ROW_H);
                ctx.lineTo(cellX + cellW, rowTop + ROW_H);
                ctx.stroke();
            };

            let rowY = y + 48;
            const tableW = WIDTH - PAD * 2;
            const colGap = 24;
            const colW = (tableW - colGap) / 2;

            for (const section of sections) {
                ctx.textAlign = 'left';
                ctx.fillStyle = C.muted;
                ctx.font = font(600, 13);
                ctx.fillText(section.label, PAD, rowY + 20);
                ctx.strokeStyle = C.line;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(PAD, rowY + 29);
                ctx.lineTo(WIDTH - PAD, rowY + 29);
                ctx.stroke();
                rowY += SECTION_H;

                if (twoCol) {
                    for (let i = 0; i < section.members.length; i += 2) {
                        const left = section.members[i];
                        const right = section.members[i + 1];
                        if (left) drawMemberCell(left, PAD, colW, rowY);
                        if (right) drawMemberCell(right, PAD + colW + colGap, colW, rowY);
                        rowY += ROW_H;
                    }
                } else {
                    for (const m of section.members) {
                        drawMemberCell(m, PAD, tableW, rowY);
                        rowY += ROW_H;
                    }
                }
            }
            y += membersH;
        } else {
            ctx.textAlign = 'center';
            ctx.fillStyle = C.muted;
            ctx.font = font(400, 15);
            ctx.fillText('ยังไม่มีสมาชิกในหัวข้อนี้', WIDTH / 2, y + 44);
            y += membersH;
        }

        // 5. ส่วนท้าย
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
        ctx.fillText(`อัปเดต ${data.generatedAtLabel}`, WIDTH - PAD, HEIGHT - 22);

        return encode();
    },
};
