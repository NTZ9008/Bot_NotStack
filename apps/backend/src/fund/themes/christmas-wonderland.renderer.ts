import type { SKRSContext2D } from '@napi-rs/canvas';
import { formatBaht, type FundReportCardData, type FundReportMemberRow } from '@notstack/shared';
import { fontString } from '../../common/canvas/fonts';
import { renderSurface } from '../../common/utils/render-surface';
import { getChristmasElfMascotSvg, resolveChristmasMascotStage, type ChristmasMascotStage } from './christmas-mascot.svg';
import { drawPill, drawProgressTrack, fitText, loadSvgSprite, plainAmount, rgba, truncateText, type ReportThemeRenderer } from './report-theme.types';

// ==========================================
// 🎄 CHRISTMAS WONDERLAND THEME — Premium Festive Greeting Card + Chibi Elf Mascot
// ==========================================
const WIDTH = 1020;
const PAD = 44;
const RADIUS = 22;

const X = {
    forestGreen: '#123C32',
    deepEvergreen: '#0B2925',
    festiveRed: '#C94145',
    snowWhite: '#FFFDF7',
    champagneGold: '#E7C779',
    frostBlue: '#C8E6F0',
    warmCream: '#F5EBD8',
    evergreenDeep: '#081F1B',
    emeraldText: '#6EE7B7',
    mutedCream: '#C4CECA',
};

const titleFont = (weight: number, size: number) => fontString('kanit', weight, size);
const bodyFont = (weight: number, size: number) => fontString('sarabun', weight, size);

function drawSnowflake(ctx: SKRSContext2D, cx: number, cy: number, r: number, color: string, alpha = 1): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, r * 0.14);
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const dx = Math.cos(angle) * r;
        const dy = Math.sin(angle) * r;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + dx, cy + dy);
        // Tiny side branches
        const bx = Math.cos(angle) * (r * 0.62);
        const by = Math.sin(angle) * (r * 0.62);
        const bLen = r * 0.28;
        ctx.moveTo(cx + bx, cy + by);
        ctx.lineTo(cx + bx + Math.cos(angle + 0.65) * bLen, cy + by + Math.sin(angle + 0.65) * bLen);
        ctx.moveTo(cx + bx, cy + by);
        ctx.lineTo(cx + bx + Math.cos(angle - 0.65) * bLen, cy + by + Math.sin(angle - 0.65) * bLen);
        ctx.stroke();
    }
    ctx.restore();
}

