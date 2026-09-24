// ==========================================
// 📈 CHART — วาดกราฟพยากรณ์อากาศเป็น PNG ด้วย @napi-rs/canvas (แนบเป็นรูปใน embed)
// แผงบน: เส้นอุณหภูมิ + ตัวเลขทุกจุด · แผงล่าง: แท่งโอกาสฝนตก · แถวล่างสุด: emoji สภาพอากาศ + เวลา
// ใช้ฟังก์ชันเดียวกันทั้งตอนส่งจริงและตอนดูตัวอย่างใน Dashboard ภาพที่เห็นจึงตรงกับของจริงเสมอ
// ==========================================
const { createCanvas } = require('@napi-rs/canvas');
// ฟอนต์ไทย + emoji ชุดเดียวกับการ์ดต้อนรับ (require แล้วฟอนต์ถูกลงทะเบียนให้เอง)
const { fontString } = require('../welcome/fonts');
const { conditionEmoji, formatTime, formatShortDay, localDayNumber } = require('./format');

const WIDTH = 1200;
const HEIGHT = 560;
const LEFT = 84;
const RIGHT = WIDTH - 44;
// เว้นขอบซ้าย-ขวาในแผง ไม่ให้ตัวเลข/emoji ของจุดแรกและจุดสุดท้ายล้นออกนอกกรอบ
const INSET = 36;
const TEMP_TOP = 118;
const RAIN_TOP = 356;
const RAIN_BOTTOM = 446;
const EMOJI_Y = 484;
const TIME_Y = 528;

const THEMES = {
    light: { bg: '#FFFFFF', text: '#1F2937', muted: '#6B7280', grid: '#E5E7EB', rain: '#3B82F6', rainText: '#2563EB', divider: '#CBD5E1' },
    dark: { bg: '#232428', text: '#F2F3F5', muted: '#B5BAC1', grid: 'rgba(255, 255, 255, 0.08)', rain: '#60A5FA', rainText: '#93C5FD', divider: 'rgba(255, 255, 255, 0.22)' },
};

const font = (weight, size) => fontString('kanit', weight, size);

function rgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ระยะห่างเส้นตารางที่อ่านง่าย (1, 2, 5, 10 องศา)
function niceStep(raw) {
    return [1, 2, 5, 10, 20].find((step) => step >= raw) || 20;
}

// จุด "ตอนนี้" + พยากรณ์ทุก 3 ชม. ภายในช่วงเวลาที่เลือก
function chartPoints(weather, hours) {
    const { current, forecast } = weather;
    const end = current.dt + hours * 3600;
    const points = [{ dt: current.dt, temp: current.temp, pop: null, icon: current.icon }];
    for (const slot of forecast) {
        // ช่วงที่ห่างจากตอนนี้ไม่ถึงชั่วโมงครึ่ง แทบซ้ำกับจุด "ตอนนี้" และจะวาดทับกัน — ข้าม
        if (slot.dt <= current.dt + 5400) continue;
        if (slot.dt > end) break;
        points.push({ dt: slot.dt, temp: slot.temp, pop: slot.pop, icon: slot.icon });
    }
    return points;
}

