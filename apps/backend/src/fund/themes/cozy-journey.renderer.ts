import type { SKRSContext2D } from '@napi-rs/canvas';
import { formatBaht, type FundReportCardData, type FundReportMemberRow } from '@notstack/shared';
import { fontString } from '../../common/canvas/fonts';
import { renderSurface } from '../../common/utils/render-surface';
import { getCozyJourneyMascotSvg } from './mascots.svg';
import { drawPill, drawProgressTrack, fitText, loadSvgSprite, plainAmount, rgba, truncateText, type ReportThemeRenderer } from './report-theme.types';

// ==========================================
// 🧳 COZY JOURNEY THEME — Travel Journal / Scrapbook / Cute Traveler Chibi
// ==========================================
const WIDTH = 1020;
const PAD = 36;
const RADIUS = 24;

const J = {
    bg: '#FFF8EA',
    surface: '#FFFCF5',
    primary: '#8BAF91',
    primaryDeep: '#4B7253',
    secondary: '#A8D8EA',
    secondaryDeep: '#3E7B91',
    accent: '#F4B183',
    accentDeep: '#C26A38',
    text: '#55483E',
    muted: '#8A796D',
    line: '#E8DAC6',
    track: '#EFE6D5',
    unpaid: '#D96B52',
};

const titleFont = (weight: number, size: number) => fontString('kanit', weight, size);
const noteFont = (weight: number, size: number) => fontString('sarabun', weight, size);

function drawCloud(ctx: SKRSContext2D, cx: number, cy: number, scale: number, fill: string): void {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx - 18 * scale, cy + 4 * scale, 14 * scale, 0, Math.PI * 2);
    ctx.arc(cx, cy - 4 * scale, 18 * scale, 0, Math.PI * 2);
    ctx.arc(cx + 20 * scale, cy + 4 * scale, 13 * scale, 0, Math.PI * 2);
    ctx.roundRect(cx - 32 * scale, cy + 2 * scale, 64 * scale, 16 * scale, 8 * scale);
    ctx.fill();
    ctx.restore();
}

function drawTinyStar(ctx: SKRSContext2D, cx: number, cy: number, r: number, color: string): void {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + r * 0.25, cy - r * 0.25, cx + r, cy);
    ctx.quadraticCurveTo(cx + r * 0.25, cy + r * 0.25, cx, cy + r);
    ctx.quadraticCurveTo(cx - r * 0.25, cy + r * 0.25, cx - r, cy);
    ctx.quadraticCurveTo(cx - r * 0.25, cy - r * 0.25, cx, cy - r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawScrapbookPaper(ctx: SKRSContext2D, height: number): void {
    ctx.save();
    ctx.fillStyle = J.bg;
    ctx.fillRect(0, 0, WIDTH, height);

    // Subtle journal dot grid
    ctx.fillStyle = rgba(J.text, 0.08);
    for (let gx = 28; gx < WIDTH; gx += 28) {
        for (let gy = 28; gy < height; gy += 28) {
            ctx.beginPath();
            ctx.arc(gx, gy, 1.3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Soft pastel clouds & stars in margins
    drawCloud(ctx, 110, 46, 0.9, rgba(J.secondary, 0.35));
    drawCloud(ctx, WIDTH - 120, 56, 0.8, rgba(J.accent, 0.24));
    drawTinyStar(ctx, 56, 62, 7, J.accent);
    drawTinyStar(ctx, WIDTH - 56, 84, 8, J.primary);
    drawTinyStar(ctx, 64, height - 42, 7, J.secondaryDeep);

    // Dashed scrapbook inner border
    ctx.strokeStyle = rgba(J.line, 0.95);
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.roundRect(14, 14, WIDTH - 28, height - 28, RADIUS - 8);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

function drawWashiTape(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, angleRad: number, color: string): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angleRad);
    ctx.fillStyle = rgba(color, 0.65);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = rgba('#FFFFFF', 0.5);
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();
}

function drawTravelStamp(ctx: SKRSContext2D, cx: number, cy: number, label: string, color: string): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.08);

    ctx.fillStyle = rgba(color, 0.1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-64, -22, 128, 44, 10);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = rgba(color, 0.55);
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-59, -17, 118, 34, 7);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = titleFont(600, 14);
    ctx.fillText(label, 0, 1);
    ctx.restore();
}

