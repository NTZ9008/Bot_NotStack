// Bounded sliding window: only the latest limit + 1 timestamps are needed.
export class SpamWindow {
    private readonly entries = new Map<string, number[]>();

    constructor(
        private readonly limit: number,
        private readonly windowMs: number,
    ) {}

    check(key: string, now = Date.now()): { blocked: boolean; warn: boolean } {
        const recent = (this.entries.get(key) ?? []).filter((at) => now - at < this.windowMs);
        const wasBlocked = recent.length > this.limit;
        recent.push(now);
        this.entries.set(key, recent.slice(-(this.limit + 1)));
        if (this.entries.size > 1000) {
            for (const [id, times] of this.entries) {
                if (now - times[times.length - 1]! >= this.windowMs) this.entries.delete(id);
            }
        }
        return { blocked: recent.length > this.limit, warn: !wasBlocked && recent.length > this.limit };
    }
}
