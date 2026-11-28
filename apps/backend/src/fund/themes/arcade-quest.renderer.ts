import type { SKRSContext2D } from '@napi-rs/canvas';
import { formatBaht, type FundReportCardData, type FundReportMemberRow } from '@notstack/shared';
import { fontString } from '../../common/canvas/fonts';
import { renderSurface } from '../../common/utils/render-surface';
import { getArcadeQuestMascotSvg } from './mascots.svg';
import { drawPill, drawProgressTrack, fitText, loadSvgSprite, plainAmount, rgba, truncateText, type ReportThemeRenderer } from './report-theme.types';

// ==========================================
// 🎮 ARCADE QUEST THEME — Gaming HUD / RPG Quest Progress + Original Chibi Mascot
// ==========================================
const WIDTH = 1020;
const PAD = 36;
const RADIUS = 20;

const A = {
    bg: '#17132E',
    surface: '#241C46',
    surfaceDeep: '#1B1438',
    primary: '#22D3EE',
    secondary: '#8B5CF6',
    accent: '#FBBF24',
    text: '#F8FAFC',
    muted: '#B4A9D6',
    unpaid: '#FB7185',
    track: '#130E29',
};

const hudFont = (weight: number, size: number) => fontString('prompt', weight, size);

function drawFourPointStar(ctx: SKRSContext2D, cx: number, cy: number, r: number, color: string): void {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + r * 0.2, cy - r * 0.2, cx + r, cy);
    ctx.quadraticCurveTo(cx + r * 0.2, cy + r * 0.2, cx, cy + r);
    ctx.quadraticCurveTo(cx - r * 0.2, cy + r * 0.2, cx - r, cy);
    ctx.quadraticCurveTo(cx - r * 0.2, cy - r * 0.2, cx, cy - r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawCornerBrackets(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, color: string, len = 14): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'square';
    ctx.beginPath();
    // Top-left
    ctx.moveTo(x, y + len);
    ctx.lineTo(x, y);
    ctx.lineTo(x + len, y);
    // Top-right
    ctx.moveTo(x + w - len, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + len);
    // Bottom-left
    ctx.moveTo(x, y + h - len);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + len, y + h);
    // Bottom-right
    ctx.moveTo(x + w - len, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - len);
    ctx.stroke();
    ctx.restore();
}

function drawHudBackdrop(ctx: SKRSContext2D, height: number): void {
    ctx.save();
    ctx.fillStyle = A.bg;
    ctx.fillRect(0, 0, WIDTH, height);

    // Cosmic radial nebulae
    const glow1 = ctx.createRadialGradient(WIDTH * 0.84, 160, 12, WIDTH * 0.84, 160, 340);
    glow1.addColorStop(0, rgba(A.secondary, 0.35));
    glow1.addColorStop(0.5, rgba(A.primary, 0.12));
    glow1.addColorStop(1, rgba(A.bg, 0));
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, WIDTH, height);

    const glow2 = ctx.createRadialGradient(WIDTH * 0.15, height * 0.65, 10, WIDTH * 0.15, height * 0.65, 280);
    glow2.addColorStop(0, rgba(A.primary, 0.14));
    glow2.addColorStop(1, rgba(A.bg, 0));
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, WIDTH, height);

    // Faint HUD grid lines
    ctx.strokeStyle = rgba(A.secondary, 0.08);
    ctx.lineWidth = 1;
    for (let gx = 40; gx < WIDTH; gx += 40) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, height);
        ctx.stroke();
    }
    for (let gy = 40; gy < height; gy += 40) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(WIDTH, gy);
        ctx.stroke();
    }

    // Decorative stars (kept cleanly outside text pills)
    drawFourPointStar(ctx, 24, 24, 6, rgba(A.accent, 0.75));
    drawFourPointStar(ctx, WIDTH - 26, 26, 7, rgba(A.primary, 0.85));
    drawFourPointStar(ctx, WIDTH - 190, 56, 6, rgba(A.accent, 0.65));
    drawFourPointStar(ctx, 48, height - 42, 6, rgba(A.primary, 0.6));
    ctx.restore();
}

