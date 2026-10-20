# Dashboard performance — 2026-10-21

## Changes

- Navigation keeps the application shell, shows a small header progress indicator and never holds ready content behind the previous 300 ms minimum skeleton timer. The pending fallback starts after 250 ms.
- Sidebar and Levels/Audit tab preloads share two speculative job slots. Hover, keyboard focus and touch promote queued work. Jobs deduplicate within a session; unmount/logout cancel queued ownership. Hidden/offline/data-saving/2G conditions and active navigation pause new speculative jobs. A route loader can itself request multiple resources in parallel; the two-slot limit applies to jobs, not all HTTP connections.
- Stable config, XP rules, rank themes/level-up settings, welcome metadata/cards/assets stay fresh for two minutes. Existing save paths update or invalidate their query keys. Live lists/logs keep the short default freshness. Preview query results have 30-second freshness and 60-second garbage collection, rather than the global 15-minute retention.
- Preview endpoints opt into `?compact=1`: WebP quality 85, at most 800 × 1000 pixels with logical drawing coordinates unchanged. Full Discord outputs and legacy API clients retain full-resolution PNGs. The frontend caches Blobs and revokes mounted object URLs. It also accepts legacy JSON/PNG responses for frontend-first rollouts. Welcome variables travel in the exposed `X-Preview-Vars` header.
- Preview caches deduplicate pending renders and retain results for 15 seconds, bounded to 64 entries/16 MiB per controller. Keys include guild, account, linked Discord user/sample, draft, kind and output format; member previews also include the current theme. Guild guards and asset/member checks still execute on cache hits. Rank saves clear cached/pending generations. Asset deletion is validated before reusing cached images. Dynamic Discord/XP data may lag by the short TTL.
- Overview results use a 15-second cache (64 entries/4 MiB) keyed by guild, range, interval, timezone, bot filter and limit. Rolling presets share 15-second buckets; explicit custom boundaries remain exact. Explicit refresh bypasses frontend freshness and clears the process-local stats cache, including pending generations, then recomputes with the current time. The one-year range cap remains enforced.
- Lightweight pending UI and URL parsers remove eager page skeletons and Zod from the initial route graph; form validation still uses the original schemas. Overview charts load near the viewport, retain mounted state and skip chart animations.
- CORS preflights may be cached for 600 seconds with the existing origin/credential rules. Builds with an absolute HTTP(S) `VITE_API_URL` add a credentialed preconnect. Preview/Overview responses expose `Server-Timing`; optional browser diagnostics collect INP/LCP/navigation measurements locally.

## Measurements

Production-build comparison on the same machine, counting only JS/CSS referenced by `index.html` (not fonts, images or later route chunks). The local baseline was captured after the queue/timer commits and before the bundle/preview changes. Byte counts use Node gzip consistently; Vite's display can differ slightly.

| Initial JS/CSS | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Decoded bytes | 783,347 | 659,052 | 15.9% |
| Gzip bytes | 226,272 | 195,084 | 13.8% |

Synthetic renderer fixtures on the local machine, warmed once then median of five runs. The old wire format is gzip-compressed JSON containing PNG/base64; the new format is binary WebP. These do **not** include Discord, database or production network latency.

| Preview | Old wire bytes | New wire bytes | Old render median | New render median |
| --- | ---: | ---: | ---: | ---: |
| Rank | 55,596 | 10,922 | 14.40 ms | 11.42 ms |
| Leaderboard | 228,824 | 37,378 | 53.33 ms | 40.08 ms |
| Level-up | 43,156 | 9,448 | 10.46 ms | 9.94 ms |
| Welcome | 50,072 | 9,962 | 16.38 ms | 12.74 ms |

Wire-size reduction is 78–84%. Warm in-process cache retrieval in these fixtures was 0.006–0.014 ms; this is **not** endpoint response time. Thai text in the compact leaderboard was visually checked.

The preceding live audit found rank preview around 1.26–1.40 s and leaderboard preview around 0.99–2.31 s. Those HTTP observations cannot establish browser INP or rendering latency. Production improvements require a post-deployment measurement. No worker pool, chart-library replacement or speculative SQL/index change was made: local drawing/encoding results do not justify those changes without production stage measurements.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm --filter @notstack/frontend build
node scripts/measure-frontend.mjs
node scripts/benchmark-previews.mjs
# Optional image output directory:
node scripts/benchmark-previews.mjs /tmp/notstack-preview-benchmark
# Optional module/chunk analysis (do not publish this report as a production asset):
ANALYZE=1 pnpm --filter @notstack/frontend build
```

`ANALYZE=1` emits `apps/frontend/dist/bundle-report.json` with chunk imports, dynamic imports and module sizes. Normal builds do not emit it.

Browser diagnostics are enabled in development, or explicitly in production DevTools:

```js
localStorage.setItem('notstack:performance', '1');
location.reload();
// After interacting:
console.table(window.__notstackPerformance);
// Disable and reload:
localStorage.removeItem('notstack:performance');
location.reload();
```

Only 50 samples are retained in memory. Nothing is transmitted. Route templates contain no guild IDs or search text. `navigation-next-frame` measures navigation start through two animation frames after route resolution; it is an approximation, not INP. INP/LCP come from `web-vitals` and reflect the page lifecycle. The `notstack:navigation` User Timing measure is also available in the Performance panel.

Inspect `Server-Timing` on authenticated preview/Overview requests. Preview labels include Discord, DB, image, drawing and encoding work where applicable; stats labels distinguish the four aggregations. Concurrent stage durations can overlap and should not be added together. `total` covers the timed render/cache or aggregation operation, excluding guards and pre-cache authorization/asset checks. Cache hits omit rendering stages. No IDs or query values appear in timing headers.

## Validation and deployment

- 143 unit/regression tests passed, including preload ordering/concurrency/session cancellation, TTL/byte eviction, failure retry, pending-generation invalidation, preview isolation/access checks, binary/legacy compatibility, render output dimensions, Overview filter isolation and refresh range limits.
- Repository lint, all workspace typechecks and production frontend/backend builds passed.
- A read-only localhost fixture served the production frontend with 80 ms JSON responses. Browser checks covered Overview charts, navigation to Levels, theme/level-up tab switching and returning to theme. The Blob image decoded at 800 × 240, and no browser console warnings/errors were observed in that flow. This is a smoke test, not a real-backend end-to-end benchmark.
- Caches are process-local; a restart or another replica starts cold. No database migration is needed. Build/deploy both services to receive all improvements; mixed-version preview responses remain compatible.
- No production deployment or production write was performed for this change. After deployment, measure cold/warm navigation and previews on the actual network/device, including 30/90-day Overview, hidden-tab behavior and logout/account switching. Use those measurements to decide whether further DB or worker-pool work is warranted.
