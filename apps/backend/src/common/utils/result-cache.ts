// Process-local, bounded cache. Failures are never retained; clearing also fences pending work.
export class ResultCache<T> {
    private readonly values = new Map<string, { value: T; expires: number; bytes: number }>();
    private readonly pending = new Map<string, Promise<T>>();
    private bytes = 0;
    private generation = 0;

    constructor(
        private readonly ttl: number,
        private readonly maxEntries = 64,
        private readonly maxBytes = 16 * 1024 * 1024,
        private readonly sizeOf: (value: T) => number = () => 1,
        private readonly now = Date.now,
    ) {}

    get(key: string, load: () => Promise<T>): Promise<T> {
        for (const [id, entry] of this.values) if (entry.expires <= this.now()) this.remove(id);
        const hit = this.values.get(key);
        if (hit) {
            this.values.delete(key);
            this.values.set(key, hit);
            return Promise.resolve(hit.value);
        }
        const running = this.pending.get(key);
        if (running) return running;
        const generation = this.generation;
        const promise = Promise.resolve()
            .then(load)
            .then((value) => {
                const bytes = this.sizeOf(value);
                if (generation === this.generation && bytes <= this.maxBytes) {
                    this.remove(key);
                    while (this.values.size && (this.values.size >= this.maxEntries || this.bytes + bytes > this.maxBytes))
                        this.remove(this.values.keys().next().value!);
                    this.values.set(key, { value, bytes, expires: this.now() + this.ttl });
                    this.bytes += bytes;
                }
                return value;
            })
            .finally(() => {
                if (this.pending.get(key) === promise) this.pending.delete(key);
            });
        // Bound bookkeeping even during a burst of unique requests.
        if (this.pending.size < this.maxEntries) this.pending.set(key, promise);
        return promise;
    }

    clear(): void {
        this.generation++;
        this.values.clear();
        this.pending.clear();
        this.bytes = 0;
    }

    private remove(key: string): void {
        this.bytes -= this.values.get(key)?.bytes ?? 0;
        this.values.delete(key);
    }
}
