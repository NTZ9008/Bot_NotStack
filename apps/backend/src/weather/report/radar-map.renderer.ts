import crypto from 'node:crypto';
import { Logger } from '@nestjs/common';
import { createCanvas, loadImage, type Canvas, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import type { WeatherLocation, WeatherOptions, WeatherRadarSource } from '@notstack/shared';
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
// ฟอนต์ไทย + emoji ชุดเดียวกับการ์ดต้อนรับ
import { fontString } from '../../common/canvas/fonts';
import { APP_VERSION } from '../../config/paths';
import type { ReportFile } from '../interfaces/weather-data.interface';
import { formatTime } from './weather-format';

// ==========================================
// 🛰️ RADAR — แผนที่เรดาร์ฝนรอบสถานที่ เป็น PNG (ภาพล่าสุด) หรือ GIF เคลื่อนไหว (ย้อนหลัง 1 ชม.)
// - เรดาร์มี 2 แหล่งให้เลือก (options.radar.source) — ทั้งคู่ไม่มีภาพพยากรณ์ล่วงหน้า ใช้แค่ภาพที่วัดได้จริง
//   · RainViewer (ฟรี ไม่ต้องใช้ key) ทั่วโลก มีภาพย้อนหลังราว 2 ชม. ทุก 10 นาที
//     ซูมได้สูงสุดระดับ 7 (ระดับ 8 ขึ้นไปได้ภาพ "Zoom Level Not Supported") จึงดึงไทล์ระดับ 7 ขนาด 512px มาขยายลงแผนที่
//   · กรมอุตุนิยมวิทยา (ระบบ RADARGIS) รวมเรดาร์ทุกสถานีในไทยเป็นภาพ dBZ โปร่งใสภาพเดียวทั้งประเทศ ทุก 15 นาที
//     พร้อมพิกัดขอบภาพ — ภาพวางแบบ Web Mercator (แบบเดียวกับ Leaflet imageOverlay ในหน้าเว็บของกรมฯ) จึงซ้อนแผนที่ได้ตรง
//     เซิร์ฟเวอร์เปิดแค่ HTTP (ใบรับรอง HTTPS ไม่ตรงชื่อโดเมน) และครอบคลุมแค่ไทย + ประเทศใกล้เคียง
// - แผนที่พื้นหลัง: OpenStreetMap ทำเป็นขาวดำให้สีฝนเด่น — นโยบายของ OSM ต้องระบุ User-Agent ของแอปและแสดงเครดิตบนภาพ
//   แผนที่ของสถานที่เดิมไม่เปลี่ยน จึงเก็บภาพที่ต่อไทล์แล้วไว้ 1 วัน ไม่โหลดไทล์ซ้ำทุกครั้ง
// ==========================================
type RadarOptions = WeatherOptions['radar'];

const logger = new Logger('Weather');

const RAINVIEWER_MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const TMD_BASE_URL = 'http://www2.radargis.tmd.go.th';
const USER_AGENT = `Bot_NotStack/${APP_VERSION} (Discord weather report; +https://github.com/NTZ9008/Bot_NotStack)`;
// RainViewer เป็น free API ไม่มี SLA — ช่วง peak อาจช้ากว่า 8 วินาที จึงเพิ่ม timeout ให้กว้างขึ้น
const TIMEOUT_MS = 12000;
// จำนวนครั้งที่ retry สูงสุด (เฉพาะ network/timeout error — HTTP 4xx/5xx ไม่ retry)
const MAX_RETRIES = 2;
// delay เริ่มต้น (ms) ก่อน retry ครั้งแรก, ครั้งถัดไปคูณ 2 (exponential backoff)
const RETRY_BASE_MS = 1000;

const TILE = 256;
const RADAR_ZOOM = 7;
const RADAR_TILE = 512;
// ชุดสี 2 = "Universal Blue", 1_1 = เกลี่ยขอบให้เนียน + แสดงหิมะ
const RADAR_STYLE = '2/1_1';

const WIDTH = 1200;
const HEIGHT = 675;
// GIF ย่อลงเล็กน้อย ให้ไฟล์ไม่ใหญ่เกินไป (Discord แสดงรูปใน embed กว้างไม่ถึง 520px อยู่แล้ว)
const GIF_WIDTH = 960;
const GIF_HEIGHT = 540;
// ภาพเคลื่อนไหว = ภาพล่าสุด + ภาพย้อนหลังที่อยู่ใน 1 ชม. (RainViewer ทุก 10 นาที = 7 ภาพ, กรมอุตุฯ ทุก 15 นาที = 5 ภาพ)
const ANIMATION_SPAN_S = 60 * 60;
// ภาพล่าสุดเก่ากว่านี้ = ระบบต้นทางค้าง ไม่เอามาหลอกว่าเป็นฝนตอนนี้
const STALE_S = 3 * 60 * 60;
const FRAME_DELAY_MS = 500;
const LAST_FRAME_DELAY_MS = 2000;

const FRAMES_CACHE_MS = 2 * 60 * 1000;
const BASEMAP_CACHE_MS = 24 * 60 * 60 * 1000;

const THEMES = {
    light: { filter: 'grayscale(1) brightness(1.05) contrast(0.85)', bg: '#E5E7EB', text: '#1F2937', muted: 'rgba(0, 0, 0, 0.62)', panel: 'rgba(255, 255, 255, 0.9)', halo: '#FFFFFF', track: 'rgba(0, 0, 0, 0.15)' },
    dark: { filter: 'grayscale(1) invert(1) brightness(0.85) contrast(0.9)', bg: '#1E1F22', text: '#F2F3F5', muted: 'rgba(255, 255, 255, 0.72)', panel: 'rgba(20, 21, 24, 0.84)', halo: '#111111', track: 'rgba(255, 255, 255, 0.2)' },
};
type Theme = (typeof THEMES)['light'];

interface RadarFrame {
    // เวลาของภาพ (unix วินาที)
    time: number;
    // RainViewer: path ของชุดไทล์ / กรมอุตุฯ: URL ของภาพทั้งประเทศ
    url: string;
    // กรมอุตุฯ: ขอบภาพ [[ใต้, ตะวันตก], [เหนือ, ตะวันออก]] (องศา)
    bounds?: [[number, number], [number, number]];
}
interface View {
    zoom: number;
    left: number;
    top: number;
}
interface PlacedTile {
    x: number;
    y: number;
    dx: number;
    dy: number;
}
interface CacheEntry<T> {
    at: number;
    promise: Promise<T>;
}

const font = (weight: number, size: number) => fontString('kanit', weight, size);

// Map ที่จำลำดับการใช้ — ใส่เกินจำนวนแล้วทิ้งตัวที่ไม่ได้ใช้นานที่สุด
function lru<T>(max: number) {
    const map = new Map<string, T>();
    return {
        get(key: string): T | undefined {
            if (!map.has(key)) return undefined;
            const value = map.get(key)!;
            map.delete(key);
            map.set(key, value);
            return value;
        },
        set(key: string, value: T): void {
            map.delete(key);
            map.set(key, value);
            if (map.size > max) map.delete(map.keys().next().value!);
        },
        delete: (key: string) => map.delete(key),
    };
}
type Lru<T> = ReturnType<typeof lru<CacheEntry<T>>>;

// เก็บ promise ไว้เลย — คำขอที่มาพร้อมกันรอผลเดียวกัน, ถ้าล้มก็ลบทิ้งให้คำขอถัดไปลองใหม่
function cached<T>(cache: Lru<T>, key: string, maxAgeMs: number, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < maxAgeMs) return hit.promise;
    const promise = load();
    cache.set(key, { at: Date.now(), promise });
    promise.catch(() => {
        if (cache.get(key)?.promise === promise) cache.delete(key);
    });
    return promise;
}

