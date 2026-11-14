import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type {
    CustomSummaryChannelGroup,
    CustomSummaryChannelRow,
    CustomSummaryDetailMode,
    CustomSummaryLogRow,
    CustomSummaryPdfTheme,
    CustomSummaryResponse,
} from '@notstack/shared';
import { accessSync, constants as fsConstants, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer, { type Browser } from 'puppeteer-core';

const requireFromHere = createRequire(__filename);
const BANGKOK_TZ = 'Asia/Bangkok';
const pdfLogger = new Logger('CustomSummaryPdfService');

export interface RenderCustomSummaryPdfOptions {
    title: string;
    theme: CustomSummaryPdfTheme;
    detailMode: CustomSummaryDetailMode;
    adminName: string;
    printedAt?: Date;
    maskIds?: boolean;
}

const FONT_SOURCES: Array<{ pkgFile: string; family: string; weight: number }> = [
    { pkgFile: '@expo-google-fonts/sarabun/400Regular/Sarabun_400Regular.ttf', family: 'Sarabun', weight: 400 },
    { pkgFile: '@expo-google-fonts/sarabun/600SemiBold/Sarabun_600SemiBold.ttf', family: 'Sarabun', weight: 600 },
    { pkgFile: '@expo-google-fonts/sarabun/700Bold/Sarabun_700Bold.ttf', family: 'Sarabun', weight: 700 },
    { pkgFile: '@expo-google-fonts/noto-sans-thai/400Regular/NotoSansThai_400Regular.ttf', family: 'Noto Sans Thai', weight: 400 },
    { pkgFile: '@expo-google-fonts/noto-sans-thai/600SemiBold/NotoSansThai_600SemiBold.ttf', family: 'Noto Sans Thai', weight: 600 },
    { pkgFile: '@expo-google-fonts/noto-sans-thai/700Bold/NotoSansThai_700Bold.ttf', family: 'Noto Sans Thai', weight: 700 },
];

let cachedFontCss: string | null = null;
let sharedBrowserPromise: Promise<Browser> | null = null;
let sharedBrowserInstallPromise: Promise<string> | null = null;

export interface BrowserDiscoveryOptions {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    includeSystemPaths?: boolean;
    homeDir?: string;
}

interface PuppeteerBrowsersModule {
    Browser: { CHROMEHEADLESSSHELL: string; CHROME: string };
    detectBrowserPlatform: () => string | undefined;
    computeExecutablePath: (opts: {
        cacheDir: string | null;
        browser: string;
        buildId: string;
        platform?: string;
    }) => string;
    resolveBuildId: (browser: string, platform: string, tag: string) => Promise<string>;
    install: (opts: {
        cacheDir: string;
        browser: string;
        buildId: string;
        platform?: string;
    }) => Promise<{ executablePath: string }>;
}

/** ตรวจสอบว่าไฟล์มีอยู่จริงและสามารถรันได้บนระบบปฏิบัติการปัจจุบัน */
function isExecutableFile(filePath: string): boolean {
    try {
        const stat = statSync(filePath);
        if (!stat.isFile()) return false;
        if (process.platform !== 'win32') {
            accessSync(filePath, fsConstants.X_OK);
        }
        return true;
    } catch {
        return false;
    }
}

function cleanEnvPath(raw: string | undefined): string {
    return (raw ?? '').trim().replace(/^["']|["']$/g, '');
}

/** ค้นหาไบนารี Chromium/Chrome ในโฟลเดอร์แคชของ Puppeteer หรือ Playwright (ความลึกสูงสุด 4 ชั้น) */
function findBinaryInCacheDir(rootDir: string, binaryNames: readonly string[], maxDepth = 4): string | null {
    if (!rootDir) return null;

    const visit = (dir: string, depth: number): string | null => {
        for (const name of binaryNames) {
            const candidate = path.join(dir, name);
            if (isExecutableFile(candidate)) return candidate;
        }
        if (depth >= maxDepth) return null;

        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return null;
        }

        const subdirs = entries
            .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
            .map((entry) => entry.name)
            .sort((a, b) => b.localeCompare(a, 'en'));

        for (const sub of subdirs) {
            const found = visit(path.join(dir, sub), depth + 1);
            if (found) return found;
        }
        return null;
    };

    return visit(rootDir, 0);
}

function getStaticBrowserCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
    if (platform === 'win32') {
        const localAppData = cleanEnvPath(env.LOCALAPPDATA);
        return [
            'C:/Program Files/Google/Chrome/Application/chrome.exe',
            'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            localAppData ? path.join(localAppData, 'Google/Chrome/Application/chrome.exe') : '',
            'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
            'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
            localAppData ? path.join(localAppData, 'Microsoft/Edge/Application/msedge.exe') : '',
        ];
    }

    if (platform === 'darwin') {
        return [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ];
    }

    return [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/local/bin/google-chrome',
        '/usr/local/bin/chromium',
        '/snap/bin/chromium',
        '/opt/google/chrome/chrome',
        '/opt/google/chrome/google-chrome',
        '/usr/lib/chromium/chromium',
        '/usr/lib/chromium-browser/chromium-browser',
        '/usr/bin/microsoft-edge',
        '/usr/bin/microsoft-edge-stable',
        '/var/lib/flatpak/exports/bin/com.google.Chrome',
        '/var/lib/flatpak/exports/bin/org.chromium.Chromium',
    ];
}

/** ค้นหาเบราว์เซอร์ Chromium/Chrome/Edge จาก env, PATH, โฟลเดอร์ระบบ และแคช Puppeteer/Playwright */
export function findBrowserExecutable(options: BrowserDiscoveryOptions = {}): string | null {
    const env = options.env ?? process.env;
    const platform = options.platform ?? process.platform;
    const includeSystemPaths = options.includeSystemPaths ?? true;
    const homeDir = options.homeDir ?? os.homedir();

    const envKeys = [
        'PUPPETEER_EXECUTABLE_PATH',
        'CHROME_PATH',
        'CHROMIUM_PATH',
        'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
    ] as const;

    for (const key of envKeys) {
        const configured = cleanEnvPath(env[key]);
        if (!configured) continue;
        if (isExecutableFile(configured)) return configured;
        pdfLogger.warn(`ตัวแปร ${key}="${configured}" ไม่พบไฟล์ที่รันได้ จะค้นหาจากแหล่งอื่นแทน`);
    }

    if (includeSystemPaths) {
        for (const candidate of getStaticBrowserCandidates(platform, env)) {
            if (candidate && isExecutableFile(candidate)) return candidate;
        }
    }

    const pathEnv = cleanEnvPath(env.PATH);
    if (pathEnv) {
        const pathSep = platform === 'win32' ? ';' : ':';
        const binNames =
            platform === 'win32'
                ? ['chrome.exe', 'msedge.exe']
                : [
                      'google-chrome',
                      'google-chrome-stable',
                      'chromium',
                      'chromium-browser',
                      'microsoft-edge',
                      'microsoft-edge-stable',
                      'chrome-headless-shell',
                  ];

        for (const dir of pathEnv.split(pathSep)) {
            const trimmedDir = dir.trim();
            if (!trimmedDir) continue;
            for (const binName of binNames) {
                const candidate = path.join(trimmedDir, binName);
                if (isExecutableFile(candidate)) return candidate;
            }
        }
    }

    const cacheRoots = [
        cleanEnvPath(env.PUPPETEER_CACHE_DIR),
        homeDir ? path.join(homeDir, '.cache', 'notstack-puppeteer') : '',
        homeDir ? path.join(homeDir, '.cache', 'puppeteer') : '',
        homeDir ? path.join(homeDir, '.cache', 'ms-playwright') : '',
        includeSystemPaths && platform === 'linux' && homeDir !== '/root' ? '/root/.cache/puppeteer' : '',
    ].filter((dir, index, arr): dir is string => Boolean(dir) && arr.indexOf(dir) === index);

    const cacheBinaryNames =
        platform === 'win32'
            ? ['chrome-headless-shell.exe', 'chrome.exe']
            : ['chrome-headless-shell', 'headless_shell', 'chrome'];

    for (const rootDir of cacheRoots) {
        const cached = findBinaryInCacheDir(rootDir, cacheBinaryNames);
        if (cached) return cached;
    }

    return null;
}

function pickWritableCacheDir(): string {
    const candidates = [
        cleanEnvPath(process.env.PUPPETEER_CACHE_DIR),
        os.homedir() ? path.join(os.homedir(), '.cache', 'notstack-puppeteer') : '',
        path.join(os.tmpdir(), 'notstack-puppeteer'),
    ].filter((dir): dir is string => Boolean(dir));

    for (const dir of candidates) {
        try {
            mkdirSync(dir, { recursive: true });
            return dir;
        } catch {
            // ลองตำแหน่งถัดไปหากไม่มีสิทธิ์เขียน
        }
    }

    return path.join(os.tmpdir(), 'notstack-puppeteer');
}

async function downloadPuppeteerHeadlessShell(): Promise<string> {
    if (sharedBrowserInstallPromise) return sharedBrowserInstallPromise;

    sharedBrowserInstallPromise = (async () => {
        const corePkgPath = requireFromHere.resolve('puppeteer-core/package.json');
        const requireFromCore = createRequire(corePkgPath);
        const browsersEntryPath = requireFromCore.resolve('@puppeteer/browsers');
        const browsers = (await import(pathToFileURL(browsersEntryPath).href)) as PuppeteerBrowsersModule;

        const platform = browsers.detectBrowserPlatform();
        if (!platform) {
            throw new Error(`ไม่รองรับการดาวน์โหลด Chromium อัตโนมัติบนแพลตฟอร์ม ${process.platform} (${process.arch})`);
        }

        let buildId = '';
        try {
            const revisionsPath = requireFromHere.resolve('puppeteer-core/internal/revisions.js');
            const revisionsMod = (await import(pathToFileURL(revisionsPath).href)) as {
                PUPPETEER_REVISIONS?: Record<string, string>;
            };
            buildId = revisionsMod.PUPPETEER_REVISIONS?.['chrome-headless-shell'] ?? '';
        } catch {
            // ตกหล่นไปใช้ resolveBuildId ด้านล่าง
        }

        if (!buildId) {
            buildId = await browsers.resolveBuildId(browsers.Browser.CHROMEHEADLESSSHELL, platform, 'stable');
        }

        const cacheDir = pickWritableCacheDir();
        const expectedPath = browsers.computeExecutablePath({
            cacheDir,
            browser: browsers.Browser.CHROMEHEADLESSSHELL,
            buildId,
            platform,
        });
        if (isExecutableFile(expectedPath)) return expectedPath;

        pdfLogger.log(`ไม่พบเบราว์เซอร์ในระบบ กำลังดาวน์โหลด chrome-headless-shell (${buildId}) ไปยัง ${cacheDir}...`);
        const installed = await browsers.install({
            cacheDir,
            browser: browsers.Browser.CHROMEHEADLESSSHELL,
            buildId,
            platform,
        });
        if (!isExecutableFile(installed.executablePath)) {
            throw new Error(`ดาวน์โหลดเสร็จสิ้นแต่ไม่พบไฟล์ไบนารีที่ ${installed.executablePath}`);
        }
        pdfLogger.log(`ติดตั้ง chrome-headless-shell สำเร็จที่ ${installed.executablePath}`);
        return installed.executablePath;
    })().finally(() => {
        sharedBrowserInstallPromise = null;
    });

    return sharedBrowserInstallPromise;
}

/** หาเบราว์เซอร์ที่พร้อมใช้งาน หรือดาวน์โหลด chrome-headless-shell อัตโนมัติครั้งเดียวเมื่อไม่มีในระบบ */
async function ensureBrowserExecutable(): Promise<string> {
    const existing = findBrowserExecutable();
    if (existing) return existing;

    const skipAutoDownload = ['1', 'true', 'yes'].includes((process.env.SKIP_AUTO_BROWSER_DOWNLOAD ?? '').trim().toLowerCase());
    if (skipAutoDownload) {
        throw new Error(
            'ไม่พบเบราว์เซอร์ Chromium/Chrome/Edge สำหรับสร้างไฟล์ PDF กรุณากำหนดตัวแปร PUPPETEER_EXECUTABLE_PATH',
        );
    }

    try {
        return await downloadPuppeteerHeadlessShell();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
            `ไม่พบเบราว์เซอร์ Chromium/Chrome สำหรับสร้างไฟล์ PDF และไม่สามารถดาวน์โหลดอัตโนมัติได้ (${msg}) — กรุณาติดตั้ง Chromium บนเครื่อง (เช่น sudo apt-get update && sudo apt-get install -y chromium) หรือกำหนดตัวแปร PUPPETEER_EXECUTABLE_PATH`,
        );
    }
}