function drawFourPointStar(ctx: SKRSContext2D, cx: number, cy: number, r: number, color: string): void {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + r * 0.22, cy - r * 0.22, cx + r, cy);
    ctx.quadraticCurveTo(cx + r * 0.22, cy + r * 0.22, cx, cy + r);
    ctx.quadraticCurveTo(cx - r * 0.22, cy + r * 0.22, cx - r, cy);
    ctx.quadraticCurveTo(cx - r * 0.22, cy - r * 0.22, cx, cy - r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawTreeSilhouette(ctx: SKRSContext2D, cx: number, topY: number, height: number, width: number, fill: string): void {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.lineTo(cx + width * 0.22, topY + height * 0.3);
    ctx.lineTo(cx + width * 0.12, topY + height * 0.3);
    ctx.lineTo(cx + width * 0.36, topY + height * 0.62);
    ctx.lineTo(cx + width * 0.22, topY + height * 0.62);
    ctx.lineTo(cx + width * 0.5, topY + height);
    ctx.lineTo(cx - width * 0.5, topY + height);
    ctx.lineTo(cx - width * 0.22, topY + height * 0.62);
    ctx.lineTo(cx - width * 0.36, topY + height * 0.62);
    ctx.lineTo(cx - width * 0.12, topY + height * 0.3);
    ctx.lineTo(cx - width * 0.22, topY + height * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawPineCornerBranch(ctx: SKRSContext2D, flipX: boolean): void {
    ctx.save();
    if (flipX) {
        ctx.translate(WIDTH, 0);
        ctx.scale(-1, 1);
    }
    // Evergreen needles radiating softly from top-left frame corner
    const needles = [
        [0, 0, 125, 22],
        [0, 0, 110, 40],
        [0, 0, 90, 62],
        [0, 0, 62, 82],
        [18, 0, 140, 14],
    ];
    for (const [x1, y1, x2, y2] of needles) {
        ctx.strokeStyle = '#1C5B4B';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Snow dust highlight along top edge of pine needles
        ctx.strokeStyle = rgba(X.snowWhite, 0.55);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x1 + 6, y1 + 1);
        ctx.lineTo(x2 - 8, y2 - 2);
        ctx.stroke();
    }

    // Small hanging Festive Red & Champagne Gold ornaments in top corner
    ctx.strokeStyle = X.champagneGold;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(56, 26);
    ctx.lineTo(56, 44);
    ctx.moveTo(96, 18);
    ctx.lineTo(96, 32);
    ctx.stroke();

    ctx.fillStyle = X.festiveRed;
    ctx.beginPath();
    ctx.arc(56, 52, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(X.snowWhite, 0.6);
    ctx.beginPath();
    ctx.arc(53, 49, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = X.champagneGold;
    ctx.beginPath();
    ctx.arc(96, 38, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawGiftBox(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, boxColor: string, ribbonColor: string): void {
    ctx.save();
    ctx.fillStyle = boxColor;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.fill();
    ctx.fillStyle = ribbonColor;
    ctx.fillRect(x + w * 0.41, y, w * 0.18, h);
    ctx.fillRect(x, y + h * 0.4, w, h * 0.18);
    ctx.beginPath();
    ctx.arc(x + w * 0.36, y - 2, w * 0.16, 0, Math.PI * 2);
    ctx.arc(x + w * 0.64, y - 2, w * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawChristmasFrameAndAtmosphere(ctx: SKRSContext2D, height: number): void {
    ctx.save();
    ctx.fillStyle = X.deepEvergreen;
    ctx.fillRect(0, 0, WIDTH, height);

    // Subtle emerald ambient glow
    const glow = ctx.createRadialGradient(WIDTH * 0.5, 220, 40, WIDTH * 0.5, 220, 560);
    glow.addColorStop(0, rgba('#1D5E4E', 0.55));
    glow.addColorStop(1, rgba(X.deepEvergreen, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, height);

    // Subtle Christmas tree silhouette watermark in background
    drawTreeSilhouette(ctx, WIDTH * 0.5, 260, 420, 340, rgba('#1B5547', 0.16));

    // Gentle snow landscape drift along the very bottom
    ctx.fillStyle = rgba(X.frostBlue, 0.08);
    ctx.beginPath();
    ctx.moveTo(0, height - 38);
    ctx.quadraticCurveTo(WIDTH * 0.3, height - 58, WIDTH * 0.62, height - 36);
    ctx.quadraticCurveTo(WIDTH * 0.85, height - 24, WIDTH, height - 42);
    ctx.lineTo(WIDTH, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    // Margin snowflakes & champagne gold sparkles (kept cleanly outside central text areas)
    const flakes: [number, number, number, string, number][] = [
        [28, 160, 8, X.frostBlue, 0.45],
        [WIDTH - 28, 190, 9, X.snowWhite, 0.45],
        [24, 340, 7, X.champagneGold, 0.4],
        [WIDTH - 24, 380, 7, X.frostBlue, 0.42],
        [26, height - 130, 8, X.frostBlue, 0.45],
        [WIDTH - 26, height - 140, 9, X.champagneGold, 0.45],
        [152, 34, 6, X.champagneGold, 0.55],
        [WIDTH - 152, 34, 6, X.champagneGold, 0.55],
    ];
    for (const [fx, fy, fr, fc, fa] of flakes) drawSnowflake(ctx, fx, fy, fr, fc, fa);

    const dots: [number, number, number, string][] = [
        [185, 24, 2.2, X.champagneGold],
        [260, 30, 1.8, X.snowWhite],
        [340, 22, 2.0, X.frostBlue],
        [WIDTH - 220, 26, 2.2, X.champagneGold],
        [WIDTH - 310, 20, 1.8, X.snowWhite],
        [24, 248, 2.0, X.snowWhite],
        [WIDTH - 24, 272, 2.0, X.champagneGold],
    ];
    for (const [dx, dy, dr, dc] of dots) {
        ctx.fillStyle = rgba(dc, 0.7);
        ctx.beginPath();
        ctx.arc(dx, dy, dr, 0, Math.PI * 2);
        ctx.fill();
    }

    // Subtle glowing fairy lights garland along the top border edge
    ctx.strokeStyle = rgba(X.champagneGold, 0.35);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(140, 14);
    ctx.quadraticCurveTo(WIDTH / 2, 32, WIDTH - 140, 14);
    ctx.stroke();

    const bulbs = 11;
    for (let i = 1; i < bulbs; i++) {
        const t = i / bulbs;
        const bx = 140 + (WIDTH - 280) * t;
        const by = 14 + 4 * 18 * t * (1 - t) - 2;
        const bulbColor = i % 3 === 0 ? X.festiveRed : i % 2 === 0 ? X.frostBlue : X.champagneGold;
        ctx.fillStyle = rgba(bulbColor, 0.25);
        ctx.beginPath();
        ctx.arc(bx, by, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = bulbColor;
        ctx.beginPath();
        ctx.arc(bx, by, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Pine corner boughs & ornaments
    drawPineCornerBranch(ctx, false);
    drawPineCornerBranch(ctx, true);

    // Double luxury champagne-gold inset border frame
    ctx.strokeStyle = rgba(X.champagneGold, 0.72);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(12, 12, WIDTH - 24, height - 24, RADIUS - 6);
    ctx.stroke();

    ctx.strokeStyle = rgba(X.champagneGold, 0.28);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(18, 18, WIDTH - 36, height - 36, RADIUS - 10);
    ctx.stroke();

    ctx.restore();
}

function drawSnowflakeSeparator(ctx: SKRSContext2D, y: number): void {
    const left = PAD;
    const right = WIDTH - PAD;
    const mid = WIDTH / 2;
    ctx.save();
    ctx.strokeStyle = rgba(X.champagneGold, 0.42);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(mid - 26, y);
    ctx.moveTo(mid + 26, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    drawSnowflake(ctx, mid, y, 10, X.frostBlue, 0.9);
    drawFourPointStar(ctx, mid - 18, y, 3.5, X.champagneGold);
    drawFourPointStar(ctx, mid + 18, y, 3.5, X.champagneGold);
    ctx.restore();
}

function drawMemberStatusFestiveIcon(ctx: SKRSContext2D, cx: number, cy: number, status: FundReportMemberRow['status']): void {
    ctx.save();
    if (status === 'paid') {
        // Green Christmas tree with gold star topper
        drawTreeSilhouette(ctx, cx, cy - 8, 16, 16, X.emeraldText);
        drawFourPointStar(ctx, cx, cy - 9, 4, X.champagneGold);
    } else if (status === 'partial') {
        // Champagne gold Christmas ornament bauble
        ctx.fillStyle = X.champagneGold;
        ctx.fillRect(cx - 2.5, cy - 10, 5, 3);
        ctx.beginPath();
        ctx.arc(cx, cy + 1, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = X.forestGreen;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy + 1);
        ctx.lineTo(cx + 6, cy + 1);
        ctx.stroke();
    } else {
        // Festive red gift box with gold ribbon
        drawGiftBox(ctx, cx - 7, cy - 6, 14, 13, X.festiveRed, X.champagneGold);
    }
    ctx.restore();
}

const MASCOT_CAPTION: Record<ChristmasMascotStage, string> = {
    encouraging: 'เริ่มต้นส่งต่อความสุข!',
    cheerful: 'คริสต์มาสใกล้เข้ามาแล้ว!',
    excited: 'ใกล้ถึงเป้าหมายแล้วนะ!',
    celebration: 'ฉลองสำเร็จ 100%!',
};

export const ReportThemeChristmasWonderland: ReportThemeRenderer = {
    id: 'christmas-wonderland',
    async render(data: FundReportCardData, compact = false): Promise<Buffer> {
        const stage = resolveChristmasMascotStage(data.progressPct, data.isCompleted);
        const mascotImg = await loadSvgSprite(`xmas-elf:${stage}`, getChristmasElfMascotSvg(stage));

        const headerH = 224;
        const sepH = 28;
        const progressH = 186;
        const statsH = 104;
        const gap = 18;
        const twoCol = data.members.length > 16;
        const ROW_H = twoCol ? 74 : 56;
        const SECTION_H = 38;

        const sections = [
            { label: `ยังไม่จ่าย · Unpaid (${data.unpaidCount})`, members: data.groups.unpaid, color: '#FCA5A5' },
            { label: `จ่ายบางส่วน · Partial (${data.partialCount})`, members: data.groups.partial, color: X.champagneGold },
            { label: `จ่ายครบแล้ว · Paid (${data.paidCount})`, members: data.groups.paid, color: X.emeraldText },
        ].filter((s) => s.members.length > 0);

        const rowCountOf = (list: FundReportMemberRow[]) => (twoCol ? Math.ceil(list.length / 2) : list.length);
        const totalRows = sections.reduce((sum, s) => sum + rowCountOf(s.members), 0);
        const rosterHeaderH = 56;
        const membersH = data.members.length > 0 ? rosterHeaderH + sections.length * SECTION_H + totalRows * ROW_H + 16 : 112;
        const footerH = 66;
        const HEIGHT = 48 + headerH + sepH + progressH + gap + statsH + sepH + membersH + 26 + footerH;

        const { ctx, encode } = renderSurface(WIDTH, HEIGHT, compact);
        ctx.textBaseline = 'alphabetic';

        // 1. Evergreen Greeting Card Canvas & Decorations
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, WIDTH, HEIGHT, RADIUS);
        ctx.clip();
        drawChristmasFrameAndAtmosphere(ctx, HEIGHT);
        ctx.restore();

        // 2. Header Section (Left Collection Info + Right Chibi Elf Mascot Medallion)
        let y = 48;
        const innerW = WIDTH - PAD * 2;
        const mascotW = 244;
        const headerLeftW = innerW - mascotW - 22;

        // Top Merry Christmas & Status Badges
        const seasonalW = drawPill(ctx, PAD, y + 2, 26, 13, 'MERRY CHRISTMAS  •  SEASONAL', {
            font: bodyFont(700, 11),
            bg: rgba(X.festiveRed, 0.85),
            border: rgba(X.champagneGold, 0.7),
            textColor: X.snowWhite,
            padX: 12,
        });

        const statusColor = data.closed ? X.mutedCream : data.isCompleted ? X.emeraldText : X.champagneGold;
        drawPill(ctx, PAD + seasonalW + 10, y + 2, 26, 13, data.statusLabel, {
            font: titleFont(600, 12),
            bg: rgba(X.forestGreen, 0.9),
            border: rgba(statusColor, 0.75),
            textColor: statusColor,
            padX: 12,
        });

        // Collection Title & Description
        const fittedTitle = fitText(ctx, (s) => titleFont(700, s), data.title, 34, 22, headerLeftW);
        ctx.textAlign = 'left';
        ctx.fillStyle = X.snowWhite;
        ctx.font = titleFont(700, fittedTitle.size);
        ctx.fillText(fittedTitle.text, PAD, y + 76);

        if (data.description) {
            ctx.fillStyle = X.warmCream;
            ctx.font = bodyFont(400, 16);
            ctx.fillText(truncateText(ctx, data.description, headerLeftW), PAD, y + 108);
        }

        // Header Greeting + Deadline & Rate Cards
        const greetingY = data.description ? y + 132 : y + 114;
        ctx.save();
        ctx.fillStyle = rgba(X.forestGreen, 0.88);
        ctx.strokeStyle = rgba(X.champagneGold, 0.45);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(PAD, greetingY, headerLeftW, 74, 14);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.textAlign = 'left';
        ctx.fillStyle = X.champagneGold;
        ctx.font = bodyFont(700, 12);
        ctx.fillText('CHRISTMAS COLLECTION GREETING  •  รายละเอียดรอบเก็บเงิน', PAD + 16, greetingY + 24);

        ctx.fillStyle = X.snowWhite;
        ctx.font = titleFont(500, 15);
        const deadlineLine = `กำหนดส่ง: ${data.due.dateLabel}${data.due.remainingDaysLabel ? ` (${data.due.remainingDaysLabel})` : ''}  •  ยอดเก็บ: ${data.rateLabel}`;
        ctx.fillText(truncateText(ctx, deadlineLine, headerLeftW - 32), PAD + 16, greetingY + 53);

        // Right Chibi Elf Mascot Medallion
        const mx = PAD + headerLeftW + 22;
        ctx.save();
        ctx.fillStyle = X.forestGreen;
        ctx.strokeStyle = rgba(X.champagneGold, 0.68);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.roundRect(mx, y, mascotW, headerH - 6, 18);
        ctx.fill();
        ctx.stroke();

        // Inner festive gold arch
        ctx.strokeStyle = rgba(X.frostBlue, 0.25);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(mx + 6, y + 6, mascotW - 12, headerH - 18, 14);
        ctx.stroke();
        ctx.restore();

        ctx.drawImage(mascotImg, mx + (mascotW - 186) / 2, y + 4, 186, 182);

        const captionText = MASCOT_CAPTION[stage];
        const captionFont = bodyFont(700, 11);
        ctx.font = captionFont;
        const captionPillW = Math.ceil(ctx.measureText(captionText).width + 24);
        drawPill(ctx, mx + (mascotW - captionPillW) / 2, y + headerH - 40, 24, 12, captionText, {
            font: captionFont,
            bg: X.deepEvergreen,
            border: rgba(X.champagneGold, 0.65),
            textColor: X.champagneGold,
            padX: 12,
        });

        y += headerH;
        drawSnowflakeSeparator(ctx, y + sepH / 2);
        y += sepH;

        // 3. Collection Progress Card (Forest Green + Evergreen/Gold Gradient Bar)
        ctx.save();
        ctx.fillStyle = X.forestGreen;
        ctx.strokeStyle = rgba(X.champagneGold, 0.6);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(PAD, y, innerW, progressH, 18);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        const px = PAD + 28;
        const pw = innerW - 56;

        ctx.textAlign = 'left';
        ctx.fillStyle = X.frostBlue;
        ctx.font = bodyFont(700, 13);
        ctx.fillText('ยอดเงินสะสมเทศกาล  •  FESTIVE COLLECTION PROGRESS', px, y + 32);

        drawPill(ctx, 0, y + 16, 30, 15, `${data.progressPct}% COMPLETE`, {
            font: titleFont(700, 13),
            bg: rgba(X.festiveRed, 0.88),
            border: X.champagneGold,
            borderWidth: 1.4,
            textColor: X.snowWhite,
            padX: 14,
            alignRight: px + pw,
        });

        const collectedStr = plainAmount(data.collected);
        const fittedCollected = fitText(ctx, (s) => titleFont(700, s), collectedStr, 52, 34, pw - 220);
        ctx.save();
        ctx.shadowColor = rgba(X.champagneGold, 0.35);
        ctx.shadowBlur = 12;
        ctx.fillStyle = X.champagneGold;
        ctx.font = titleFont(700, fittedCollected.size);
        ctx.fillText(fittedCollected.text, px, y + 90);
        ctx.restore();

        const amtW = ctx.measureText(fittedCollected.text).width;
        ctx.fillStyle = X.snowWhite;
        ctx.font = titleFont(600, 20);
        ctx.fillText('บาท', px + amtW + 10, y + 86);
        const bahtW = ctx.measureText('บาท').width;

        ctx.fillStyle = X.warmCream;
        ctx.font = bodyFont(500, 17);
        ctx.fillText(
            truncateText(ctx, `/ เป้าหมาย ${formatBaht(data.target)}`, Math.max(0, pw - amtW - bahtW - 24)),
            px + amtW + bahtW + 22,
            y + 86,
        );

        // Festive Gradient Progress Bar with Snowflake Markers
        const barY = y + 114;
        const barH = 20;
        const barGrad = ctx.createLinearGradient(px, barY, px + pw, barY);
        barGrad.addColorStop(0, '#1F7A63');
        barGrad.addColorStop(0.55, '#41B58F');
        barGrad.addColorStop(1, X.champagneGold);

        if (data.progressRatio > 0) {
            ctx.save();
            ctx.shadowColor = rgba(X.champagneGold, Math.min(0.55, 0.15 + data.progressRatio * 0.4));
            ctx.shadowBlur = 14;
            drawProgressTrack(ctx, px, barY, pw, barH, data.progressRatio, X.evergreenDeep, barGrad, 10);
            ctx.restore();
        } else {
            drawProgressTrack(ctx, px, barY, pw, barH, 0, X.evergreenDeep, barGrad, 10);
        }

        ctx.save();
        ctx.strokeStyle = rgba(X.champagneGold, 0.55);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(px, barY, pw, barH, 10);
        ctx.stroke();

        // Snowflake milestone markers along progress bar
        for (const tick of [0.25, 0.5, 0.75]) {
            const tx = px + pw * tick;
            const reached = data.progressRatio >= tick;
            drawSnowflake(ctx, tx, barY + barH / 2, 6, reached ? X.snowWhite : rgba(X.frostBlue, 0.45), 1);
        }
        if (data.progressRatio > 0.03) {
            const tipX = Math.min(px + pw - 10, Math.max(px + 10, px + pw * data.progressRatio));
            drawFourPointStar(ctx, tipX, barY + barH / 2, 9, X.snowWhite);
        }
        ctx.restore();

        // Remaining balance strip
        ctx.textAlign = 'left';
        ctx.fillStyle = X.mutedCream;
        ctx.font = bodyFont(500, 14);
        ctx.fillText(
            data.remaining > 0 ? `คงเหลือที่ต้องเก็บอีก ${formatBaht(data.remaining)}` : 'เก็บยอดครบตามเป้าหมาย 100% แล้ว!',
            px,
            y + 164,
        );
        ctx.textAlign = 'right';
        ctx.fillStyle = X.champagneGold;
        ctx.font = bodyFont(700, 14);
        ctx.fillText(`จ่ายครบ ${data.paidCount} จาก ${data.memberCount} คน`, px + pw, y + 164);

        y += progressH + gap;

        // 4. Three Distinct Payment Statistic Panels (Outstanding / Paid Members / Collection Deadline)
        const statPanels = [
            {
                title: 'ยอดคงค้างรวม • OUTSTANDING',
                value: formatBaht(data.remaining),
                sub: data.outstandingMemberCount > 0 ? `ค้างชำระ ${data.outstandingMemberCount} คน · ${data.rateLabel}` : `เก็บครบทุกคนแล้ว · ${data.rateLabel}`,
                accent: X.festiveRed,
                valColor: data.remaining > 0 ? '#FCA5A5' : X.emeraldText,
                badge: 'gift' as const,
            },
            {
                title: 'สมาชิกที่จ่ายครบ • PAID MEMBERS',
                value: `${data.paidCount} / ${data.memberCount} คน`,
                sub: `ยังไม่จ่าย ${data.unpaidCount} คน · จ่ายบางส่วน ${data.partialCount} คน`,
                accent: '#2FA682',
                valColor: X.emeraldText,
                badge: 'tree' as const,
            },
            {
                title: 'กำหนดชำระ • DEADLINE',
                value: data.due.dateLabel,
                sub: data.due.remainingDaysLabel || (data.closed ? 'ปิดรับเงินแล้ว' : 'ไม่ได้กำหนดวันครบ'),
                accent: X.champagneGold,
                valColor: data.due.tone === 'unpaid' ? '#FCA5A5' : X.champagneGold,
                badge: 'star' as const,
            },
        ];

        const statGap = 16;
        const statW = (innerW - statGap * 2) / 3;
        statPanels.forEach((panel, idx) => {
            const sx = PAD + idx * (statW + statGap);
            ctx.save();
            ctx.fillStyle = X.forestGreen;
            ctx.strokeStyle = rgba(panel.accent, 0.55);
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.roundRect(sx, y, statW, statsH, 16);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = panel.accent;
            ctx.fillRect(sx + 18, y, 56, 3);
            ctx.restore();

            if (panel.badge === 'gift') drawGiftBox(ctx, sx + statW - 34, y + 16, 16, 15, X.festiveRed, X.champagneGold);
            else if (panel.badge === 'tree') drawTreeSilhouette(ctx, sx + statW - 26, y + 14, 18, 18, X.emeraldText);
            else drawFourPointStar(ctx, sx + statW - 26, y + 23, 9, X.champagneGold);

            ctx.textAlign = 'left';
            ctx.fillStyle = X.warmCream;
            ctx.font = bodyFont(700, 11);
            ctx.fillText(truncateText(ctx, panel.title, statW - 56), sx + 18, y + 28);

            ctx.fillStyle = panel.valColor;
            ctx.font = titleFont(700, 23);
            ctx.fillText(truncateText(ctx, panel.value, statW - 36), sx + 18, y + 62);

            ctx.fillStyle = X.mutedCream;
            ctx.font = bodyFont(400, 13);
            ctx.fillText(truncateText(ctx, panel.sub, statW - 36), sx + 18, y + 87);
        });

        y += statsH;
        drawSnowflakeSeparator(ctx, y + sepH / 2);
        y += sepH;

        // 5. Member Status Section
        ctx.save();
        ctx.fillStyle = X.forestGreen;
        ctx.strokeStyle = rgba(X.champagneGold, 0.48);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(PAD, y, innerW, membersH, 18);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        const rx = PAD + 24;
        const rw = innerW - 48;

        ctx.textAlign = 'left';
        ctx.fillStyle = X.snowWhite;
        ctx.font = titleFont(600, 18);
        ctx.fillText('สถานะสมาชิก  •  Member List', rx, y + 35);

        let pillRight = rx + rw;
        for (const badge of [
            { text: `จ่ายครบ ${data.paidCount}`, bg: rgba('#10B981', 0.2), fg: X.emeraldText, border: rgba(X.emeraldText, 0.45) },
            { text: `บางส่วน ${data.partialCount}`, bg: rgba(X.champagneGold, 0.16), fg: X.champagneGold, border: rgba(X.champagneGold, 0.45) },
            { text: `ยังไม่จ่าย ${data.unpaidCount}`, bg: rgba(X.festiveRed, 0.24), fg: '#FCA5A5', border: rgba(X.festiveRed, 0.55) },
        ]) {
            const pwBadge = drawPill(ctx, 0, y + 17, 24, 12, badge.text, {
                font: bodyFont(700, 11),
                bg: badge.bg,
                border: badge.border,
                textColor: badge.fg,
                padX: 10,
                alignRight: pillRight,
            });
            pillRight -= pwBadge + 8;
        }

        if (data.members.length === 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = X.mutedCream;
            ctx.font = bodyFont(400, 15);
            ctx.fillText('ยังไม่มีรายชื่อสมาชิกในหัวข้อนี้', WIDTH / 2, y + 84);
        } else {
            let curY = y + rosterHeaderH;
            const colGap = 16;
            const colW = (rw - colGap) / 2;

            const drawSingleRow = (m: FundReportMemberRow, rx0: number, mw: number, top: number) => {
                const statusColor = m.status === 'paid' ? X.emeraldText : m.status === 'partial' ? X.champagneGold : '#FCA5A5';
                const borderColor = m.status === 'paid' ? rgba(X.emeraldText, 0.3) : m.status === 'partial' ? rgba(X.champagneGold, 0.35) : rgba(X.festiveRed, 0.42);
                const statusText = m.status === 'paid' ? 'จ่ายครบ' : m.status === 'partial' ? 'บางส่วน' : 'ยังไม่จ่าย';

                ctx.save();
                ctx.fillStyle = X.evergreenDeep;
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.roundRect(rx0, top + 4, mw, ROW_H - 8, 12);
                ctx.fill();
                ctx.stroke();
                ctx.restore();

                const cy = top + ROW_H / 2;
                drawMemberStatusFestiveIcon(ctx, rx0 + 22, cy, m.status);

                const badgeW = 80;
                const oweW = 114;
                const amtWCol = 128;
                const barW = 152;
                const nameW = mw - 42 - badgeW - oweW - amtWCol - barW - 44;

                ctx.textBaseline = 'middle';
                ctx.textAlign = 'left';
                ctx.fillStyle = X.snowWhite;
                ctx.font = bodyFont(600, 15);
                ctx.fillText(truncateText(ctx, m.displayName, nameW), rx0 + 40, cy + 1);

                const barX = rx0 + 40 + nameW + 12;
                const fillBar = m.status === 'paid' ? '#2FA682' : m.status === 'partial' ? X.champagneGold : X.festiveRed;
                drawProgressTrack(ctx, barX, cy - 4, barW - 42, 7, m.progressRatio, '#051513', fillBar, 3.5);
                ctx.textAlign = 'right';
                ctx.fillStyle = X.mutedCream;
                ctx.font = bodyFont(600, 12);
                ctx.fillText(`${m.progressPct}%`, barX + barW, cy + 1);

                const amtRight = barX + barW + 12 + amtWCol;
                ctx.fillStyle = X.warmCream;
                ctx.font = bodyFont(500, 14);
                ctx.fillText(truncateText(ctx, `${plainAmount(m.paid)} / ${plainAmount(m.target)} บ.`, amtWCol), amtRight, cy + 1);

                const oweRight = amtRight + 12 + oweW;
                ctx.fillStyle = m.remaining > 0 ? X.champagneGold : X.emeraldText;
                ctx.font = bodyFont(700, 14);
                ctx.fillText(truncateText(ctx, m.remaining > 0 ? `ค้าง ${plainAmount(m.remaining)}` : 'ครบ 0 บ.', oweW), oweRight, cy + 1);

                drawPill(ctx, 0, cy - 12, 24, 12, statusText, {
                    font: bodyFont(700, 11),
                    bg: rgba(statusColor, 0.14),
                    border: rgba(statusColor, 0.45),
                    textColor: statusColor,
                    padX: 10,
                    alignRight: rx0 + mw - 12,
                });
                ctx.textBaseline = 'alphabetic';
            };

            const drawCompactRow = (m: FundReportMemberRow, rx0: number, mw: number, top: number) => {
                const statusColor = m.status === 'paid' ? X.emeraldText : m.status === 'partial' ? X.champagneGold : '#FCA5A5';
                const borderColor = m.status === 'paid' ? rgba(X.emeraldText, 0.3) : m.status === 'partial' ? rgba(X.champagneGold, 0.35) : rgba(X.festiveRed, 0.42);
                const statusText = m.status === 'paid' ? 'จ่ายครบ' : m.status === 'partial' ? 'บางส่วน' : 'ยังไม่จ่าย';

                ctx.save();
                ctx.fillStyle = X.evergreenDeep;
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.roundRect(rx0, top + 4, mw, ROW_H - 8, 12);
                ctx.fill();
                ctx.stroke();
                ctx.restore();

                drawMemberStatusFestiveIcon(ctx, rx0 + 20, top + 24, m.status);

                const pillW = drawPill(ctx, 0, top + 13, 22, 11, statusText, {
                    font: bodyFont(700, 11),
                    bg: rgba(statusColor, 0.14),
                    border: rgba(statusColor, 0.45),
                    textColor: statusColor,
                    padX: 8,
                    alignRight: rx0 + mw - 12,
                });

                ctx.textBaseline = 'alphabetic';
                ctx.textAlign = 'left';
                ctx.fillStyle = X.snowWhite;
                ctx.font = bodyFont(600, 14);
                ctx.fillText(truncateText(ctx, m.displayName, mw - pillW - 56), rx0 + 36, top + 29);

                const barX = rx0 + 14;
                const barW = 90;
                const fillBar = m.status === 'paid' ? '#2FA682' : m.status === 'partial' ? X.champagneGold : X.festiveRed;
                drawProgressTrack(ctx, barX, top + 49, barW, 6, m.progressRatio, '#051513', fillBar, 3);

                ctx.fillStyle = X.mutedCream;
                ctx.font = bodyFont(500, 12);
                ctx.fillText(`${plainAmount(m.paid)}/${plainAmount(m.target)} บ. (${m.progressPct}%)`, barX + barW + 10, top + 56);

                ctx.textAlign = 'right';
                ctx.fillStyle = m.remaining > 0 ? X.champagneGold : X.emeraldText;
                ctx.font = bodyFont(700, 12);
                ctx.fillText(m.remaining > 0 ? `ค้าง ${plainAmount(m.remaining)}` : 'ครบ 0 บ.', rx0 + mw - 12, top + 56);
            };

            for (const section of sections) {
                drawFourPointStar(ctx, rx + 5, curY + 18, 4.5, section.color);
                ctx.textAlign = 'left';
                ctx.fillStyle = section.color;
                ctx.font = titleFont(600, 14);
                ctx.fillText(section.label, rx + 16, curY + 23);
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

        // 6. Season's Greetings Footer & Decorative Gifts
        drawGiftBox(ctx, PAD, HEIGHT - 60, 20, 17, X.festiveRed, X.champagneGold);
        drawGiftBox(ctx, PAD + 26, HEIGHT - 56, 15, 13, '#1C5B4B', X.festiveRed);
        drawGiftBox(ctx, WIDTH - PAD - 22, HEIGHT - 58, 19, 16, X.champagneGold, X.festiveRed);

        ctx.strokeStyle = rgba(X.champagneGold, 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, HEIGHT - 34);
        ctx.lineTo(WIDTH - PAD, HEIGHT - 34);
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.fillStyle = X.warmCream;
        ctx.font = bodyFont(600, 13);
        ctx.fillText("Season's Greetings • Merry Christmas  •  NotStack ระบบเก็บเงินตามเป้า", PAD, HEIGHT - 14);
        ctx.textAlign = 'right';
        ctx.fillStyle = X.champagneGold;
        ctx.fillText(`อัปเดต ${data.generatedAtLabel}`, WIDTH - PAD, HEIGHT - 14);

        return encode();
    },
};