async function fetchBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

// retry เฉพาะ network/timeout error — HTTP error ที่ได้ response มาแล้ว (เช่น 404, 500) ไม่ retry
const isRetryable = (err: unknown) => err instanceof TypeError || (err as Error).name === 'TimeoutError';

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Buffer> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await fetchBuffer(url);
        } catch (err) {
            if (attempt >= retries || !isRetryable(err)) throw err;
            // exponential backoff + jitter เล็กน้อย กันหลาย request ยิงพร้อมกัน
            const delay = RETRY_BASE_MS * 2 ** attempt + Math.random() * 200;
            logger.warn(`fetch "${url}" ล้มเหลว (${(err as Error).name}) — retry ${attempt + 1}/${retries} ใน ${Math.round(delay)}ms`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}

const loadRemoteImage = async (url: string) => loadImage(await fetchWithRetry(url));

const reason = (err: unknown) => ((err as Error).name === 'TimeoutError' ? 'หมดเวลา' : (err as Error).message);

async function fetchJson<T>(url: string, name: string): Promise<T> {
    try {
        return JSON.parse((await fetchWithRetry(url)).toString('utf8')) as T;
    } catch (err) {
        throw new Error(`ติดต่อ ${name} ไม่ได้ (${reason(err)})`);
    }
}

// ==========================================
// ตำแหน่งบนแผนที่ (Web Mercator) — พิกัดเป็นพิกเซลของแผนที่ทั้งโลกที่ซูมนั้น (size = ความกว้างของโลกเป็นพิกเซล)
// ==========================================
const worldX = (lon: number, size: number) => ((lon + 180) / 360) * size;
const worldY = (lat: number, size: number) => ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * size;

function viewport(lat: number, lon: number, zoom: number): View {
    const size = TILE * 2 ** zoom;
    return { zoom, left: Math.round(worldX(lon, size) - WIDTH / 2), top: Math.round(worldY(lat, size) - HEIGHT / 2) };
}

// ไทล์ทั้งหมดที่ทับกรอบภาพ — span = ขนาดไทล์เป็นพิกเซลของแผนที่ที่ซูม view.zoom, count = จำนวนไทล์ต่อแถวของโลก
function coveringTiles(view: View, span: number, count: number): PlacedTile[] {
    const tiles: PlacedTile[] = [];
    for (let tx = Math.floor(view.left / span); tx <= Math.floor((view.left + WIDTH - 1) / span); tx++) {
        for (let ty = Math.floor(view.top / span); ty <= Math.floor((view.top + HEIGHT - 1) / span); ty++) {
            if (ty < 0 || ty >= count) continue;
            tiles.push({ x: ((tx % count) + count) % count, y: ty, dx: tx * span - view.left, dy: ty * span - view.top });
        }
    }
    return tiles;
}

// ==========================================
// แผนที่พื้นหลัง (ขาวดำ) — ไทล์ไหนโหลดไม่ได้ก็ปล่อยเป็นสีพื้น ไม่ทำให้ทั้งภาพพัง
// ==========================================
const basemaps = lru<CacheEntry<Canvas>>(8);

function basemap(view: View, themeName: keyof typeof THEMES): Promise<Canvas> {
    const key = `${view.zoom}:${view.left}:${view.top}:${themeName}`;
    return cached(basemaps, key, BASEMAP_CACHE_MS, async () => {
        const theme = THEMES[themeName];
        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.filter = theme.filter;

        const tiles = coveringTiles(view, TILE, 2 ** view.zoom);
        let loaded = 0;
        await Promise.all(
            tiles.map(async (t) => {
                const image = await loadRemoteImage(`https://tile.openstreetmap.org/${view.zoom}/${t.x}/${t.y}.png`).catch(() => null);
                if (!image) return;
                ctx.drawImage(image, t.dx, t.dy, TILE, TILE);
                loaded++;
            }),
        );
        ctx.filter = 'none';
        if (!loaded) throw new Error('โหลดแผนที่ OpenStreetMap ไม่ได้');
        if (loaded < tiles.length) logger.warn(`โหลดไทล์แผนที่ได้ ${loaded}/${tiles.length}`);
        return canvas;
    });
}

// ==========================================
// แหล่งภาพเรดาร์
// - frames() = รายการภาพเก่า → ใหม่ (อัปเดตทุก 10-15 นาที เก็บรายการไว้ 2 นาที)
// - layer() = ชั้นเรดาร์ของภาพ 1 ภาพ ขนาดเท่าภาพแผนที่ — ถ้าโหลดไม่ขึ้นเลยให้ล้ม (ภาพที่ไม่มีฝนเพราะโหลดไม่ขึ้นจะหลอกคนดู)
// ==========================================
interface RadarSource {
    name: string;
    credit: string;
    // ไล่สีคร่าวๆ ของแถบสีความแรงฝน (ฝนเบา → ฝนหนัก/พายุ)
    legend: string[];
    opacity: number;
    frames(): Promise<RadarFrame[]>;
    layer(view: View, frame: RadarFrame): Promise<Canvas>;
}

// ไฟล์ของแต่ละภาพไม่เปลี่ยนแล้ว เก็บตาม URL ได้เลย
const radarTiles = lru<CacheEntry<Image>>(96);
const loadRadarTile = (url: string) => cached(radarTiles, url, Infinity, () => loadRemoteImage(url));

const rainViewer: RadarSource = {
    name: 'RainViewer',
    credit: 'Radar: RainViewer',
    // ชุดสี Universal Blue ของ RainViewer
    legend: ['#9ED2F5', '#3C9BDC', '#0A5AA0', '#FFE600', '#FF9600', '#E60000'],
    opacity: 0.8,
    async frames() {
        const data = await fetchJson<{ host?: string; radar?: { past?: { time: number; path: string }[] } }>(RAINVIEWER_MAPS_URL, 'RainViewer');
        return (data?.radar?.past ?? []).map((frame) => ({ time: frame.time, url: `${data.host}${frame.path}` }));
    },
    async layer(view, frame) {
        const span = TILE * 2 ** (view.zoom - RADAR_ZOOM);
        const tiles = coveringTiles(view, span, 2 ** RADAR_ZOOM);
        const images = await Promise.all(tiles.map((t) => loadRadarTile(`${frame.url}/${RADAR_TILE}/${RADAR_ZOOM}/${t.x}/${t.y}/${RADAR_STYLE}.png`).catch(() => null)));
        if (!images.some(Boolean)) throw new Error('โหลดภาพเรดาร์จาก RainViewer ไม่ได้');
        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext('2d');
        tiles.forEach((t, i) => images[i] && ctx.drawImage(images[i], t.dx, t.dy, span, span));
        return canvas;
    },
};

interface TmdOverlay {
    group?: string;
    product_kind?: string;
    url?: string;
    valid_dt_iso?: string;
    bounds?: unknown;
}

const isBounds = (value: unknown): value is NonNullable<RadarFrame['bounds']> =>
    Array.isArray(value) && value.length === 2 && value.every((corner) => Array.isArray(corner) && corner.length === 2 && corner.every(Number.isFinite));

// valid_dt_iso เป็นเวลา UTC ที่ไม่มี Z ต่อท้าย (ส่วน valid_dt_ts ของ API คลาดไป 7 ชม. จึงไม่ใช้)
const utcSeconds = (iso: string) => Date.parse(/(Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`) / 1000;

// ภาพทั้งประเทศเป็น PNG ราว 200 KB แต่ถอดแล้ว 2706×2706 px ≈ 30 MB — เก็บแค่ไฟล์ และถอดทีละภาพ ไม่ให้ GIF 5 ภาพกินแรมพร้อมกัน
const tmdImages = lru<CacheEntry<Buffer>>(12);
let decoding: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
    const run = decoding.then(task, task);
    decoding = run.catch(() => undefined);
    return run;
}

const tmd: RadarSource = {
    name: 'กรมอุตุฯ',
    credit: 'เรดาร์: กรมอุตุนิยมวิทยา',
    // ชุดสี dBZ ของหน้าเว็บ RADARGIS (ตัดโทนชมพูอ่อน-ขาวช่วงท้ายที่มองไม่เห็นบนพื้นสว่าง)
    legend: ['#00E600', '#00FF00', '#FFFF00', '#FFD000', '#FF6A00', '#FF0000', '#CC0044', '#FF00F5'],
    opacity: 0.85,
    async frames() {
        const data = await fetchJson<{ overlays?: TmdOverlay[] }>(`${TMD_BASE_URL}/api/overlays`, 'เรดาร์กรมอุตุฯ');
        // เฉพาะภาพ dBZ ที่วัดได้จริง — ไม่เอาภาพพยากรณ์ (nowcast) / ปริมาณฝน / ฟ้าผ่า
        const frames = (Array.isArray(data?.overlays) ? data.overlays : []).flatMap((o): RadarFrame[] => {
            if (o?.product_kind !== 'dbz' || /nowcast/i.test(`${o.group} ${o.url}`) || typeof o.url !== 'string' || typeof o.valid_dt_iso !== 'string' || !isBounds(o.bounds)) return [];
            const time = utcSeconds(o.valid_dt_iso);
            return Number.isFinite(time) ? [{ time, url: new URL(o.url, TMD_BASE_URL).href, bounds: o.bounds }] : [];
        });
        return [...new Map(frames.map((frame) => [frame.time, frame])).values()].sort((a, b) => a.time - b.time);
    },
    async layer(view, frame) {
        // ขอบภาพของกรมฯ เป็นพิกเซลบนภาพแผนที่
        const [[south, west], [north, east]] = frame.bounds!;
        const size = TILE * 2 ** view.zoom;
        const x0 = worldX(west, size) - view.left;
        const x1 = worldX(east, size) - view.left;
        const y0 = worldY(north, size) - view.top;
        const y1 = worldY(south, size) - view.top;
        if (!(x0 <= WIDTH / 2 && WIDTH / 2 <= x1 && y0 <= HEIGHT / 2 && HEIGHT / 2 <= y1)) {
            throw new Error('สถานที่อยู่นอกพื้นที่เรดาร์ของกรมอุตุฯ (ครอบคลุมเฉพาะไทยและประเทศใกล้เคียง)');
        }
        const buffer = await cached(tmdImages, frame.url, Infinity, () => fetchWithRetry(frame.url)).catch((err) => {
            throw new Error(`โหลดภาพเรดาร์จากกรมอุตุฯ ไม่ได้ (${reason(err)})`);
        });
        return oneAtATime(async () => {
            const image = await loadImage(buffer).catch(() => {
                tmdImages.delete(frame.url);
                throw new Error('ภาพเรดาร์จากกรมอุตุฯ เสีย เปิดไม่ได้');
            });
            // ตัดเฉพาะส่วนที่อยู่ในกรอบแผนที่แล้วขยายลง (ไม่ต้องวาดภาพทั้งประเทศ)
            const left = Math.max(0, x0);
            const top = Math.max(0, y0);
            const right = Math.min(WIDTH, x1);
            const bottom = Math.min(HEIGHT, y1);
            const sx = image.width / (x1 - x0);
            const sy = image.height / (y1 - y0);
            const canvas = createCanvas(WIDTH, HEIGHT);
            canvas.getContext('2d').drawImage(image, (left - x0) * sx, (top - y0) * sy, (right - left) * sx, (bottom - top) * sy, left, top, right - left, bottom - top);
            return canvas;
        });
    },
};

const SOURCES: Record<WeatherRadarSource, RadarSource> = { rainviewer: rainViewer, tmd };

const framesCache = lru<CacheEntry<RadarFrame[]>>(Object.keys(SOURCES).length);

function radarFrames(source: WeatherRadarSource): Promise<RadarFrame[]> {
    return cached(framesCache, source, FRAMES_CACHE_MS, async () => {
        const frames = await SOURCES[source].frames();
        if (!frames.length) throw new Error(`${SOURCES[source].name} ยังไม่มีภาพเรดาร์ล่าสุด`);
        return frames;
    });
}

// ==========================================
// วาดแต่ละภาพ: แผนที่ → เรดาร์ → หมุดสถานที่ → หัวภาพ (เวลา) → แถบสี → เครดิต
// ==========================================
function drawOverlay(
    ctx: SKRSContext2D,
    theme: Theme,
    source: RadarSource,
    { name, label, index, count }: { name: string; label: string; index: number; count: number },
): void {
    // หมุดตรงกลางภาพ = สถานที่ที่ตั้งไว้
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#EF4444';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();

    ctx.font = font(700, 26);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = theme.halo;
    ctx.strokeText(name, WIDTH / 2 + 20, HEIGHT / 2);
    ctx.fillStyle = theme.text;
    ctx.fillText(name, WIDTH / 2 + 20, HEIGHT / 2);

    // หัวภาพ: เวลาของภาพเรดาร์ + (ภาพเคลื่อนไหว) แถบบอกว่าเป็นภาพที่เท่าไร
    const title = `🛰️ เรดาร์ฝน · ${label}`;
    ctx.font = font(700, 28);
    const panelWidth = Math.max(300, ctx.measureText(title).width + 44);
    const panelHeight = count > 1 ? 84 : 64;
    ctx.fillStyle = theme.panel;
    ctx.beginPath();
    ctx.roundRect(24, 24, panelWidth, panelHeight, 12);
    ctx.fill();
    ctx.fillStyle = theme.text;
    ctx.fillText(title, 44, 56);
    if (count > 1) {
        const gap = 6;
        const segment = (panelWidth - 40 - gap * (count - 1)) / count;
        for (let i = 0; i < count; i++) {
            ctx.fillStyle = i <= index ? '#3B82F6' : theme.track;
            ctx.beginPath();
            ctx.roundRect(44 + i * (segment + gap), 88, segment, 6, 3);
            ctx.fill();
        }
    }

    // แถบสีความแรงของฝน (มุมขวาล่าง)
    const lx = WIDTH - 24 - 330;
    const ly = HEIGHT - 24 - 76;
    ctx.fillStyle = theme.panel;
    ctx.beginPath();
    ctx.roundRect(lx, ly, 330, 76, 12);
    ctx.fill();
    const gradient = ctx.createLinearGradient(lx + 20, 0, lx + 310, 0);
    source.legend.forEach((color, i) => gradient.addColorStop(i / (source.legend.length - 1), color));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(lx + 20, ly + 16, 290, 14, 7);
    ctx.fill();
    ctx.font = font(400, 18);
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.fillText('ฝนเบา', lx + 20, ly + 52);
    ctx.textAlign = 'right';
    ctx.fillText('ฝนหนัก / พายุ', lx + 310, ly + 52);

    // เครดิต (บังคับตามเงื่อนไขของ OpenStreetMap และแหล่งเรดาร์)
    ctx.textAlign = 'left';
    ctx.font = font(400, 15);
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.halo;
    const credit = `© OpenStreetMap contributors · ${source.credit}`;
    ctx.strokeText(credit, 24, HEIGHT - 20);
    ctx.fillStyle = theme.muted;
    ctx.fillText(credit, 24, HEIGHT - 20);
}

function drawFrame(ctx: SKRSContext2D, base: Canvas, layer: Canvas, theme: Theme, source: RadarSource, overlay: Parameters<typeof drawOverlay>[3]): void {
    ctx.drawImage(base, 0, 0);
    ctx.globalAlpha = source.opacity;
    ctx.drawImage(layer, 0, 0);
    ctx.globalAlpha = 1;
    drawOverlay(ctx, theme, source, overlay);
}

// GIF มีได้ 256 สี — ใช้ชุดสีเดียวกันทุกภาพ (คำนวณจากภาพล่าสุด) สีจะได้ไม่กระพริบระหว่างภาพ และไฟล์เล็กลง
function encodeGif(frames: Uint8ClampedArray[]): Buffer {
    const gif = GIFEncoder();
    const palette = quantize(frames[frames.length - 1]!, 256);
    frames.forEach((data, i) => {
        gif.writeFrame(applyPalette(data, palette), GIF_WIDTH, GIF_HEIGHT, {
            palette: i === 0 ? palette : undefined,
            delay: i === frames.length - 1 ? LAST_FRAME_DELAY_MS : FRAME_DELAY_MS,
        });
    });
    gif.finish();
    return Buffer.from(gif.bytes());
}

// ภาพที่วาดแล้ว — หน้า Dashboard ขอตัวอย่างใหม่ทุกครั้งที่แก้ข้อความ จะได้ไม่วาด GIF ซ้ำ
// (key เปลี่ยนเองเมื่อมีภาพเรดาร์ใหม่ทุก 10-15 นาที)
const renders = lru<CacheEntry<ReportFile & { key: string; time: number }>>(6);

/**
 * @param offset วินาทีที่ต่างจาก UTC ของสถานที่ (ใช้แสดงเวลาของภาพ)
 */
export async function renderRadarMap(location: WeatherLocation, radar: RadarOptions, offset: number): Promise<ReportFile & { key: string; time: number }> {
    const source = SOURCES[radar.source];
    const all = await radarFrames(radar.source);
    const latest = all[all.length - 1]!;
    if (Date.now() / 1000 - latest.time > STALE_S) {
        throw new Error(`${source.name} ไม่มีภาพเรดาร์ใหม่มาเกิน 3 ชั่วโมง (ภาพล่าสุด ${formatTime(latest.time, offset)} น.)`);
    }
    const frames = radar.animated ? all.filter((frame) => frame.time >= latest.time - ANIMATION_SPAN_S) : [latest];
    const key = crypto
        .createHash('sha1')
        .update(JSON.stringify([radar.source, location.lat, location.lon, location.name, radar.zoom, radar.theme, radar.animated, offset, latest.url]))
        .digest('hex')
        .slice(0, 16);

    return cached(renders, key, Infinity, async () => {
        const theme = THEMES[radar.theme] || THEMES.light;
        const view = viewport(location.lat, location.lon, radar.zoom);
        const [base, layers] = await Promise.all([basemap(view, radar.theme), Promise.all(frames.map((frame) => source.layer(view, frame)))]);

        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext('2d');
        const overlay = (i: number) => ({ name: location.name, label: `${formatTime(frames[i]!.time, offset)} น.`, index: i, count: frames.length });

        if (!radar.animated) {
            drawFrame(ctx, base, layers[0]!, theme, source, overlay(0));
            return { key, name: 'weather-radar.png', contentType: 'image/png', buffer: await canvas.encode('png'), time: latest.time };
        }

        const small = createCanvas(GIF_WIDTH, GIF_HEIGHT);
        const smallCtx = small.getContext('2d');
        const pixels = layers.map((layer, i) => {
            drawFrame(ctx, base, layer, theme, source, overlay(i));
            smallCtx.drawImage(canvas, 0, 0, GIF_WIDTH, GIF_HEIGHT);
            return smallCtx.getImageData(0, 0, GIF_WIDTH, GIF_HEIGHT).data;
        });
        return { key, name: 'weather-radar.gif', contentType: 'image/gif', buffer: encodeGif(pixels), time: latest.time };
    });
}

// ภาพที่เพิ่งวาดไว้ (ให้หน้า Dashboard โหลดผ่าน URL แทนการยัด GIF หลาย MB ลงใน JSON) — null ถ้าหลุดจาก cache แล้ว
export async function getRenderedRadar(key: string): Promise<ReportFile | null> {
    const hit = renders.get(key);
    return hit ? hit.promise.catch(() => null) : null;
}