function formatBrowserLaunchError(executablePath: string, err: unknown): Error {
    const rawMsg = err instanceof Error ? err.message : String(err);
    if (/shared libraries|cannot open shared object file|libnss3|libgbm|libatk/i.test(rawMsg)) {
        return new Error(
            `ไม่สามารถเปิด Chromium (${executablePath}) เพื่อสร้างไฟล์ PDF เนื่องจากขาดไลบรารีระบบ (${rawMsg}) — บน Ubuntu/Debian ให้รัน: sudo apt-get update && sudo apt-get install -y chromium หรือติดตั้ง shared libs ของ Chromium`,
        );
    }
    return new Error(`ไม่สามารถเปิดเบราว์เซอร์ (${executablePath}) สำหรับสร้างไฟล์ PDF: ${rawMsg}`);
}

/** สร้าง @font-face CSS แบบฝังไฟล์ TTF เป็น Data URI เพื่อรับประกันฟอนต์ภาษาไทยบน Chromium */
function getEmbeddedFontCss(): string {
    if (cachedFontCss !== null) return cachedFontCss;

    const rules: string[] = [];
    for (const font of FONT_SOURCES) {
        try {
            const resolved = requireFromHere.resolve(font.pkgFile);
            const b64 = readFileSync(resolved).toString('base64');
            rules.push(
                `@font-face { font-family: '${font.family}'; font-style: normal; font-weight: ${font.weight}; font-display: swap; src: url('data:font/ttf;base64,${b64}') format('truetype'); }`,
            );
        } catch {
            // ข้ามฟอนต์ที่ไม่มีในสภาพแวดล้อม
        }
    }

    cachedFontCss = rules.join('\n');
    return cachedFontCss;
}