// เส้นโค้งแบบ monotone (Fritsch–Carlson) — โค้งสวยแต่ไม่พุ่งเกินค่าจริงระหว่างจุด
function traceMonotone(ctx, pts) {
    const n = pts.length;
    ctx.moveTo(pts[0].x, pts[0].y);
    if (n === 2) {
        ctx.lineTo(pts[1].x, pts[1].y);
        return;
    }
    const dx = [];
    const slope = [];
    for (let i = 0; i < n - 1; i++) {
        dx[i] = pts[i + 1].x - pts[i].x;
        slope[i] = (pts[i + 1].y - pts[i].y) / dx[i];
    }
    const t = [slope[0]];
    for (let i = 1; i < n - 1; i++) t[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
    t[n - 1] = slope[n - 2];
    for (let i = 0; i < n - 1; i++) {
        if (slope[i] === 0) {
            t[i] = 0;
            t[i + 1] = 0;
            continue;
        }
        const a = t[i] / slope[i];
        const b = t[i + 1] / slope[i];
        const s = a * a + b * b;
        if (s > 9) {
            const k = 3 / Math.sqrt(s);
            t[i] = k * a * slope[i];
            t[i + 1] = k * b * slope[i];
        }
    }
    for (let i = 0; i < n - 1; i++) {
        const h = dx[i] / 3;
        ctx.bezierCurveTo(pts[i].x + h, pts[i].y + t[i] * h, pts[i + 1].x - h, pts[i + 1].y - t[i + 1] * h, pts[i + 1].x, pts[i + 1].y);
    }
}

function drawHeader(ctx, theme, chart, hours) {
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.text;
    ctx.font = font(700, 30);
    ctx.fillText(`พยากรณ์ ${hours} ชั่วโมงข้างหน้า`, 40, 54);

    // คำอธิบายสัญลักษณ์ ชิดขวา (วาดจากขวาไปซ้าย)
    ctx.font = font(400, 20);
    ctx.textAlign = 'right';
    let x = RIGHT;
    const item = (label, drawSwatch) => {
        ctx.fillStyle = theme.muted;
        ctx.fillText(label, x, 52);
        x -= ctx.measureText(label).width + 12;
        drawSwatch(x);
        x -= 40;
    };
    if (chart.showRain) {
        item('โอกาสฝนตก', (right) => {
            ctx.fillStyle = rgba(theme.rain, 0.55);
            ctx.beginPath();
            ctx.roundRect(right - 16, 34, 16, 22, [4, 4, 0, 0]);
            ctx.fill();
        });
    }
    item('อุณหภูมิ (°C)', (right) => {
        ctx.strokeStyle = chart.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(right - 30, 45);
        ctx.lineTo(right, 45);
        ctx.stroke();
        ctx.fillStyle = chart.color;
        ctx.beginPath();
        ctx.arc(right - 15, 45, 5, 0, Math.PI * 2);
        ctx.fill();
    });
}

/**
 * @param {object} weather ผลจาก fetchWeather
 * @param {object} chart options.chart ที่ผ่าน normalize แล้ว
 * @returns {Promise<Buffer|null>} PNG หรือ null ถ้าข้อมูลพยากรณ์ไม่พอจะวาดกราฟ
 */
async function renderForecastChart(weather, chart) {
    const points = chartPoints(weather, chart.hours);
    if (points.length < 2) return null;

    const theme = THEMES[chart.theme] || THEMES.light;
    const offset = weather.timezone;
    const tempBottom = chart.showRain ? RAIN_TOP - 26 : RAIN_BOTTOM;

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    drawHeader(ctx, theme, chart, chart.hours);

    // แกนเวลา
    const t0 = points[0].dt;
    const t1 = points[points.length - 1].dt;
    const xOf = (dt) => LEFT + INSET + ((dt - t0) / (t1 - t0)) * (RIGHT - LEFT - INSET * 2);
    const spacing = (RIGHT - LEFT - INSET * 2) / (points.length - 1);

    // แกนอุณหภูมิ — เผื่อที่ด้านบนให้ตัวเลขเหนือจุด
    const temps = points.map((p) => p.temp);
    let lo = Math.floor(Math.min(...temps)) - 1;
    let hi = Math.ceil(Math.max(...temps)) + 1;
    if (hi - lo < 6) {
        const mid = (hi + lo) / 2;
        lo = Math.floor(mid - 3);
        hi = Math.ceil(mid + 3);
    }
    const step = niceStep((hi - lo) / 4);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const plotTop = TEMP_TOP + 34;
    const yOf = (temp) => tempBottom - ((temp - lo) / (hi - lo)) * (tempBottom - plotTop);

    // เส้นตาราง + ตัวเลขแกนซ้าย
    ctx.font = font(400, 18);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;
    for (let v = lo; v <= hi; v += step) {
        const y = Math.round(yOf(v)) + 0.5;
        ctx.strokeStyle = theme.grid;
        ctx.beginPath();
        ctx.moveTo(LEFT, y);
        ctx.lineTo(RIGHT, y);
        ctx.stroke();
        ctx.fillStyle = theme.muted;
        ctx.fillText(`${v}°`, LEFT - 14, y);
    }

    // เส้นแบ่งวัน (ตอนเที่ยงคืนของสถานที่นั้น) + ชื่อวันเหนือกราฟ
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(400, 18);
    ctx.fillStyle = theme.muted;
    ctx.fillText(formatShortDay(points[0].dt, offset), LEFT, TEMP_TOP - 12);
    for (let i = 1; i < points.length; i++) {
        const day = localDayNumber(points[i].dt, offset);
        if (day === localDayNumber(points[i - 1].dt, offset)) continue;
        const midnight = day * 86400 - offset;
        const x = Math.round(xOf(midnight)) + 0.5;
        ctx.save();
        ctx.strokeStyle = theme.divider;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(x, TEMP_TOP);
        ctx.lineTo(x, chart.showRain ? RAIN_BOTTOM : tempBottom);
        ctx.stroke();
        ctx.restore();
        // ชื่อวันอยู่ขวาของเส้น — ถ้าล้นขอบรูปให้ย้ายไปไว้ซ้ายของเส้นแทน
        const label = formatShortDay(midnight, offset);
        const overflow = x + 8 + ctx.measureText(label).width > WIDTH - 12;
        ctx.textAlign = overflow ? 'right' : 'left';
        ctx.fillStyle = theme.muted;
        ctx.fillText(label, overflow ? x - 8 : x + 8, TEMP_TOP - 12);
    }

    // แท่งโอกาสฝนตก
    if (chart.showRain) {
        ctx.font = font(400, 16);
        ctx.fillStyle = theme.muted;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('ฝน', LEFT - 14, RAIN_BOTTOM - 20);

        ctx.strokeStyle = theme.grid;
        ctx.beginPath();
        ctx.moveTo(LEFT, RAIN_BOTTOM + 0.5);
        ctx.lineTo(RIGHT, RAIN_BOTTOM + 0.5);
        ctx.stroke();

        const barWidth = Math.min(46, spacing * 0.56);
        const maxBar = RAIN_BOTTOM - RAIN_TOP - 24;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        for (const p of points) {
            if (p.pop == null || p.pop < 0.05) continue;
            const x = xOf(p.dt);
            const h = Math.max(4, p.pop * maxBar);
            ctx.fillStyle = rgba(theme.rain, 0.25 + p.pop * 0.45);
            ctx.beginPath();
            ctx.roundRect(x - barWidth / 2, RAIN_BOTTOM - h, barWidth, h, [6, 6, 0, 0]);
            ctx.fill();
            ctx.fillStyle = theme.rainText;
            ctx.font = font(700, 17);
            ctx.fillText(`${Math.round(p.pop * 100)}%`, x, RAIN_BOTTOM - h - 6);
        }
    }

    // เส้นอุณหภูมิ + พื้นไล่สีใต้เส้น
    const pts = points.map((p) => ({ x: xOf(p.dt), y: yOf(p.temp) }));
    const gradient = ctx.createLinearGradient(0, plotTop, 0, tempBottom);
    gradient.addColorStop(0, rgba(chart.color, 0.32));
    gradient.addColorStop(1, rgba(chart.color, 0.02));
    ctx.beginPath();
    traceMonotone(ctx, pts);
    ctx.lineTo(pts[pts.length - 1].x, tempBottom);
    ctx.lineTo(pts[0].x, tempBottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    traceMonotone(ctx, pts);
    ctx.strokeStyle = chart.color;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // ตัวเลข/emoji/เวลา ที่อยู่ชิดจุดก่อนหน้าเกินไป (เช่นกราฟ 48 ชม.) ข้ามไป ไม่ให้ตัวหนังสือชนกัน
    const spaced = (minGap) => {
        let last = -Infinity;
        return (x) => {
            if (x - last < minGap) return false;
            last = x;
            return true;
        };
    };
    const tempLabelFits = spaced(44);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    points.forEach((p, i) => {
        const { x, y } = pts[i];
        ctx.beginPath();
        ctx.arc(x, y, i === 0 ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = chart.color;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = theme.bg;
        ctx.stroke();

        if (!tempLabelFits(x)) return;
        ctx.fillStyle = i === 0 ? chart.color : theme.text;
        ctx.font = font(700, 22);
        ctx.fillText(`${Math.round(p.temp)}°`, x, y - 16);
    });

    // emoji สภาพอากาศ + เวลา
    const emojiFits = spaced(36);
    const timeFits = spaced(66);
    points.forEach((p, i) => {
        const x = xOf(p.dt);
        ctx.textAlign = 'center';
        if (emojiFits(x)) {
            ctx.textBaseline = 'middle';
            ctx.font = font(400, 30);
            ctx.fillText(conditionEmoji(p.icon), x, EMOJI_Y);
        }

        if (!timeFits(x)) return;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = i === 0 ? theme.text : theme.muted;
        ctx.font = font(i === 0 ? 700 : 400, 19);
        ctx.fillText(i === 0 ? 'ตอนนี้' : formatTime(p.dt, offset), x, TIME_Y);
    });

    return canvas.encode('png');
}

module.exports = { renderForecastChart };