function drawJourneyRouteBar(ctx: SKRSContext2D, x: number, y: number, w: number, ratio: number, pct: number): void {
    const trackH = 16;
    ctx.save();
    // Base road track
    ctx.fillStyle = J.track;
    ctx.strokeStyle = J.line;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, trackH, trackH / 2);
    ctx.fill();
    ctx.stroke();

    // Sage travel progress fill
    const clamped = Math.max(0, Math.min(1, ratio));
    if (clamped > 0) {
        const fillGrad = ctx.createLinearGradient(x, y, x + w, y);
        fillGrad.addColorStop(0, J.primary);
        fillGrad.addColorStop(1, '#689F74');
        ctx.fillStyle = fillGrad;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, Math.max(trackH - 4, (w - 4) * clamped), trackH - 4, (trackH - 4) / 2);
        ctx.fill();
    }

    // Road center dashes
    ctx.strokeStyle = rgba('#FFFFFF', 0.72);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(x + 12, y + trackH / 2);
    ctx.lineTo(x + w - 12, y + trackH / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Milestone checkpoints along route (0%, 25%, 50%, 75%, 100%)
    const stops = [0, 0.25, 0.5, 0.75, 1];
    for (const s of stops) {
        const sx = x + w * s;
        const reached = clamped >= s - 0.001;
        ctx.fillStyle = reached ? J.primaryDeep : J.surface;
        ctx.strokeStyle = reached ? '#FFFFFF' : J.muted;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, y + trackH / 2, s === 1 ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    // Current traveler pin marker above route (kept left of destination flagpole when completed)
    const pinX = x + Math.max(12, Math.min(w - 28, w * clamped));
    const pinY = y - 14;
    ctx.fillStyle = J.accentDeep;
    ctx.beginPath();
    ctx.arc(pinX, pinY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(pinX, pinY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Destination pennant at 100%
    const flagX = x + w;
    ctx.strokeStyle = J.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(flagX, y + 2);
    ctx.lineTo(flagX, y - 24);
    ctx.stroke();
    ctx.fillStyle = pct >= 100 ? J.primary : J.accent;
    ctx.beginPath();
    ctx.moveTo(flagX, y - 24);
    ctx.lineTo(flagX - 18, y - 17);
    ctx.lineTo(flagX, y - 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawCheckpointIcon(ctx: SKRSContext2D, cx: number, cy: number, status: FundReportMemberRow['status']): void {
    ctx.save();
    if (status === 'paid') {
        ctx.fillStyle = rgba(J.primary, 0.25);
        ctx.strokeStyle = J.primaryDeep;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy);
        ctx.lineTo(cx - 1, cy + 3);
        ctx.lineTo(cx + 4.5, cy - 3);
        ctx.stroke();
    } else if (status === 'partial') {
        ctx.fillStyle = rgba(J.secondary, 0.45);
        ctx.strokeStyle = J.secondaryDeep;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = J.secondaryDeep;
        ctx.beginPath();
        ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = rgba(J.accent, 0.35);
        ctx.strokeStyle = J.unpaid;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([2.5, 2]);
        ctx.beginPath();
        ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.restore();
}

export const ReportThemeCozyJourney: ReportThemeRenderer = {
    id: 'cozy-journey',
    async render(data: FundReportCardData, compact = false): Promise<Buffer> {
        const completed = data.isCompleted || data.progressPct >= 100;
        const mascotImg = await loadSvgSprite(`cozy-mascot:${completed ? 'done' : 'travel'}`, getCozyJourneyMascotSvg(completed));

        const headerH = data.description ? 124 : 96;
        const heroH = 266;
        const statsH = 100;
        const gap = 20;
        const twoCol = data.members.length > 16;
        const ROW_H = twoCol ? 74 : 56;
        const SECTION_H = 38;

        const sections = [
            { label: `Pending Destinations · ยังไม่จ่าย (${data.unpaidCount})`, members: data.groups.unpaid, color: J.unpaid },
            { label: `En-Route · จ่ายบางส่วน (${data.partialCount})`, members: data.groups.partial, color: J.secondaryDeep },
            { label: `Completed Checkpoints · จ่ายครบแล้ว (${data.paidCount})`, members: data.groups.paid, color: J.primaryDeep },
        ].filter((s) => s.members.length > 0);

        const rowCountOf = (list: FundReportMemberRow[]) => (twoCol ? Math.ceil(list.length / 2) : list.length);
        const totalRows = sections.reduce((sum, s) => sum + rowCountOf(s.members), 0);
        const rosterHeaderH = 56;
        const rosterH = data.members.length > 0 ? rosterHeaderH + sections.length * SECTION_H + totalRows * ROW_H + 18 : 112;
        const footerH = 56;
        const HEIGHT = PAD + headerH + gap + heroH + gap + statsH + gap + rosterH + 22 + footerH;

        const { ctx, encode } = renderSurface(WIDTH, HEIGHT, compact);
        ctx.textBaseline = 'alphabetic';

        // 1. Scrapbook Paper Canvas
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, WIDTH, HEIGHT, RADIUS);
        ctx.clip();
        drawScrapbookPaper(ctx, HEIGHT);
        ctx.restore();

        ctx.strokeStyle = J.line;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(1, 1, WIDTH - 2, HEIGHT - 2, RADIUS);
        ctx.stroke();

        // 2. Postcard Header Card
        let y = PAD;
        const innerW = WIDTH - PAD * 2;
        ctx.save();
        ctx.shadowColor = rgba(J.text, 0.07);
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = J.surface;
        ctx.beginPath();
        ctx.roundRect(PAD, y, innerW, headerH, 18);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = J.line;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(PAD, y, innerW, headerH, 18);
        ctx.stroke();

        drawWashiTape(ctx, PAD + 48, y + 2, 64, 16, -0.14, J.secondary);
        drawWashiTape(ctx, WIDTH - PAD - 48, y + 2, 64, 16, 0.14, J.accent);

        const stampColor = data.closed ? J.muted : completed ? J.primaryDeep : J.accentDeep;
        drawTravelStamp(ctx, WIDTH - PAD - 88, y + headerH / 2, data.statusLabel, stampColor);

        drawPill(ctx, PAD + 24, y + 16, 24, 12, 'TRAVEL JOURNAL  •  สมุดบันทึกรวมทริป', {
            font: noteFont(700, 11),
            bg: rgba(J.primary, 0.22),
            textColor: J.primaryDeep,
            padX: 10,
        });

        const fittedTitle = fitText(ctx, (s) => titleFont(700, s), data.title, 30, 20, innerW - 210);
        ctx.textAlign = 'left';
        ctx.fillStyle = J.text;
        ctx.font = titleFont(700, fittedTitle.size);
        ctx.fillText(fittedTitle.text, PAD + 24, y + 74);

        if (data.description) {
            ctx.fillStyle = J.muted;
            ctx.font = noteFont(400, 15);
            ctx.fillText(truncateText(ctx, data.description, innerW - 210), PAD + 24, y + 104);
        }

        y += headerH + gap;

        // 3. Hero Journey Route Card + Chibi Traveler Mascot
        ctx.save();
        ctx.shadowColor = rgba(J.text, 0.06);
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = J.surface;
        ctx.beginPath();
        ctx.roundRect(PAD, y, innerW, heroH, 20);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = J.line;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(PAD, y, innerW, heroH, 20);
        ctx.stroke();

        const leftW = innerW - 280;
        const jx = PAD + 28;
        const jw = leftW - 24;

        ctx.textAlign = 'left';
        ctx.fillStyle = J.primaryDeep;
        ctx.font = noteFont(700, 13);
        ctx.fillText('งบเดินทางที่สะสมได้แล้ว  •  JOURNEY FUND', jx, y + 34);

        drawPill(ctx, 0, y + 17, 28, 14, `เดินทางแล้ว ${data.progressPct}%`, {
            font: titleFont(600, 13),
            bg: rgba(J.accent, 0.35),
            border: J.accent,
            textColor: J.accentDeep,
            padX: 12,
            alignRight: jx + jw,
        });

        const collectedStr = plainAmount(data.collected);
        const fittedAmt = fitText(ctx, (s) => titleFont(700, s), collectedStr, 50, 32, jw - 170);
        ctx.fillStyle = J.primaryDeep;
        ctx.font = titleFont(700, fittedAmt.size);
        ctx.fillText(fittedAmt.text, jx, y + 92);
        const amtW = ctx.measureText(fittedAmt.text).width;

        ctx.fillStyle = J.text;
        ctx.font = titleFont(500, 20);
        ctx.fillText('บาท', jx + amtW + 8, y + 88);
        const bahtW = ctx.measureText('บาท').width;

        ctx.fillStyle = J.muted;
        ctx.font = noteFont(500, 16);
        ctx.fillText(
            truncateText(ctx, `/ เป้าหมาย ${formatBaht(data.target)}`, Math.max(0, jw - amtW - bahtW - 20)),
            jx + amtW + bahtW + 18,
            y + 88,
        );

        // Travel Route Progress Path
        ctx.fillStyle = J.muted;
        ctx.font = noteFont(600, 12);
        ctx.fillText('จุดเริ่มต้น', jx, y + 132);
        ctx.textAlign = 'right';
        ctx.fillText('จุดหมาย 100%', jx + jw, y + 132);

        drawJourneyRouteBar(ctx, jx, y + 158, jw, data.progressRatio, data.progressPct);

        // Travel note pill
        ctx.fillStyle = rgba(J.secondary, 0.24);
        ctx.strokeStyle = rgba(J.secondary, 0.8);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(jx, y + 194, jw, 48, 12);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.fillStyle = J.text;
        ctx.font = noteFont(600, 14);
        const journeyNote = completed
            ? `ถึงจุดหมายพร้อมกันทุกคนแล้ว! (${data.paidCount}/${data.memberCount} คน)`
            : `ผ่านจุดเช็คพอยต์แล้ว ${data.paidCount}/${data.memberCount} คน · เหลืออีก ${formatBaht(data.remaining)}`;
        ctx.fillText(truncateText(ctx, journeyNote, jw - 28), jx + 14, y + 223);

        // Right Chibi Traveler Mascot
        const mascotBoxX = PAD + leftW + 14;
        const mascotBoxW = innerW - leftW - 32;
        ctx.save();
        ctx.fillStyle = rgba(J.secondary, 0.16);
        ctx.strokeStyle = rgba(J.primary, 0.45);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.roundRect(mascotBoxX, y + 16, mascotBoxW, heroH - 32, 18);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        ctx.drawImage(mascotImg, mascotBoxX + (mascotBoxW - 216) / 2, y + 14, 216, 208);

        drawPill(ctx, mascotBoxX + 14, y + heroH - 46, 24, 12, completed ? 'ถึงจุดหมายแล้ว!' : 'ออกเดินทางกันต่อ!', {
            font: noteFont(700, 12),
            bg: J.surface,
            border: J.accent,
            textColor: J.accentDeep,
            padX: 12,
        });

        y += heroH + gap;

        // 4. Four Cozy Luggage-Tag Stat Cards
        const cozyStats = [
            {
                label: 'ยอดรอสมทบ (Pending)',
                value: formatBaht(data.remaining),
                sub: data.outstandingMemberCount > 0 ? `รอเพื่อนอีก ${data.outstandingMemberCount} คน` : 'ครบทุกคนแล้ว!',
                tape: J.accent,
                valColor: data.remaining > 0 ? J.accentDeep : J.primaryDeep,
            },
            {
                label: data.dailyRate ? 'เก็บสะสมรายวัน' : 'ตั๋วร่วมทริป/คน',
                value: data.rateLabel,
                sub: data.dailyRate ? `รวมคนละ ${formatBaht(data.amountPerMember)}` : 'ยอดต่อสมาชิก 1 คน',
                tape: J.secondary,
                valColor: J.text,
            },
            {
                label: 'เช็คพอยต์สมาชิก',
                value: `${data.paidCount} / ${data.memberCount} คน`,
                sub: `ยังไม่เริ่ม ${data.unpaidCount} · ระหว่างทาง ${data.partialCount}`,
                tape: J.primary,
                valColor: J.primaryDeep,
            },
            {
                label: 'วันออกเดินทาง',
                value: data.due.dateLabel,
                sub: data.due.remainingDaysLabel || (data.closed ? 'ปิดสมุดบันทึกแล้ว' : 'ยังไม่ระบุวันนัด'),
                tape: '#D4B499',
                valColor: data.due.tone === 'unpaid' ? J.unpaid : J.text,
            },
        ];

        const statGap = 14;
        const statW = (innerW - statGap * 3) / 4;
        cozyStats.forEach((st, idx) => {
            const sx = PAD + idx * (statW + statGap);
            ctx.save();
            ctx.shadowColor = rgba(J.text, 0.05);
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 3;
            ctx.fillStyle = J.surface;
            ctx.beginPath();
            ctx.roundRect(sx, y, statW, statsH, 16);
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = J.line;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.roundRect(sx, y, statW, statsH, 16);
            ctx.stroke();

            drawWashiTape(ctx, sx + statW / 2, y + 3, 56, 12, 0, st.tape);

            ctx.textAlign = 'left';
            ctx.fillStyle = J.muted;
            ctx.font = noteFont(700, 12);
            ctx.fillText(st.label, sx + 16, y + 30);

            ctx.fillStyle = st.valColor;
            ctx.font = titleFont(700, 20);
            ctx.fillText(truncateText(ctx, st.value, statW - 32), sx + 16, y + 60);

            ctx.fillStyle = J.muted;
            ctx.font = noteFont(400, 12);
            ctx.fillText(truncateText(ctx, st.sub, statW - 32), sx + 16, y + 84);
        });

        y += statsH + gap;

        // 5. Traveler Checkpoint Log
        ctx.save();
        ctx.shadowColor = rgba(J.text, 0.05);
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = J.surface;
        ctx.beginPath();
        ctx.roundRect(PAD, y, innerW, rosterH, 20);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = J.line;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(PAD, y, innerW, rosterH, 20);
        ctx.stroke();

        const rx = PAD + 24;
        const rw = innerW - 48;

        ctx.textAlign = 'left';
        ctx.fillStyle = J.text;
        ctx.font = titleFont(600, 18);
        ctx.fillText('สมุดเช็คพอยต์เพื่อนร่วมทริป  •  Member Checkpoints', rx, y + 35);

        let pillRight = rx + rw;
        for (const pill of [
            { text: `ครบแล้ว ${data.paidCount}`, bg: rgba(J.primary, 0.24), fg: J.primaryDeep },
            { text: `ระหว่างทาง ${data.partialCount}`, bg: rgba(J.secondary, 0.35), fg: J.secondaryDeep },
            { text: `รอออกเดินทาง ${data.unpaidCount}`, bg: rgba(J.accent, 0.35), fg: J.unpaid },
        ]) {
            const pw = drawPill(ctx, 0, y + 17, 24, 12, pill.text, {
                font: noteFont(700, 11),
                bg: pill.bg,
                textColor: pill.fg,
                padX: 10,
                alignRight: pillRight,
            });
            pillRight -= pw + 8;
        }

        if (data.members.length === 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = J.muted;
            ctx.font = noteFont(400, 15);
            ctx.fillText('ยังไม่มีเพื่อนร่วมทริปในรายการนี้', WIDTH / 2, y + 84);
        } else {
            let curY = y + rosterHeaderH;
            const colGap = 16;
            const colW = (rw - colGap) / 2;

            const drawSingleRow = (m: FundReportMemberRow, rx0: number, mw: number, top: number) => {
                const statusColor = m.status === 'paid' ? J.primaryDeep : m.status === 'partial' ? J.secondaryDeep : J.unpaid;
                const fillColor = m.status === 'paid' ? J.primary : m.status === 'partial' ? J.secondary : J.accent;
                const tagBg = m.status === 'paid' ? rgba(J.primary, 0.24) : m.status === 'partial' ? rgba(J.secondary, 0.35) : rgba(J.accent, 0.35);
                const statusText = m.status === 'paid' ? 'ถึงแล้ว' : m.status === 'partial' ? 'ระหว่างทาง' : 'รอออกเดินทาง';

                ctx.save();
                ctx.fillStyle = J.bg;
                ctx.strokeStyle = J.line;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.roundRect(rx0, top + 4, mw, ROW_H - 8, 12);
                ctx.fill();
                ctx.stroke();
                ctx.restore();

                const cy = top + ROW_H / 2;
                drawCheckpointIcon(ctx, rx0 + 22, cy, m.status);

                const badgeW = 92;
                const oweW = 114;
                const amtWCol = 126;
                const barW = 152;
                const nameW = mw - 42 - badgeW - oweW - amtWCol - barW - 44;

                ctx.textBaseline = 'middle';
                ctx.textAlign = 'left';
                ctx.fillStyle = J.text;
                ctx.font = titleFont(500, 15);
                ctx.fillText(truncateText(ctx, m.displayName, nameW), rx0 + 40, cy + 1);

                const barX = rx0 + 40 + nameW + 12;
                drawProgressTrack(ctx, barX, cy - 4, barW - 42, 8, m.progressRatio, J.track, fillColor, 4);
                ctx.textAlign = 'right';
                ctx.fillStyle = J.muted;
                ctx.font = noteFont(700, 12);
                ctx.fillText(`${m.progressPct}%`, barX + barW, cy + 1);

                const amtRight = barX + barW + 12 + amtWCol;
                ctx.fillStyle = J.text;
                ctx.font = noteFont(500, 14);
                ctx.fillText(truncateText(ctx, `${plainAmount(m.paid)} / ${plainAmount(m.target)} บ.`, amtWCol), amtRight, cy + 1);

                const oweRight = amtRight + 12 + oweW;
                ctx.fillStyle = m.remaining > 0 ? J.accentDeep : J.primaryDeep;
                ctx.font = noteFont(700, 14);
                ctx.fillText(truncateText(ctx, m.remaining > 0 ? `เหลือ ${plainAmount(m.remaining)}` : 'ครบ 0 บ.', oweW), oweRight, cy + 1);

                drawPill(ctx, 0, cy - 12, 24, 12, statusText, {
                    font: noteFont(700, 11),
                    bg: tagBg,
                    textColor: statusColor,
                    padX: 10,
                    alignRight: rx0 + mw - 12,
                });
                ctx.textBaseline = 'alphabetic';
            };

            const drawCompactRow = (m: FundReportMemberRow, rx0: number, mw: number, top: number) => {
                const statusColor = m.status === 'paid' ? J.primaryDeep : m.status === 'partial' ? J.secondaryDeep : J.unpaid;
                const fillColor = m.status === 'paid' ? J.primary : m.status === 'partial' ? J.secondary : J.accent;
                const tagBg = m.status === 'paid' ? rgba(J.primary, 0.24) : m.status === 'partial' ? rgba(J.secondary, 0.35) : rgba(J.accent, 0.35);
                const statusText = m.status === 'paid' ? 'ถึงแล้ว' : m.status === 'partial' ? 'ระหว่างทาง' : 'ยังไม่จ่าย';

                ctx.save();
                ctx.fillStyle = J.bg;
                ctx.strokeStyle = J.line;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.roundRect(rx0, top + 4, mw, ROW_H - 8, 12);
                ctx.fill();
                ctx.stroke();
                ctx.restore();

                drawCheckpointIcon(ctx, rx0 + 20, top + 24, m.status);

                const pillW = drawPill(ctx, 0, top + 13, 22, 11, statusText, {
                    font: noteFont(700, 11),
                    bg: tagBg,
                    textColor: statusColor,
                    padX: 8,
                    alignRight: rx0 + mw - 12,
                });

                ctx.textBaseline = 'alphabetic';
                ctx.textAlign = 'left';
                ctx.fillStyle = J.text;
                ctx.font = titleFont(500, 14);
                ctx.fillText(truncateText(ctx, m.displayName, mw - pillW - 56), rx0 + 36, top + 29);

                const barX = rx0 + 14;
                const barW = 90;
                drawProgressTrack(ctx, barX, top + 49, barW, 6, m.progressRatio, J.track, fillColor, 3);

                ctx.fillStyle = J.muted;
                ctx.font = noteFont(600, 12);
                ctx.fillText(`${plainAmount(m.paid)}/${plainAmount(m.target)} บ. (${m.progressPct}%)`, barX + barW + 10, top + 56);

                ctx.textAlign = 'right';
                ctx.fillStyle = m.remaining > 0 ? J.accentDeep : J.primaryDeep;
                ctx.font = noteFont(700, 12);
                ctx.fillText(m.remaining > 0 ? `เหลือ ${plainAmount(m.remaining)}` : 'ครบแล้ว', rx0 + mw - 12, top + 56);
            };

            for (const section of sections) {
                ctx.textAlign = 'left';
                ctx.fillStyle = section.color;
                ctx.font = titleFont(600, 14);
                ctx.fillText(`• ${section.label}`, rx, curY + 23);
                curY += SECTION_H;

                if (twoCol) {
                    for (let i = 0; i < section.members.length; i += 2) {
                        const left = section.members[i];
                        const right = section.members[i + 1];
                        if (left) drawCompactRow(left, rx, colW, curY);
                        if (right) drawCompactRow(right, rx + colW + colGap, colW, curY);
                        curY += ROW_H;
                    }
                } else {
                    for (const m of section.members) {
                        drawSingleRow(m, rx, rw, curY);
                        curY += ROW_H;
                    }
                }
            }
        }

        // 6. Footer
        ctx.textAlign = 'left';
        ctx.fillStyle = J.muted;
        ctx.font = noteFont(600, 13);
        ctx.fillText('NotStack Cozy Journey  •  สมุดบันทึกการเก็บเงินตามเป้า', PAD, HEIGHT - 24);
        ctx.textAlign = 'right';
        ctx.fillText(`บันทึกเมื่อ ${data.generatedAtLabel}`, WIDTH - PAD, HEIGHT - 24);

        return encode();
    },
};