async function getPdfBrowser(): Promise<Browser> {
    if (sharedBrowserPromise) {
        try {
            const existing = await sharedBrowserPromise;
            if (existing.connected) return existing;
        } catch {
            sharedBrowserPromise = null;
        }
    }

    sharedBrowserPromise = (async () => {
        const executablePath = await ensureBrowserExecutable();
        try {
            const browser = await puppeteer.launch({
                executablePath,
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--font-render-hinting=none',
                ],
            });
            browser.once('disconnected', () => {
                sharedBrowserPromise = null;
            });
            return browser;
        } catch (err) {
            throw formatBrowserLaunchError(executablePath, err);
        }
    })().catch((err) => {
        sharedBrowserPromise = null;
        throw err;
    });

    return sharedBrowserPromise;
}

/** ปิด Browser instance ที่ใช้ร่วมกัน (เรียกตอนปิดแอปพลิเคชันหรือท้าย Test Suite) */
export async function closePdfBrowser(): Promise<void> {
    const pending = sharedBrowserPromise;
    sharedBrowserPromise = null;
    if (!pending) return;
    try {
        const browser = await pending;
        if (browser.connected) {
            await browser.close();
        }
    } catch {
        // ไม่ต้องโยน error ตอน shutdown
    }
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeCssString(text: string): string {
    return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');
}

/** ตัดอีโมจิออกจากชื่อห้องเฉพาะในรายงาน PDF เพื่อความเป็นทางการของเอกสาร */
function stripEmojiForPdf(name: string): string {
    const cleaned = name.replace(/\p{Extended_Pictographic}|\uFE0F/gu, '').replace(/\s+/g, ' ').trim();
    return cleaned || name.trim();
}

/** แปลงลิงก์ Markdown [text](url) ให้เหลือเฉพาะข้อความธรรมดาในตาราง Log */
function stripMarkdownLinks(text: string): string {
    return text.replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+|[^)\s]+)\)/g, '$1');
}

/** ปรับชื่อเหตุการณ์ใน PDF ให้กระชับตรงบริบทรายงานทางการ */
function pdfEventLabel(log: CustomSummaryLogRow): string {
    if (log.eventLabel === 'PR แจ้งเตือน') return 'เปิด PR';
    return log.eventLabel;
}

function formatNum(value: number): string {
    return value.toLocaleString('en-US');
}