export const ReportThemeArcadeQuest: ReportThemeRenderer = {
    id: 'arcade-quest',
    async render(data: FundReportCardData, compact = false): Promise<Buffer> {
        const mascotSvg = getArcadeQuestMascotSvg(data.progressTier);
        const mascotImg = await loadSvgSprite(`arcade-mascot:${data.progressTier}`, mascotSvg);

        const headerH = data.description ? 114 : 88;
        const heroH = 260;
        const statsH = 98;
        const gap = 20;
        const twoCol = data.members.length > 16;
        const ROW_H = twoCol ? 74 : 56;
        const SECTION_H = 38;

        const sections = [
            { label: `UNPAID QUESTS · ยังไม่จ่าย (${data.unpaidCount})`, members: data.groups.unpaid, color: A.unpaid },
            { label: `IN PROGRESS · จ่ายบางส่วน (${data.partialCount})`, members: data.groups.partial, color: A.accent },
            { label: `QUEST CLEARED · จ่ายครบ (${data.paidCount})`, members: data.groups.paid, color: A.primary },
        ].filter((s) => s.members.length > 0);

        const rowCountOf = (list: FundReportMemberRow[]) => (twoCol ? Math.ceil(list.length / 2) : list.length);
        const totalRows = sections.reduce((sum, s) => sum + rowCountOf(s.members), 0);
        const rosterHeaderH = 56;
        const rosterH = data.members.length > 0 ? rosterHeaderH + sections.length * SECTION_H + totalRows * ROW_H + 16 : 112;
        const footerH = 56;
        const HEIGHT = PAD + headerH + heroH + gap + statsH + gap + rosterH + 20 + footerH;

        const { ctx, encode } = renderSurface(WIDTH, HEIGHT, compact);
        ctx.textBaseline = 'alphabetic';

        // 1. Cosmic HUD Background
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, WIDTH, HEIGHT, RADIUS);
        ctx.clip();
        drawHudBackdrop(ctx, HEIGHT);
        ctx.restore();

        // Neon frame
        ctx.strokeStyle = rgba(A.secondary, 0.75);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(2, 2, WIDTH - 4, HEIGHT - 4, RADIUS);
        ctx.stroke();
        drawCornerBrackets(ctx, 14, 14, WIDTH - 28, HEIGHT - 28, A.primary, 18);

        // 2. Quest Header
        let y = PAD;
        const innerW = WIDTH - PAD * 2;
        const statusColor = data.closed ? A.muted : data.isCompleted ? A.accent : A.primary;
        const statusW = drawPill(ctx, 0, y + 2, 32, 8, data.statusLabel, {
            font: hudFont(700, 13),
            bg: rgba(statusColor, 0.16),
            border: statusColor,
            borderWidth: 1.6,
            textColor: statusColor,
            padX: 16,
            alignRight: WIDTH - PAD,
        });

        drawPill(ctx, PAD, y + 2, 24, 6, 'MAIN QUEST  //  ภารกิจระดมทุน', {
            font: hudFont(700, 11),
            bg: rgba(A.secondary, 0.35),
            border: rgba(A.primary, 0.6),
            textColor: A.primary,
            padX: 10,
        });

        const titleMaxW = innerW - statusW - 20;
        const fittedTitle = fitText(ctx, (s) => hudFont(700, s), data.title, 30, 20, titleMaxW);
        ctx.textAlign = 'left';
        ctx.fillStyle = A.text;
        ctx.font = hudFont(700, fittedTitle.size);
        ctx.fillText(fittedTitle.text, PAD, y + 66);

        if (data.description) {
            ctx.fillStyle = A.muted;
            ctx.font = hudFont(400, 15);
            ctx.fillText(truncateText(ctx, data.description, innerW), PAD, y + 96);
        }
        y += headerH;

        // 3. Hero Quest Progress Panel + Chibi Guild Mascot Pedestal
        const mascotCardW = 266;
        const heroGap = 18;
        const questPanelW = innerW - mascotCardW - heroGap;

        // Left Quest Panel
        ctx.save();
        ctx.fillStyle = A.surface;
        ctx.strokeStyle = rgba(A.secondary, 0.85);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(PAD, y, questPanelW, heroH, 16);
        ctx.fill();
        ctx.stroke();

        // Neon top trim
        const topTrim = ctx.createLinearGradient(PAD, y, PAD + questPanelW, y);
        topTrim.addColorStop(0, A.primary);
        topTrim.addColorStop(0.6, A.secondary);
        topTrim.addColorStop(1, A.accent);
        ctx.fillStyle = topTrim;
        ctx.fillRect(PAD + 20, y, questPanelW - 40, 3);
        ctx.restore();

        const qx = PAD + 26;
        const qw = questPanelW - 52;

        ctx.textAlign = 'left';
        ctx.fillStyle = A.primary;
        ctx.font = hudFont(600, 13);
        ctx.fillText('QUEST PROGRESS  •  ความคืบหน้าภารกิจ', qx, y + 34);

        // Level / XP Badge top-right of left panel
        drawPill(ctx, 0, y + 16, 30, 8, `EXP ${data.progressPct}%`, {
            font: hudFont(700, 14),
            bg: rgba(A.accent, 0.18),
            border: A.accent,
            borderWidth: 1.4,
            textColor: A.accent,
            padX: 12,
            alignRight: qx + qw,
        });

        // Collected Glow Amount
        const collectedStr = plainAmount(data.collected);
        const fittedAmt = fitText(ctx, (s) => hudFont(700, s), collectedStr, 52, 34, qw - 180);
        ctx.save();
        ctx.shadowColor = rgba(A.primary, 0.45);
        ctx.shadowBlur = 14;
        ctx.fillStyle = A.primary;
        ctx.font = hudFont(700, fittedAmt.size);
        ctx.fillText(fittedAmt.text, qx, y + 96);
        ctx.restore();

        const amtW = ctx.measureText(fittedAmt.text).width;
        ctx.fillStyle = A.text;
        ctx.font = hudFont(600, 19);
        ctx.fillText('บาท', qx + amtW + 10, y + 92);
        const bahtW = ctx.measureText('บาท').width;

        ctx.fillStyle = A.muted;
        ctx.font = hudFont(500, 16);
        ctx.fillText(
            truncateText(ctx, `/ TARGET ${formatBaht(data.target)}`, Math.max(0, qw - amtW - bahtW - 24)),
            qx + amtW + bahtW + 22,
            y + 92,
        );

        // XP Segmented Bar
        const xpY = y + 124;
        const xpH = 24;
        const xpGrad = ctx.createLinearGradient(qx, xpY, qx + qw, xpY);
        xpGrad.addColorStop(0, A.secondary);
        xpGrad.addColorStop(0.65, A.primary);
        xpGrad.addColorStop(1, A.accent);
        drawProgressTrack(ctx, qx, xpY, qw, xpH, data.progressRatio, A.track, xpGrad, 12);

        // Border & segment notches on XP bar
        ctx.save();
        ctx.strokeStyle = rgba(A.primary, 0.65);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(qx, xpY, qw, xpH, 12);
        ctx.stroke();

        ctx.strokeStyle = rgba(A.bg, 0.6);
        ctx.lineWidth = 2;
        const segments = 16;
        for (let i = 1; i < segments; i++) {
            const sx = qx + (qw * i) / segments;
            ctx.beginPath();
            ctx.moveTo(sx, xpY + 2);
            ctx.lineTo(sx, xpY + xpH - 2);
            ctx.stroke();
        }
        // Star tip indicator on XP bar
        if (data.progressRatio > 0.04) {
            const tipX = Math.min(qx + qw - 12, Math.max(qx + 12, qx + qw * data.progressRatio));
            drawFourPointStar(ctx, tipX, xpY + xpH / 2, 10, '#FFFFFF');
        }
        ctx.restore();

        // Sub-status bar inside Quest Panel
        ctx.fillStyle = A.surfaceDeep;
        ctx.strokeStyle = rgba(A.secondary, 0.45);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(qx, y + 172, qw, 64, 12);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.fillStyle = A.muted;
        ctx.font = hudFont(500, 12);
        ctx.fillText('NEXT MILESTONE', qx + 16, y + 195);
        ctx.fillStyle = A.text;
        ctx.font = hudFont(600, 15);
        const milestoneText =
            data.remaining > 0 ? `ขาดอีก ${formatBaht(data.remaining)} เพื่อเคลียร์ภารกิจ` : 'สะสมครบ 100% ตามเป้าหมายแล้ว!';
        ctx.fillText(truncateText(ctx, milestoneText, qw - 190), qx + 16, y + 221);

        ctx.textAlign = 'right';
        ctx.fillStyle = A.accent;
        ctx.font = hudFont(700, 18);
        ctx.fillText(`${data.paidCount}/${data.memberCount} CLEARED`, qx + qw - 16, y + 214);

        // Right Chibi Guild Mascot Pedestal
        const mx = PAD + questPanelW + heroGap;
        ctx.save();
        ctx.fillStyle = A.surface;
        ctx.strokeStyle = rgba(A.primary, 0.7);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(mx, y, mascotCardW, heroH, 16);
        ctx.fill();
        ctx.stroke();
        drawCornerBrackets(ctx, mx + 8, y + 8, mascotCardW - 16, heroH - 16, A.accent, 10);
        ctx.restore();

        const spriteSize = 204;
        ctx.drawImage(mascotImg, mx + (mascotCardW - spriteSize) / 2, y + 8, spriteSize, spriteSize);

        const moodLabel =
            data.progressTier === 'complete'
                ? 'ภารกิจสำเร็จ! เยี่ยมมาก!'
                : data.progressTier === 'medium'
                  ? 'มาถูกทางแล้ว สู้ต่อ!'
                  : 'เริ่มต้นภารกิจ ช่วยกันนะ!';
        const moodColor = data.progressTier === 'complete' ? A.accent : data.progressTier === 'medium' ? A.primary : '#C4B5FD';
        ctx.font = hudFont(600, 12);
        const pillPadX = 18;
        const actualPillW = Math.ceil(ctx.measureText(moodLabel).width + pillPadX * 2);
        const moodPillX = mx + (mascotCardW - actualPillW) / 2;
        drawPill(ctx, moodPillX, y + heroH - 38, 26, 13, moodLabel, {
            font: hudFont(600, 12),
            bg: A.surfaceDeep,
            border: rgba(moodColor, 0.65),
            textColor: moodColor,
            padX: pillPadX,
        });
        drawFourPointStar(ctx, moodPillX + 10, y + heroH - 25, 4, moodColor);
        drawFourPointStar(ctx, moodPillX + actualPillW - 10, y + heroH - 25, 4, moodColor);

        y += heroH + gap;

        // 4. Compact Gaming HUD Stat Panels
        const hudStats = [
            {
                tag: 'REMAINING',
                label: 'คงค้างในภารกิจ',
                value: formatBaht(data.remaining),
                sub: data.outstandingMemberCount > 0 ? `รอชำระ ${data.outstandingMemberCount} คน` : 'ครบแล้ว 0 คน',
                accent: data.remaining > 0 ? A.accent : A.primary,
            },
            {
                tag: 'UNIT SHARE',
                label: data.dailyRate ? 'อัตรารายวัน' : 'ยอดต่อสมาชิก',
                value: data.rateLabel,
                sub: data.dailyRate ? `เฉลี่ย ${formatBaht(data.amountPerMember)}/คน` : 'กำหนดมาตรฐานต่อคน',
                accent: A.secondary,
            },
            {
                tag: 'PARTY STATUS',
                label: 'ผู้เล่นที่จ่ายครบ',
                value: `${data.paidCount} / ${data.memberCount} คน`,
                sub: `ยังไม่จ่าย ${data.unpaidCount} · บางส่วน ${data.partialCount}`,
                accent: A.primary,
            },
            {
                tag: 'DEADLINE',
                label: 'เวลาปิดภารกิจ',
                value: data.due.dateLabel,
                sub: data.due.remainingDaysLabel || (data.closed ? 'ภารกิจปิดแล้ว' : 'ไม่มีกำหนดเวลา'),
                accent: data.due.tone === 'unpaid' ? A.unpaid : data.due.tone === 'partial' ? A.accent : A.primary,
            },
        ];

        const statGap = 14;
        const statW = (innerW - statGap * 3) / 4;
        hudStats.forEach((st, idx) => {
            const sx = PAD + idx * (statW + statGap);
            ctx.save();
            ctx.fillStyle = A.surface;
            ctx.strokeStyle = rgba(st.accent, 0.6);
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.roundRect(sx, y, statW, statsH, 12);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = st.accent;
            ctx.fillRect(sx + 14, y, 42, 3);
            ctx.restore();

            ctx.textAlign = 'left';
            ctx.fillStyle = st.accent;
            ctx.font = hudFont(700, 10);
            ctx.fillText(st.tag, sx + 14, y + 20);

            ctx.fillStyle = A.muted;
            ctx.font = hudFont(500, 12);
            ctx.fillText(st.label, sx + 14, y + 36);

            ctx.fillStyle = A.text;
            ctx.font = hudFont(700, 19);
            ctx.fillText(truncateText(ctx, st.value, statW - 28), sx + 14, y + 64);

            ctx.fillStyle = A.muted;
            ctx.font = hudFont(400, 12);
            ctx.fillText(truncateText(ctx, st.sub, statW - 28), sx + 14, y + 85);
        });
        y += statsH + gap;

        // 5. Party Roster HUD
        ctx.save();
        ctx.fillStyle = rgba(A.surface, 0.72);
        ctx.strokeStyle = rgba(A.secondary, 0.6);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(PAD, y, innerW, rosterH, 16);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        const rx = PAD + 22;
        const rw = innerW - 44;

        ctx.textAlign = 'left';
        ctx.fillStyle = A.text;
        ctx.font = hudFont(700, 17);
        ctx.fillText('PARTY ROSTER  •  สถานะสมาชิกปาร์ตี้', rx, y + 35);

        let pillRight = rx + rw;
        for (const badge of [
            { text: `CLEAR ${data.paidCount}`, color: A.primary },
            { text: `PARTIAL ${data.partialCount}`, color: A.accent },
            { text: `UNPAID ${data.unpaidCount}`, color: A.unpaid },
        ]) {
            const pw = drawPill(ctx, 0, y + 17, 24, 6, badge.text, {
                font: hudFont(700, 11),
                bg: rgba(badge.color, 0.16),
                border: rgba(badge.color, 0.65),
                textColor: badge.color,
                padX: 10,
                alignRight: pillRight,
            });
            pillRight -= pw + 8;
        }

        if (data.members.length === 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = A.muted;
            ctx.font = hudFont(400, 15);
            ctx.fillText('ยังไม่มีสมาชิกเข้าร่วมภารกิจนี้', WIDTH / 2, y + 84);
        } else {
            let curY = y + rosterHeaderH;
            const colGap = 16;
            const colW = (rw - colGap) / 2;

            const drawSingleMember = (m: FundReportMemberRow, mx0: number, mw: number, top: number) => {
                const statusColor = m.status === 'paid' ? A.primary : m.status === 'partial' ? A.accent : A.unpaid;
                const statusText = m.status === 'paid' ? 'CLEARED' : m.status === 'partial' ? 'PARTIAL' : 'UNPAID';

                ctx.save();
                ctx.fillStyle = A.surfaceDeep;
                ctx.strokeStyle = rgba(statusColor, 0.45);
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.roundRect(mx0, top + 4, mw, ROW_H - 8, 10);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = statusColor;
                ctx.fillRect(mx0, top + 10, 4, ROW_H - 20);
                ctx.restore();

                const cy = top + ROW_H / 2;
                const badgeW = 84;
                const oweW = 114;
                const amtWCol = 128;
                const barW = 154;
                const nameW = mw - badgeW - oweW - amtWCol - barW - 76;

                ctx.textBaseline = 'middle';
                ctx.textAlign = 'left';
                ctx.fillStyle = A.text;
                ctx.font = hudFont(600, 15);
                ctx.fillText(truncateText(ctx, m.displayName, nameW), mx0 + 18, cy + 1);

                const barX = mx0 + 18 + nameW + 12;
                drawProgressTrack(ctx, barX, cy - 4, barW - 44, 8, m.progressRatio, A.track, statusColor, 4);
                ctx.textAlign = 'right';
                ctx.fillStyle = A.muted;
                ctx.font = hudFont(600, 12);
                ctx.fillText(`${m.progressPct}%`, barX + barW, cy + 1);

                const amtRight = barX + barW + 14 + amtWCol;
                ctx.fillStyle = A.text;
                ctx.font = hudFont(500, 13);
                ctx.fillText(truncateText(ctx, `${plainAmount(m.paid)} / ${plainAmount(m.target)} บ.`, amtWCol), amtRight, cy + 1);

                const oweRight = amtRight + 12 + oweW;
                ctx.fillStyle = m.remaining > 0 ? A.accent : A.primary;
                ctx.font = hudFont(700, 14);
                ctx.fillText(truncateText(ctx, m.remaining > 0 ? `ค้าง ${plainAmount(m.remaining)}` : 'ครบ 0 บ.', oweW), oweRight, cy + 1);

                drawPill(ctx, 0, cy - 12, 24, 6, statusText, {
                    font: hudFont(700, 11),
                    bg: rgba(statusColor, 0.16),
                    border: rgba(statusColor, 0.6),
                    textColor: statusColor,
                    padX: 10,
                    alignRight: mx0 + mw - 12,
                });
                ctx.textBaseline = 'alphabetic';
            };

            const drawCompactMember = (m: FundReportMemberRow, mx0: number, mw: number, top: number) => {
                const statusColor = m.status === 'paid' ? A.primary : m.status === 'partial' ? A.accent : A.unpaid;
                const statusText = m.status === 'paid' ? 'CLEAR' : m.status === 'partial' ? 'PARTIAL' : 'UNPAID';

                ctx.save();
                ctx.fillStyle = A.surfaceDeep;
                ctx.strokeStyle = rgba(statusColor, 0.48);
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.roundRect(mx0, top + 4, mw, ROW_H - 8, 10);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = statusColor;
                ctx.fillRect(mx0, top + 10, 4, ROW_H - 20);
                ctx.restore();

                const pillW = drawPill(ctx, 0, top + 12, 22, 6, statusText, {
                    font: hudFont(700, 10),
                    bg: rgba(statusColor, 0.16),
                    border: rgba(statusColor, 0.6),
                    textColor: statusColor,
                    padX: 8,
                    alignRight: mx0 + mw - 12,
                });

                ctx.textBaseline = 'alphabetic';
                ctx.textAlign = 'left';
                ctx.fillStyle = A.text;
                ctx.font = hudFont(600, 14);
                ctx.fillText(truncateText(ctx, m.displayName, mw - pillW - 34), mx0 + 16, top + 28);

                const barX = mx0 + 16;
                const barW = 90;
                drawProgressTrack(ctx, barX, top + 48, barW, 6, m.progressRatio, A.track, statusColor, 3);

                ctx.fillStyle = A.muted;
                ctx.font = hudFont(500, 12);
                ctx.fillText(`${plainAmount(m.paid)}/${plainAmount(m.target)} บ. (${m.progressPct}%)`, barX + barW + 10, top + 55);

                ctx.textAlign = 'right';
                ctx.fillStyle = m.remaining > 0 ? A.accent : A.primary;
                ctx.font = hudFont(700, 12);
                ctx.fillText(m.remaining > 0 ? `ค้าง ${plainAmount(m.remaining)}` : 'ครบ', mx0 + mw - 12, top + 55);
            };

            for (const section of sections) {
                ctx.save();
                ctx.fillStyle = section.color;
                ctx.beginPath();
                ctx.moveTo(rx, curY + 13);
                ctx.lineTo(rx + 8, curY + 18);
                ctx.lineTo(rx, curY + 23);
                ctx.closePath();
                ctx.fill();
                ctx.restore();

                ctx.textAlign = 'left';
                ctx.fillStyle = section.color;
                ctx.font = hudFont(700, 13);
                ctx.fillText(section.label, rx + 14, curY + 23);
                curY += SECTION_H;

                if (twoCol) {
                    for (let i = 0; i < section.members.length; i += 2) {
                        const left = section.members[i];
                        const right = section.members[i + 1];
                        if (left) drawCompactMember(left, rx, colW, curY);
                        if (right) drawCompactMember(right, rx + colW + colGap, colW, curY);
                        curY += ROW_H;
                    }
                } else {
                    for (const m of section.members) {
                        drawSingleMember(m, rx, rw, curY);
                        curY += ROW_H;
                    }
                }
            }
        }

        // 6. Footer
        ctx.strokeStyle = rgba(A.secondary, 0.45);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, HEIGHT - footerH);
        ctx.lineTo(WIDTH - PAD, HEIGHT - footerH);
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.fillStyle = A.muted;
        ctx.font = hudFont(500, 12);
        ctx.fillText('NOTSTACK ARCADE QUEST HUD  •  ระบบเก็บเงินตามเป้า', PAD, HEIGHT - 22);
        ctx.textAlign = 'right';
        ctx.fillStyle = A.primary;
        ctx.fillText(`SYNC ${data.generatedAtLabel}`, WIDTH - PAD, HEIGHT - 22);

        return encode();
    },
};
