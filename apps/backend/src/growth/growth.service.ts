import { Injectable, Logger } from '@nestjs/common';
import type { GrowthPoint, GrowthStats } from '@notstack/shared';

// ==========================================
// 📈 สถิติการเติบโตของ repo จาก GitHub API (ไม่ต้องใช้ token เพราะ repo เป็น public)
// แคชไว้ 1 ชม. — ดึงไม่สำเร็จจะใช้ข้อมูลเดิมต่อแล้วลองใหม่ใน 5 นาที (โควตาแบบไม่ใช้ token = 60 ครั้ง/ชม./IP)
// ==========================================

const REPO = 'NTZ9008/Bot_NotStack';
const CACHE_MS = 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 10_000;
const MAX_PAGES = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface GrowthCommit {
    date: string;
    author: string | null;
}

export interface GrowthPull {
    createdAt: string;
    mergedAt: string | null;
}

interface GithubCommit {
    author: { login: string } | null;
    commit: { author: { date: string; email?: string | null } | null };
}

interface GithubPull {
    created_at: string;
    merged_at: string | null;
}

// วันจันทร์ของสัปดาห์ (เวลาไทย) เป็น ms ของเที่ยงคืน UTC ของวันนั้น
function weekStart(time: number): number {
    const day = Math.floor((time + BANGKOK_OFFSET_MS) / DAY_MS) * DAY_MS;
    const weekday = (new Date(day).getUTCDay() + 6) % 7;
    return day - weekday * DAY_MS;
}

// รวมเป็นค่าสะสมรายสัปดาห์ ตั้งแต่สัปดาห์แรกที่มีความเคลื่อนไหวจนถึงสัปดาห์ของ now (สัปดาห์ที่ว่างก็มีจุด)
export function buildGrowth(commits: GrowthCommit[], pulls: GrowthPull[], now = Date.now()): GrowthStats {
    const events: { time: number; kind: 'commit' | 'pr' | 'merged'; author?: string | null }[] = [
        ...commits.map((c) => ({ time: Date.parse(c.date), kind: 'commit' as const, author: c.author })),
        ...pulls.map((p) => ({ time: Date.parse(p.createdAt), kind: 'pr' as const })),
        ...pulls.filter((p) => p.mergedAt).map((p) => ({ time: Date.parse(p.mergedAt as string), kind: 'merged' as const })),
    ]
        .filter((e) => Number.isFinite(e.time) && e.time <= now)
        .sort((a, b) => a.time - b.time);

    const totals = { commits: 0, prs: 0, merged: 0, contributors: 0 };
    const recentFrom = now - 30 * DAY_MS;
    const recent = {
        commits: commits.filter((c) => Date.parse(c.date) >= recentFrom).length,
        prs: pulls.filter((p) => Date.parse(p.createdAt) >= recentFrom).length,
    };
    const points: GrowthPoint[] = [];
    if (!events.length) return { generatedAt: new Date(now).toISOString(), totals, recent, points };

    const authors = new Set<string>();
    let index = 0;
    for (let week = weekStart(events[0].time); week <= weekStart(now); week += 7 * DAY_MS) {
        const end = week + 7 * DAY_MS - BANGKOK_OFFSET_MS;
        for (; index < events.length && events[index].time < end; index++) {
            const event = events[index];
            if (event.kind === 'commit') {
                totals.commits++;
                if (event.author) authors.add(event.author.toLowerCase());
            } else if (event.kind === 'pr') totals.prs++;
            else totals.merged++;
        }
        totals.contributors = authors.size;
        points.push({ week: new Date(week).toISOString().slice(0, 10), ...totals });
    }
    return { generatedAt: new Date(now).toISOString(), totals: { ...totals }, recent, points };
}

@Injectable()
export class GrowthService {
    private readonly logger = new Logger('Growth');
    private cached: GrowthStats | null = null;
    private nextRefreshAt = 0;
    private inFlight: Promise<void> | null = null;

    async stats(): Promise<GrowthStats | null> {
        if (Date.now() >= this.nextRefreshAt) {
            this.inFlight ??= this.refresh().finally(() => (this.inFlight = null));
            // มีข้อมูลเดิมแล้วไม่ต้องรอ — คืนของเดิมไปก่อน แล้วอัปเดตเบื้องหลัง
            if (!this.cached) await this.inFlight;
        }
        return this.cached;
    }

    private async refresh(): Promise<void> {
        try {
            const [commits, pulls] = await Promise.all([
                this.paginate<GithubCommit>(`/repos/${REPO}/commits`),
                this.paginate<GithubPull>(`/repos/${REPO}/pulls?state=all`),
            ]);
            this.cached = buildGrowth(
                commits
                    .filter((c) => c.commit.author?.date && !c.author?.login.endsWith('[bot]'))
                    .map((c) => ({ date: c.commit.author!.date, author: c.author?.login ?? c.commit.author?.email ?? null })),
                pulls.map((p) => ({ createdAt: p.created_at, mergedAt: p.merged_at })),
            );
            this.nextRefreshAt = Date.now() + CACHE_MS;
        } catch (error) {
            this.logger.warn(`ดึงสถิติจาก GitHub ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
            this.nextRefreshAt = Date.now() + RETRY_MS;
        }
    }

    private async paginate<T>(path: string): Promise<T[]> {
        const items: T[] = [];
        const separator = path.includes('?') ? '&' : '?';
        for (let page = 1; page <= MAX_PAGES; page++) {
            const res = await fetch(`https://api.github.com${path}${separator}per_page=100&page=${page}`, {
                headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Bot_NotStack', 'X-GitHub-Api-Version': '2022-11-28' },
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (!res.ok) throw new Error(`GitHub ${res.status} ${path}`);
            const batch = (await res.json()) as T[];
            items.push(...batch);
            if (batch.length < 100) break;
        }
        return items;
    }
}
