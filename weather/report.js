// ==========================================
// 📰 REPORT — ประกอบข้อความรายงานสภาพอากาศ: ข้อความธรรมดา + embed (ช่องข้อมูลแถวละ 3) + รูปกราฟ
// ใช้ทั้งตอนส่งจริง ส่งทดสอบ และตัวอย่างใน Dashboard
// ==========================================
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { FIELDS, fillPlaceholders } = require('./options');
const fmt = require('./format');
const { renderForecastChart } = require('./chart');

const CHART_FILE = 'weather-chart.png';
const FIELD_LABELS = new Map(FIELDS.map((field) => [field.key, field.label]));
const NO_DATA = 'ไม่มีข้อมูล';

// สรุป 24 ชั่วโมงข้างหน้าจากพยากรณ์ทุก 3 ชม. (ใช้ทั้งช่องข้อมูลและตัวแปรในข้อความ)
function summarize({ current, forecast }) {
    const next24 = forecast.filter((slot) => slot.dt > current.dt && slot.dt <= current.dt + 86400);
    const temps = [current.temp, ...next24.map((slot) => slot.temp)];
    return {
        max: Math.max(...temps),
        min: Math.min(...temps),
        pop: next24.length ? Math.max(...next24.map((slot) => slot.pop)) : null,
        rainMm: next24.reduce((sum, slot) => sum + slot.rain, 0),
    };
}

// ค่าในแต่ละช่อง — บรรทัดแรกคือค่าหลัก บรรทัดที่สอง (ถ้ามี) คือรายละเอียด
const FIELD_VALUES = {
    temp: ({ current }) => fmt.formatTemp(current.temp),
    feelsLike: ({ current }) => fmt.formatTemp(current.feelsLike),
    range: (w, s) => `${Math.round(s.max)}° / ${Math.round(s.min)}°`,
    rain: (w, s) => {
        if (s.pop == null) return NO_DATA;
        const chance = `${Math.round(s.pop * 100)}%`;
        return s.rainMm >= 0.1 ? `${chance}\nฝนรวม ~${fmt.round1(s.rainMm)} มม.` : chance;
    },
    humidity: ({ current }) => `${current.humidity}%`,
    wind: ({ current }) => {
        const kmh = Math.round(current.windSpeed * 3.6);
        if (kmh === 0) return 'ลมสงบ';
        const direction = fmt.windDirection(current.windDeg);
        return direction ? `${kmh} กม./ชม.\nทิศ${direction}` : `${kmh} กม./ชม.`;
    },
    pm25: ({ air }) => {
        if (air?.pm25 == null) return NO_DATA;
        const level = fmt.pm25Level(air.pm25);
        return `${fmt.round1(air.pm25)} µg/m³\n${level.emoji} ${level.label}`;
    },
    sun: ({ current, timezone }) => (current.sunrise && current.sunset
        ? `${fmt.formatTime(current.sunrise, timezone)} / ${fmt.formatTime(current.sunset, timezone)}`
        : NO_DATA),
    clouds: ({ current }) => (current.clouds == null ? NO_DATA : `${current.clouds}%`),
    visibility: ({ current }) => {
        if (current.visibility == null) return NO_DATA;
        // API ให้ค่าได้สูงสุด 10 กม.
        return current.visibility >= 10000 ? '10 กม. ขึ้นไป' : `${fmt.round1(current.visibility / 1000)} กม.`;
    },
    pressure: ({ current }) => `${current.pressure} hPa`,
};

function buildVars(options, weather, summary) {
    const { current, timezone } = weather;
    return {
        location: options.location.name,
        date: fmt.formatFullDate(current.dt, timezone),
        time: fmt.formatTime(current.dt, timezone),
        icon: fmt.conditionEmoji(current.icon),
        condition: current.condition,
        temp: fmt.formatTemp(current.temp),
        max: `${Math.round(summary.max)}°C`,
        min: `${Math.round(summary.min)}°C`,
        rain: summary.pop == null ? '-' : `${Math.round(summary.pop * 100)}%`,
    };
}

// embed ที่ไม่มีอะไรเลย Discord ไม่ยอมส่ง — ใช้เช็คก่อนบันทึก/ส่งทดสอบ
const hasEmbedBody = ({ embed, chart }) =>
    Boolean(embed.title.trim() || embed.description.trim() || embed.fields.length || chart.enabled);

/**
 * @param {{content: string, options: object}} settings options ต้องผ่าน normalizeOptions มาแล้ว
 * @param {object} weather ผลจาก fetchWeather
 * @returns {Promise<{content: string, embed: EmbedBuilder, image: Buffer|null}>}
 */
async function buildWeatherReport({ content, options }, weather) {
    const summary = summarize(weather);
    const vars = buildVars(options, weather, summary);
    const { embed: style, chart } = options;

    const embed = new EmbedBuilder().setColor(style.color);
    const title = fillPlaceholders(style.title, vars).trim().slice(0, 256);
    if (title) {
        embed.setTitle(title);
        if (style.link && weather.cityId) embed.setURL(`https://openweathermap.org/city/${weather.cityId}`);
    }
    const description = fillPlaceholders(style.description, vars).trim().slice(0, 4096);
    if (description) embed.setDescription(description);
    if (style.fields.length) {
        embed.addFields(style.fields.map((key) => ({
            name: FIELD_LABELS.get(key),
            value: FIELD_VALUES[key](weather, summary),
            inline: true,
        })));
    }
    if (style.thumbnail && weather.current.icon) {
        embed.setThumbnail(`https://openweathermap.org/img/wn/${weather.current.icon}@2x.png`);
    }
    const footer = fillPlaceholders(style.footer, vars).trim().slice(0, 2048);
    if (footer) embed.setFooter({ text: footer });
    if (style.timestamp) embed.setTimestamp(weather.fetchedAt);

    const image = chart.enabled ? await renderForecastChart(weather, chart) : null;
    if (image) embed.setImage(`attachment://${CHART_FILE}`);

    return { content: fillPlaceholders(content, vars).trim().slice(0, 2000), embed, image };
}

// แท็กได้เฉพาะยศที่พิมพ์ไว้ในข้อความเอง (<@&id>) — ไม่ให้ @everyone / @here ทำงาน
function toMessagePayload({ content, embed, image }) {
    return {
        content: content || undefined,
        embeds: [embed],
        files: image ? [new AttachmentBuilder(image, { name: CHART_FILE })] : [],
        allowedMentions: { parse: [], roles: [...content.matchAll(/<@&(\d+)>/g)].map((m) => m[1]) },
    };
}

module.exports = { buildWeatherReport, toMessagePayload, hasEmbedBody };