function formatThaiDuration(totalSeconds: number): string {
    const safe = Math.max(0, Math.round(totalSeconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    if (hours === 0) return `${minutes} นาที`;
    return `${formatNum(hours)} ชม. ${minutes} นาที`;
}

function formatBangkokDateTime(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return `${new Intl.DateTimeFormat('th-TH', {
        timeZone: BANGKOK_TZ,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date)} น.`;
}

function formatBangkokShortDateTime(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('th-TH', {
        timeZone: BANGKOK_TZ,
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
}

function channelGroupLabel(kind: CustomSummaryChannelGroup): string {
    if (kind === 'voice') return 'ห้องเสียง';
    if (kind === 'devops') return 'DevOps';
    return 'ข้อความ';
}

function computeNiceScale(maxValue: number, tickCount = 4): { niceMax: number; ticks: number[] } {
    if (maxValue <= 0) {
        return { niceMax: 4, ticks: [0, 1, 2, 3, 4] };
    }
    const rawStep = maxValue / tickCount;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const fraction = rawStep / magnitude;
    let niceFraction = 1;
    if (fraction > 5) niceFraction = 10;
    else if (fraction > 2) niceFraction = 5;
    else if (fraction > 1) niceFraction = 2;

    const step = Math.max(1, Math.ceil(niceFraction * magnitude));
    const niceMax = step * tickCount;
    const ticks: number[] = [];
    for (let i = 0; i <= tickCount; i++) {
        ticks.push(step * i);
    }
    return { niceMax, ticks };
}

function buildVoiceMinutesTimelineSvg(points: CustomSummaryResponse['timeline']): string {
    const w = 680;
    const h = 165;
    const padL = 48;
    const padR = 16;
    const padT = 14;
    const padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const values = points.map((p) => p.voiceMinutes);
    const maxVal = Math.max(0, ...values);
    const totalVoice = values.reduce((sum, v) => sum + v, 0);
    const { niceMax, ticks } = computeNiceScale(maxVal, 4);

    const xAt = (idx: number) =>
        points.length <= 1 ? padL + plotW / 2 : padL + (idx / (points.length - 1)) * plotW;
    const yAt = (val: number) => padT + plotH - (val / niceMax) * plotH;

    const gridLines = ticks
        .map((tick) => {
            const y = yAt(tick).toFixed(1);
            return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#E5E7EB" stroke-width="1" />
<text x="${padL - 6}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="9.5" fill="#6B7280">${formatNum(tick)}</text>`;
        })
        .join('\n');

    const coords = points.map((pt, idx) => ({
        x: xAt(idx),
        y: yAt(pt.voiceMinutes),
        label: pt.label,
    }));

    const linePath = coords.map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const areaPath =
        coords.length > 1
            ? `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${coords[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`
            : '';

    const markers =
        coords.length <= 35
            ? coords
                  .map(
                      (c) =>
                          `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2.6" fill="#1E3A5F" stroke="#FFFFFF" stroke-width="0.9" />`,
                  )
                  .join('')
            : '';

    const labelStride = Math.max(1, Math.ceil(points.length / 8));
    const xLabels = coords
        .filter((_, idx) => idx % labelStride === 0 || idx === coords.length - 1)
        .map((c) => {
            const x = Math.min(w - 18, Math.max(padL + 12, c.x));
            return `<text x="${x.toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="9" fill="#6B7280">${escapeHtml(c.label)}</text>`;
        })
        .join('');

    return `
    <div class="chart-panel">
        <div class="chart-head">
            <span class="chart-title">เวลาใช้งานห้องเสียง (หน่วย: นาที)</span>
            <span class="chart-meta">รวม ${formatNum(totalVoice)} นาที · สูงสุดต่อช่วงเวลา ${formatNum(maxVal)} นาที</span>
        </div>
        <svg viewBox="0 0 ${w} ${h}" class="chart-svg" role="img" aria-label="กราฟเวลาใช้งานห้องเสียง">
            ${gridLines}
            <line x1="${padL}" y1="${padT + plotH}" x2="${w - padR}" y2="${padT + plotH}" stroke="#9CA3AF" stroke-width="1" />
            ${areaPath ? `<path d="${areaPath}" fill="rgba(30, 58, 95, 0.10)" />` : ''}
            ${coords.length > 1 ? `<path d="${linePath}" fill="none" stroke="#1E3A5F" stroke-width="2" />` : ''}
            ${markers}
            ${xLabels}
        </svg>
    </div>`;
}

function buildEventCountsTimelineSvg(
    points: CustomSummaryResponse['timeline'],
    enabled: Set<string>,
): string {
    const seriesList: Array<{
        key: string;
        label: string;
        stroke: string;
        dash: string;
        marker: 'circle' | 'square' | 'diamond';
        value: (pt: CustomSummaryResponse['timeline'][number]) => number;
    }> = [];

    if (enabled.has('messages')) {
        seriesList.push({
            key: 'messages',
            label: 'ข้อความที่ส่ง',
            stroke: '#1E3A5F',
            dash: '',
            marker: 'circle',
            value: (pt) => pt.messages,
        });
    }
    if (enabled.has('githubPr')) {
        seriesList.push({
            key: 'pr',
            label: 'GitHub PR (แจ้งเตือน/Merge/ปิด)',
            stroke: '#B45309',
            dash: '6,3',
            marker: 'square',
            value: (pt) => pt.prSent + pt.prMerged + pt.prClosed,
        });
    }
    if (enabled.has('devopsOther')) {
        seriesList.push({
            key: 'devops',
            label: 'DevOps & สมาชิก (Grafana/Jira/เข้า-ออก)',
            stroke: '#6B7280',
            dash: '2.5,2.5',
            marker: 'diamond',
            value: (pt) => pt.grafanaAlerts + pt.jiraCards + pt.memberJoin + pt.memberLeave,
        });
    }

    if (seriesList.length === 0) return '';

    const w = 680;
    const h = 172;
    const padL = 48;
    const padR = 16;
    const padT = 14;
    const padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    let maxVal = 0;
    for (const s of seriesList) {
        for (const pt of points) {
            maxVal = Math.max(maxVal, s.value(pt));
        }
    }
    const { niceMax, ticks } = computeNiceScale(maxVal, 4);

    const xAt = (idx: number) =>
        points.length <= 1 ? padL + plotW / 2 : padL + (idx / (points.length - 1)) * plotW;
    const yAt = (val: number) => padT + plotH - (val / niceMax) * plotH;

    const gridLines = ticks
        .map((tick) => {
            const y = yAt(tick).toFixed(1);
            return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#E5E7EB" stroke-width="1" />
<text x="${padL - 6}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="9.5" fill="#6B7280">${formatNum(tick)}</text>`;
        })
        .join('\n');

    const paths = seriesList
        .map((s) => {
            const pts = points.map((pt, idx) => ({
                x: xAt(idx),
                y: yAt(s.value(pt)),
            }));
            const d = pts.map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
            const dashAttr = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
            const markerEls =
                pts.length <= 35
                    ? pts
                          .map((c) => {
                              if (s.marker === 'square') {
                                  return `<rect x="${(c.x - 2.3).toFixed(1)}" y="${(c.y - 2.3).toFixed(1)}" width="4.6" height="4.6" fill="${s.stroke}" stroke="#FFFFFF" stroke-width="0.7" />`;
                              }
                              if (s.marker === 'diamond') {
                                  return `<polygon points="${c.x.toFixed(1)},${(c.y - 3).toFixed(1)} ${(c.x + 3).toFixed(1)},${c.y.toFixed(1)} ${c.x.toFixed(1)},${(c.y + 3).toFixed(1)} ${(c.x - 3).toFixed(1)},${c.y.toFixed(1)}" fill="${s.stroke}" stroke="#FFFFFF" stroke-width="0.7" />`;
                              }
                              return `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2.5" fill="${s.stroke}" stroke="#FFFFFF" stroke-width="0.7" />`;
                          })
                          .join('')
                    : '';

            return `${pts.length > 1 ? `<path d="${d}" fill="none" stroke="${s.stroke}" stroke-width="1.9"${dashAttr} />` : ''}${markerEls}`;
        })
        .join('\n');

    const labelStride = Math.max(1, Math.ceil(points.length / 8));
    const xLabels = points
        .map((pt, idx) => ({ x: xAt(idx), label: pt.label, idx }))
        .filter((item) => item.idx % labelStride === 0 || item.idx === points.length - 1)
        .map((item) => {
            const x = Math.min(w - 18, Math.max(padL + 12, item.x));
            return `<text x="${x.toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="9" fill="#6B7280">${escapeHtml(item.label)}</text>`;
        })
        .join('');

    const legendItems = seriesList
        .map((s) => {
            const dashAttr = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
            return `<span class="legend-item"><svg width="20" height="10" viewBox="0 0 20 10"><line x1="0" y1="5" x2="20" y2="5" stroke="${s.stroke}" stroke-width="2"${dashAttr} /></svg><span>${escapeHtml(s.label)}</span></span>`;
        })
        .join('');

    return `
    <div class="chart-panel">
        <div class="chart-head">
            <span class="chart-title">ปริมาณเหตุการณ์แยกตามประเภท (หน่วย: ครั้ง / ข้อความ)</span>
            <div class="chart-legend">${legendItems}</div>
        </div>
        <svg viewBox="0 0 ${w} ${h}" class="chart-svg" role="img" aria-label="กราฟปริมาณเหตุการณ์ตามประเภท">
            ${gridLines}
            <line x1="${padL}" y1="${padT + plotH}" x2="${w - padR}" y2="${padT + plotH}" stroke="#9CA3AF" stroke-width="1" />
            ${paths}
            ${xLabels}
        </svg>
    </div>`;
}

function buildTopComparisonSvgs(summary: CustomSummaryResponse): string {
    const voiceTop = summary.voiceChannels.filter((r) => r.totalSeconds > 0).slice(0, 8);
    const prTop = summary.prBreakdown.byRepo.filter((r) => r.total > 0).slice(0, 8);

    if (voiceTop.length === 0 && prTop.length === 0) return '';

    const panels: string[] = [];

    if (voiceTop.length > 0) {
        const maxSec = Math.max(1, ...voiceTop.map((r) => r.totalSeconds));
        const rowsHtml = voiceTop
            .map((row) => {
                const pct = Math.max(2, (row.totalSeconds / maxSec) * 100);
                const label = `#${stripEmojiForPdf(row.channelName)}`;
                return `<div class="top-bar-row">
                    <span class="top-bar-label">${escapeHtml(label)}</span>
                    <svg class="top-bar-track" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
                        <rect x="0" y="0" width="100" height="8" rx="2" fill="#E5E7EB" />
                        <rect x="0" y="0" width="${pct.toFixed(1)}" height="8" rx="2" fill="#1E3A5F" />
                    </svg>
                    <span class="top-bar-val">${escapeHtml(formatThaiDuration(row.totalSeconds))}</span>
                </div>`;
            })
            .join('\n');

        panels.push(`
        <div class="chart-panel chart-panel-half">
            <div class="chart-head">
                <span class="chart-title">Top ${voiceTop.length} ห้องเสียงที่มีการใช้งาน</span>
                <span class="chart-meta">ตัดห้องที่เวลาเป็น 0 ออก</span>
            </div>
            <div class="top-bar-list">${rowsHtml}</div>
        </div>`);
    }

    if (prTop.length > 0) {
        const maxTotal = Math.max(1, ...prTop.map((r) => r.total));
        const rowsHtml = prTop
            .map((repo) => {
                let curX = 0;
                const segments = [
                    { count: repo.merged, color: '#1E3A5F' },
                    { count: repo.sent, color: '#9CA3AF' },
                    { count: repo.closed, color: '#B45309' },
                ];
                const rects = segments
                    .filter((s) => s.count > 0)
                    .map((s) => {
                        const segW = (s.count / maxTotal) * 100;
                        const rect = `<rect x="${curX.toFixed(1)}" y="0" width="${segW.toFixed(1)}" height="8" fill="${s.color}" />`;
                        curX += segW;
                        return rect;
                    })
                    .join('');
                return `<div class="top-bar-row">
                    <span class="top-bar-label">${escapeHtml(repo.repoFullName)}</span>
                    <svg class="top-bar-track" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
                        <rect x="0" y="0" width="100" height="8" rx="2" fill="#E5E7EB" />
                        ${rects}
                    </svg>
                    <span class="top-bar-val">${formatNum(repo.total)}</span>
                </div>`;
            })
            .join('\n');

        panels.push(`
        <div class="chart-panel chart-panel-half">
            <div class="chart-head">
                <span class="chart-title">Top ${prTop.length} Repository (GitHub PR)</span>
                <div class="chart-legend">
                    <span class="legend-item"><svg width="10" height="10"><rect width="10" height="8" y="1" fill="#1E3A5F"/></svg><span>Merge</span></span>
                    <span class="legend-item"><svg width="10" height="10"><rect width="10" height="8" y="1" fill="#9CA3AF"/></svg><span>เปิด/อัปเดต</span></span>
                    <span class="legend-item"><svg width="10" height="10"><rect width="10" height="8" y="1" fill="#B45309"/></svg><span>ปิด</span></span>
                </div>
            </div>
            <div class="top-bar-list">${rowsHtml}</div>
        </div>`);
    }

    return `<div class="${panels.length === 2 ? 'chart-grid-2' : 'chart-grid-1'}">${panels.join('')}</div>`;
}

function renderSummaryOverviewSection(summary: CustomSummaryResponse): string {
    const enabled = new Set(summary.filters.modules);
    const v = summary.kpis.voice;
    const m = summary.kpis.messages;
    const pr = summary.kpis.githubPr;
    const d = summary.kpis.devopsOther;

    const rows: Array<{ label: string; value: string }> = [
        {
            label: 'ระยะเวลารวมในห้องเสียง',
            value: enabled.has('voice')
                ? `${formatThaiDuration(v.totalSeconds)} (${formatNum(v.sessions)} ช่วงสนทนา · เข้า ${formatNum(v.joins)} / ออก ${formatNum(v.leaves)} / ย้ายห้อง ${formatNum(v.switches)})`
                : 'ไม่ได้เลือกโมดูลห้องเสียง',
        },
        {
            label: 'เวลาสนทนาเฉลี่ยต่อช่วงสนทนา',
            value: enabled.has('voice')
                ? `${v.avgSessionMinutes.toLocaleString('en-US')} นาที${v.activeAtCutoffCount > 0 ? ` (ยังอยู่ในห้อง ณ เวลาตัดยอด ${formatNum(v.activeAtCutoffCount)} คน)` : ''}`
                : '-',
        },
        {
            label: 'ข้อความในช่องแชท',
            value: enabled.has('messages')
                ? `${formatNum(m.totalSent)} ข้อความ (ลบ ${formatNum(m.deleted)} · แก้ไข ${formatNum(m.edited)}${
                      m.busiestChannel ? ` · คึกคักสุด #${stripEmojiForPdf(m.busiestChannel.channelName)} (${formatNum(m.busiestChannel.count)})` : ''
                  })`
                : 'ไม่ได้เลือกโมดูลข้อความ',
        },
        {
            label: 'กิจกรรม GitHub Pull Request',
            value: enabled.has('githubPr')
                ? `รวม ${formatNum(pr.totalNotifications)} ครั้ง (เปิด/อัปเดต ${formatNum(pr.openedOrUpdated)} · Merge ${formatNum(pr.merged)} · ปิด ${formatNum(pr.closed)} · PR ไม่ซ้ำ ${formatNum(pr.uniquePrCount)} ใบ)`
                : 'ไม่ได้เลือกโมดูล GitHub PR',
        },
        {
            label: 'อัตราการ Merge PR (Merge rate)',
            value: enabled.has('githubPr') ? `${pr.mergeRatePercent}%` : '-',
        },
        {
            label: 'การแจ้งเตือน Grafana Alert',
            value: enabled.has('devopsOther')
                ? `${formatNum(d.grafanaSent)} ครั้ง (Firing ${formatNum(d.grafanaFiring)} / Resolved ${formatNum(d.grafanaResolved)})`
                : 'ไม่ได้เลือกโมดูล DevOps & อื่นๆ',
        },
        {
            label: 'ความเคลื่อนไหว Jira Cards',
            value: enabled.has('devopsOther')
                ? `สร้าง/เปิด ${formatNum(d.jiraCreated + d.jiraIssueCreated)} รายการ · ปิดงาน ${formatNum(d.jiraClosed)} รายการ`
                : '-',
        },
        {
            label: 'สมาชิกเข้า-ออก และการใช้คำสั่งบอท',
            value: enabled.has('devopsOther')
                ? `เข้า +${formatNum(d.memberJoin)} / ออก -${formatNum(d.memberLeave)} (สุทธิ ${d.netMembers >= 0 ? '+' : ''}${formatNum(d.netMembers)}) · คำสั่งบอท ${formatNum(d.commandsUsed)} ครั้ง`
                : '-',
        },
        {
            label: 'ผู้ใช้งานที่มีส่วนร่วม (บัญชี Discord)',
            value: `${formatNum(summary.kpis.activeUsers)} คน · เหตุการณ์รวมทั้งหมด ${formatNum(summary.kpis.totalEvents)} รายการ (จาก ${formatNum(summary.channelBreakdown.length)} ห้อง)`,
        },
    ];

    const trHtml = rows
        .map(
            (r) => `<tr>
                <td class="kv-key">${escapeHtml(r.label)}</td>
                <td>${escapeHtml(r.value)}</td>
            </tr>`,
        )
        .join('\n');

    return `
    <section>
        <h2>สรุปภาพรวม</h2>
        <table class="kv-table">
            <thead>
                <tr>
                    <th style="width: 34%">ตัวชี้วัดหลัก</th>
                    <th>ผลสรุปในช่วงเวลาที่เลือก</th>
                </tr>
            </thead>
            <tbody>
                ${trHtml}
            </tbody>
        </table>
        <div class="footnote">
            <div><strong>นิยามตัวชี้วัด:</strong></div>
            <div>• <em>อัตราการ Merge PR (Merge rate)</em> = จำนวน PR ที่ Merge ÷ (จำนวน PR ที่ Merge + จำนวน PR ที่ปิดโดยไม่ Merge) × 100</div>
            <div>• <em>เวลาสนทนาเฉลี่ยต่อช่วง (Session)</em> = เวลารวมทั้งหมดในห้องเสียง ÷ จำนวนช่วงสนทนาที่จับคู่ได้ (รวมการย้ายห้องเสียงและการสนทนาที่ยังเปิดอยู่ ณ เวลาตัดยอด จึงต่างจากเวลาหารด้วยจำนวนครั้งที่เข้าห้อง)</div>
            <div>• <em>เวลารวมระดับเซิร์ฟเวอร์ vs รายแถว</em> คำนวณเวลาจริงในหน่วยมิลลิวินาทีแล้วจึงปัดเศษในแต่ละระดับ ตารางรายห้องและรายบุคคลแสดงหน่วยชั่วโมง/นาที (ไม่รวมเศษวินาที) และจำกัดตารางผู้มีส่วนร่วมไว้ที่ 50 อันดับแรก</div>
        </div>
    </section>`;
}

function renderTrendsSection(summary: CustomSummaryResponse): string {
    const enabled = new Set(summary.filters.modules);
    const points = summary.timeline;
    const isHourly = summary.range.interval === 'hour';
    const heading = isHourly ? 'แนวโน้มรายชั่วโมง' : 'แนวโน้มรายวัน';

    if (points.length === 0) {
        return `
        <section>
            <h2>${heading}</h2>
            <p class="empty-note">ไม่มีข้อมูลแนวโน้มตามช่วงเวลาที่เลือก</p>
        </section>`;
    }

    const parts: string[] = [];
    if (enabled.has('voice')) {
        parts.push(buildVoiceMinutesTimelineSvg(points));
    }
    if (enabled.has('messages') || enabled.has('githubPr') || enabled.has('devopsOther')) {
        parts.push(buildEventCountsTimelineSvg(points, enabled));
    }

    return `
    <section>
        <h2>${heading}</h2>
        <p class="meta" style="margin: 0 0 6pt;">แสดงข้อมูลความละเอียด${isHourly ? 'รายชั่วโมง' : 'รายวัน'}ตามเวลาไทย (Asia/Bangkok) โดยแยกแกนเวลาห้องเสียง (นาที) ออกจากแกนจำนวนเหตุการณ์ (ครั้ง/ข้อความ)</p>
        ${parts.length > 0 ? parts.join('\n') : '<p class="empty-note">ไม่ได้เลือกโมดูลสำหรับแสดงแนวโน้มรายวัน</p>'}
    </section>`;
}

function renderChannelBreakdownSection(summary: CustomSummaryResponse, detailMode: CustomSummaryDetailMode): string {
    const maxRows = detailMode === 'detailed' ? summary.channelBreakdown.length : Math.min(25, summary.channelBreakdown.length);
    const rows: CustomSummaryChannelRow[] = summary.channelBreakdown.slice(0, maxRows);
    const comparisonHtml = buildTopComparisonSvgs(summary);

    const tableHtml =
        rows.length === 0
            ? '<p class="empty-note">ไม่พบกิจกรรมของห้องในเงื่อนไขที่เลือก</p>'
            : `
        <table>
            <thead>
                <tr>
                    <th class="num" style="width: 32px">#</th>
                    <th style="width: 30%">ชื่อห้อง</th>
                    <th style="width: 72px">ประเภท</th>
                    <th class="num">ข้อความ</th>
                    <th class="num">เวลาห้องเสียง</th>
                    <th class="num">GitHub PR</th>
                    <th class="num">DevOps / อื่นๆ</th>
                    <th class="num">รวม</th>
                </tr>
            </thead>
            <tbody>
                ${rows
                    .map((row, idx) => {
                        const cleanName = `#${stripEmojiForPdf(row.channelName)}`;
                        const devopsOther = row.grafanaAlerts + row.jiraCards + row.otherEvents;
                        const voiceText = row.voiceSeconds > 0 ? formatThaiDuration(row.voiceSeconds) : '-';
                        return `<tr>
                            <td class="num">${idx + 1}</td>
                            <td>${escapeHtml(cleanName)}</td>
                            <td>${escapeHtml(channelGroupLabel(row.kind))}</td>
                            <td class="num">${row.messages > 0 ? formatNum(row.messages) : '-'}</td>
                            <td class="num">${escapeHtml(voiceText)}</td>
                            <td class="num">${row.prEvents > 0 ? formatNum(row.prEvents) : '-'}</td>
                            <td class="num">${devopsOther > 0 ? formatNum(devopsOther) : '-'}</td>
                            <td class="num">${formatNum(row.totalActivity)}</td>
                        </tr>`;
                    })
                    .join('\n')}
            </tbody>
        </table>`;

    return `
    <section>
        <h2>สรุปรายห้อง</h2>
        <p class="meta" style="margin: 0 0 6pt;">แสดง ${formatNum(rows.length)} จากทั้งหมด ${formatNum(summary.channelBreakdown.length)} ห้องที่มีความเคลื่อนไหว (จัดกลุ่มแยกตาม Discord Channel ID)</p>
        ${comparisonHtml}
        ${tableHtml}
    </section>`;
}

function renderContributorsSection(
    summary: CustomSummaryResponse,
    detailMode: CustomSummaryDetailMode,
    maskIds: boolean,
): string {
    const maxRows = detailMode === 'detailed' ? summary.topContributors.length : Math.min(20, summary.topContributors.length);
    const rows = summary.topContributors.slice(0, maxRows);

    const discordOnlyInTable = summary.topContributors.filter((c) => !c.userId.startsWith('github:')).length;
    const githubOnlyInTable = summary.topContributors.filter((c) => c.userId.startsWith('github:')).length;

    const tableHtml =
        rows.length === 0
            ? '<p class="empty-note">ไม่พบข้อมูลผู้ใช้งานในช่วงเวลาที่เลือก</p>'
            : `
        <table>
            <thead>
                <tr>
                    <th class="num" style="width: 38px">อันดับ</th>
                    <th style="width: 30%">ผู้ใช้งาน</th>
                    <th class="num">เวลาห้องเสียง</th>
                    <th class="num">ข้อความ</th>
                    <th class="num">PR</th>
                    <th class="num">Jira</th>
                    <th class="num">คำสั่ง</th>
                    <th class="num">คะแนนรวม</th>
                </tr>
            </thead>
            <tbody>
                ${rows
                    .map((row, idx) => {
                        const displayName = row.isBot ? `${row.userName} [BOT]` : row.userName;
                        const voiceText = row.voiceSeconds > 0 ? formatThaiDuration(row.voiceSeconds) : '-';
                        const idMeta = !maskIds ? `<div class="meta">ID: ${escapeHtml(row.userId)}</div>` : '';
                        return `<tr>
                            <td class="num">${idx + 1}</td>
                            <td>
                                <div><strong>${escapeHtml(displayName)}</strong></div>
                                ${idMeta}
                            </td>
                            <td class="num">${escapeHtml(voiceText)}</td>
                            <td class="num">${row.messages > 0 ? formatNum(row.messages) : '-'}</td>
                            <td class="num">${row.prActivity > 0 ? formatNum(row.prActivity) : '-'}</td>
                            <td class="num">${row.jiraTickets > 0 ? formatNum(row.jiraTickets) : '-'}</td>
                            <td class="num">${row.commandsUsed > 0 ? formatNum(row.commandsUsed) : '-'}</td>
                            <td class="num"><strong>${formatNum(row.totalScore)}</strong></td>
                        </tr>`;
                    })
                    .join('\n')}
            </tbody>
        </table>`;

    return `
    <section>
        <h2>ผู้ใช้งานที่มีส่วนร่วมสูงสุด</h2>
        <p class="meta" style="margin: 0 0 6pt;">แสดง ${formatNum(rows.length)} อันดับแรกจาก ${formatNum(summary.topContributors.length)} รายการที่จัดอันดับ (สูงสุด 50 อันดับ)</p>
        ${tableHtml}
        <div class="footnote">
            <div><strong>สูตรคำนวณคะแนนรวม:</strong> คะแนนรวม = เวลาห้องเสียง (นาที) + จำนวนข้อความ + (5 × กิจกรรม GitHub PR) + (3 × Jira Cards) + จำนวนคำสั่งบอทที่ใช้</div>
            <div><strong>ความหมายของจำนวนผู้ใช้งาน 2 ชุด:</strong> ตัวเลขในสรุปภาพรวม (${formatNum(summary.kpis.activeUsers)} คน) นับเฉพาะบัญชีผู้ใช้ Discord ที่มีส่วนร่วมจริง ส่วนตารางผู้มีส่วนร่วมสูงสุด (${formatNum(summary.topContributors.length)} รายการ) รวมทั้งบัญชี Discord (${formatNum(discordOnlyInTable)} ราย) และผู้เขียน PR จาก GitHub ที่ยังไม่ได้ผูกบัญชี Discord ในระบบ (<code>github:&lt;username&gt;</code> จำนวน ${formatNum(githubOnlyInTable)} ราย)</div>
        </div>
    </section>`;
}

function renderDetailedLogsAppendix(summary: CustomSummaryResponse, maskIds: boolean): string {
    const logs = summary.detailedLogs;
    const truncatedNote = summary.detailedLogsTruncated
        ? `(${formatNum(logs.length)} รายการล่าสุดจากทั้งหมด ${formatNum(summary.kpis.totalEvents)}+ เหตุการณ์)`
        : `(${formatNum(logs.length)} รายการจากทั้งหมด ${formatNum(logs.length)} รายการ)`;

    const tableHtml =
        logs.length === 0
            ? '<p class="empty-note">ไม่มีรายการบันทึกกิจกรรมในช่วงเวลาที่เลือก</p>'
            : `
        <table class="appendix-table">
            <thead>
                <tr>
                    <th style="width: 72px">เวลา</th>
                    <th style="width: 88px">เหตุการณ์</th>
                    <th style="width: 102px">ผู้ใช้งาน</th>
                    <th style="width: 118px">ห้อง</th>
                    <th>รายละเอียด</th>
                </tr>
            </thead>
            <tbody>
                ${logs
                    .map((log) => {
                        const timeStr = formatBangkokShortDateTime(log.createdAt);
                        const evtText = pdfEventLabel(log);
                        const rawUser = log.userName || (maskIds ? 'ผู้ใช้ (ปกปิด ID)' : log.userId) || '-';
                        const chanStr = log.channelName ? `#${stripEmojiForPdf(log.channelName)}` : '-';
                        const cleanSummary = stripMarkdownLinks(log.summary || '-');

                        return `<tr>
                            <td style="white-space: nowrap; color: var(--muted);">${escapeHtml(timeStr)}</td>
                            <td><strong>${escapeHtml(evtText)}</strong></td>
                            <td>${escapeHtml(rawUser)}</td>
                            <td>${escapeHtml(chanStr)}</td>
                            <td>${escapeHtml(cleanSummary)}</td>
                        </tr>`;
                    })
                    .join('\n')}
            </tbody>
        </table>`;

    return `
    <section class="appendix-section">
        <h2 class="appendix">ภาคผนวก: บันทึกกิจกรรม ${escapeHtml(truncatedNote)}</h2>
        ${
            summary.detailedLogsTruncated
                ? `<p class="meta" style="margin: 0 0 6pt;">หมายเหตุ: รายการนี้ถูกจำกัดไว้เฉพาะ ${formatNum(logs.length)} รายการล่าสุด เนื่องจากจำนวนเหตุการณ์รวมในช่วงเวลาที่เลือก (${formatNum(summary.kpis.totalEvents)} เหตุการณ์) เกินขีดจำกัดต่อไฟล์รายงาน</p>`
                : ''
        }
        ${tableHtml}
    </section>`;
}

function buildReportHtml(summary: CustomSummaryResponse, opts: RenderCustomSummaryPdfOptions, printedAt: Date): string {
    const maskIds = Boolean(opts.maskIds);
    const printedLabel = formatBangkokDateTime(printedAt);
    const title = opts.title.trim() || `รายงานสรุปกิจกรรมเซิร์ฟเวอร์ ${summary.guild.name}`;
    const selected = summary.filters.selectedChannels;
    const channelsSummary =
        selected.length === 0
            ? `ทุกห้องในเซิร์ฟเวอร์ (${formatNum(summary.availableChannels.length)} ห้อง)`
            : selected.length <= 6
              ? selected.map((c) => `#${stripEmojiForPdf(c.name)}`).join(', ')
              : `${selected
                    .slice(0, 6)
                    .map((c) => `#${stripEmojiForPdf(c.name)}`)
                    .join(', ')} (+${formatNum(selected.length - 6)} ห้อง)`;

    const moduleLabelMap: Record<string, string> = {
        voice: 'ห้องเสียง',
        messages: 'ข้อความ',
        githubPr: 'GitHub PR',
        devopsOther: 'DevOps & อื่นๆ',
    };
    const moduleText = summary.filters.modules.map((m) => moduleLabelMap[m] ?? m).join(', ');
    const userFilterText = summary.filters.userId
        ? maskIds
            ? 'กรองเฉพาะผู้ใช้ (ปกปิด ID)'
            : `User ID: ${summary.filters.userId}`
        : summary.filters.userQuery
          ? `ค้นหาผู้ใช้: ${summary.filters.userQuery}`
          : 'สมาชิกทุกคน';

    const dataModeLabel =
        opts.detailMode === 'detailed'
            ? 'รายงานฉบับสมบูรณ์ (รวมภาคผนวกบันทึกกิจกรรมรายบรรทัด)'
            : 'รายงานสรุปสำหรับผู้บริหาร';

    const footerLeft = `${summary.guild.name} · รายงานสรุปกิจกรรมเซิร์ฟเวอร์ · พิมพ์เมื่อ ${printedLabel}`;

    const fontCss = getEmbeddedFontCss();
    const sectionsHtml = [
        renderSummaryOverviewSection(summary),
        renderTrendsSection(summary),
        renderChannelBreakdownSection(summary, opts.detailMode),
        renderContributorsSection(summary, opts.detailMode, maskIds),
        opts.detailMode === 'detailed' ? renderDetailedLogsAppendix(summary, maskIds) : '',
    ]
        .filter(Boolean)
        .join('\n');

    return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
${fontCss}

@page {
    size: A4 portrait;
    margin: 18mm 15mm 20mm;
    @bottom-left {
        content: "${escapeCssString(footerLeft)}";
        font-family: 'Sarabun', 'Noto Sans Thai', 'Leelawadee UI', 'Tahoma', sans-serif;
        font-size: 8pt;
        color: #6B7280;
        border-top: 0.5pt solid #D1D5DB;
        padding-top: 4pt;
        vertical-align: top;
        white-space: nowrap;
    }
    @bottom-right {
        content: "หน้า " counter(page) " จาก " counter(pages);
        font-family: 'Sarabun', 'Noto Sans Thai', 'Leelawadee UI', 'Tahoma', sans-serif;
        font-size: 8pt;
        color: #6B7280;
        border-top: 0.5pt solid #D1D5DB;
        padding-top: 4pt;
        vertical-align: top;
    }
}

:root {
    --ink: #1F2937;
    --muted: #6B7280;
    --rule: #D1D5DB;
    --brand: #1E3A5F;
    --zebra: #F5F7FA;
    --ok: #2E7D32;
    --warn: #B45309;
    --bad: #B91C1C;
}

html {
    font-family: 'Sarabun', 'Noto Sans Thai', sans-serif;
    text-rendering: geometricPrecision;
}

* {
    box-sizing: border-box;
    letter-spacing: 0;
}

body {
    margin: 0;
    font-size: 10.5pt;
    line-height: 1.5;
    color: var(--ink);
    background: #FFFFFF;
    counter-reset: sec;
}

h1 {
    font-size: 20pt;
    font-weight: 700;
    color: var(--brand);
    margin: 0;
    line-height: 1.25;
}

h2 {
    font-size: 13pt;
    font-weight: 700;
    color: var(--brand);
    border-bottom: 1.5pt solid var(--brand);
    padding-bottom: 2pt;
    margin: 14pt 0 6pt;
    break-after: avoid;
    page-break-after: avoid;
    counter-increment: sec;
}

h2::before {
    content: counter(sec) ". ";
}

h2.appendix {
    counter-increment: none;
}

h2.appendix::before {
    content: none;
}

.report-header {
    border-bottom: 1.5pt solid var(--brand);
    padding-bottom: 8pt;
    margin-bottom: 12pt;
}

.subtitle-grid {
    margin-top: 5pt;
    font-size: 9.5pt;
    color: var(--ink);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2pt 16pt;
}

.meta {
    color: var(--muted);
    font-size: 9pt;
}

.meta-block {
    margin-top: 5pt;
    line-height: 1.45;
}

table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5pt;
}

thead {
    display: table-header-group;
}

th {
    background: var(--brand);
    color: #FFFFFF;
    font-weight: 600;
    text-align: left;
    padding: 4pt 6pt;
}

td {
    padding: 3.5pt 6pt;
    border-bottom: 0.5pt solid var(--rule);
    vertical-align: top;
    overflow-wrap: anywhere;
}

tr {
    break-inside: avoid;
    page-break-inside: avoid;
}

tbody tr:nth-child(even) {
    background: var(--zebra);
}

td.num, th.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.kv-key {
    font-weight: 600;
    color: var(--ink);
}

.footnote {
    margin-top: 6pt;
    padding: 5pt 8pt;
    background: var(--zebra);
    border-left: 2pt solid var(--brand);
    font-size: 8.5pt;
    line-height: 1.45;
    color: var(--muted);
    break-inside: avoid;
    page-break-inside: avoid;
}

.empty-note {
    font-size: 9.5pt;
    color: var(--muted);
    padding: 8pt 10pt;
    border: 0.5pt solid var(--rule);
    background: var(--zebra);
}

.chart-panel {
    border: 0.75pt solid var(--rule);
    padding: 7pt 9pt;
    margin-bottom: 8pt;
    break-inside: avoid;
    page-break-inside: avoid;
}

.chart-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8pt;
    margin-bottom: 4pt;
    flex-wrap: wrap;
}

.chart-title {
    font-size: 9.5pt;
    font-weight: 600;
    color: var(--brand);
}

.chart-meta {
    font-size: 8.5pt;
    color: var(--muted);
}

.chart-legend {
    display: flex;
    gap: 10pt;
    flex-wrap: wrap;
    font-size: 8pt;
    color: var(--muted);
}

.legend-item {
    display: inline-flex;
    align-items: center;
    gap: 4pt;
}

.chart-svg {
    display: block;
    width: 100%;
    height: auto;
}

.top-bar-list {
    display: flex;
    flex-direction: column;
    gap: 5pt;
    margin-top: 3pt;
}

.top-bar-row {
    display: grid;
    grid-template-columns: minmax(0, 44%) 1fr auto;
    align-items: center;
    gap: 6pt;
    font-size: 8.5pt;
}

.top-bar-label {
    color: var(--ink);
    overflow-wrap: anywhere;
    line-height: 1.25;
}

.top-bar-track {
    width: 100%;
    height: 7pt;
    display: block;
}

.top-bar-val {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: var(--ink);
    text-align: right;
}

.chart-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8pt;
    margin-bottom: 8pt;
}

.chart-grid-1 {
    margin-bottom: 8pt;
}

.appendix-section {
    break-before: page;
    page-break-before: always;
}

.appendix-table {
    font-size: 8.5pt;
}

.appendix-table th {
    padding: 3.5pt 5pt;
}

.appendix-table td {
    padding: 3pt 5pt;
    line-height: 1.4;
}

code {
    font-family: 'Sarabun', 'Noto Sans Thai', monospace;
    background: #EEF2F6;
    padding: 0 3pt;
}
</style>
</head>
<body>
    <header class="report-header">
        <h1>${escapeHtml(title)}</h1>
        <div class="subtitle-grid">
            <div><strong>ช่วงข้อมูล:</strong> ${escapeHtml(formatBangkokDateTime(summary.range.from))} – ${escapeHtml(formatBangkokDateTime(summary.range.to))}</div>
            <div><strong>วันที่พิมพ์รายงาน:</strong> ${escapeHtml(printedLabel)}</div>
            <div><strong>ผู้จัดทำรายงาน:</strong> ${escapeHtml(opts.adminName)}</div>
            <div><strong>โหมดเอกสาร:</strong> ${escapeHtml(dataModeLabel)}</div>
        </div>
        <div class="meta meta-block">
            <span>เซิร์ฟเวอร์: ${escapeHtml(summary.guild.name)}</span>
            ${!maskIds ? `<span> · Server ID: ${escapeHtml(summary.guild.id)}</span>` : '<span> · ปกปิด Discord ID</span>'}
            <span> · โมดูล: ${escapeHtml(moduleText)}</span>
            <span> · ตัวกรองผู้ใช้: ${escapeHtml(userFilterText)} (${summary.filters.includeBots ? 'รวมบอท' : 'ไม่รวมบอท'})</span>
            <span> · ห้องที่เลือก: ${escapeHtml(channelsSummary)}</span>
        </div>
    </header>
    ${sectionsHtml}
</body>
</html>`;
}

/**
 * สร้างไฟล์ PDF รายงานธุรกิจภาษาไทยขนาด A4 ด้วย headless Chromium (page.pdf)
 * พร้อมฝังฟอนต์ Sarabun และจัดวางข้อความภาษาไทยอย่างสมบูรณ์เพื่อให้สระ/วรรณยุกต์ไม่ตกหล่นเวลาเลือกหรือคัดลอกข้อความ
 */
export async function renderCustomSummaryPdf(
    summary: CustomSummaryResponse,
    opts: RenderCustomSummaryPdfOptions,
): Promise<Buffer> {
    const printedAt = opts.printedAt ?? new Date();
    const html = buildReportHtml(summary, opts, printedAt);
    const browser = await getPdfBrowser();
    const page = await browser.newPage();

    try {
        await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
        await page.evaluate('document.fonts.ready');

        const pdfBytes = await page.pdf({
            format: 'A4',
            preferCSSPageSize: true,
            printBackground: true,
        });

        return Buffer.from(pdfBytes);
    } finally {
        await page.close().catch(() => undefined);
    }
}

@Injectable()
export class CustomSummaryPdfService implements OnModuleDestroy {
    render(summary: CustomSummaryResponse, opts: RenderCustomSummaryPdfOptions): Promise<Buffer> {
        return renderCustomSummaryPdf(summary, opts);
    }

    async onModuleDestroy(): Promise<void> {
        await closePdfBrowser();
    }
}
