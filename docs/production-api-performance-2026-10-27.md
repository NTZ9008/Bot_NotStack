# Production API performance audit — 2026-10-27

Measured from the local test client through HTTPS/Cloudflare. Completed: Tuesday, 27 October 2026 at 15:44:47 GMT+7.

Frontend: https://bntdash.arlifzs.com/

Backend used by the deployed frontend bundle: https://notstackutdash.arlifzs.com/

## Scope and interpretation

- 158 measured backend requests, 76 endpoint/query/preview/scenario combinations, three guilds; all returned HTTP 200. Login is included; cleanup logout and browser traffic are excluded.
- Main guild: 65 members, 24 leaderboard rows, four configured Room Access rooms. Other guilds have only 3 and 2 members and many empty lists; they are controls, not comparable load fixtures.
- Primarily sequential requests, usually two observations per path; targeted endpoints have more repeats. One page-shaped batch had three concurrent GET requests. No stress/load saturation test.
- Read endpoints plus preview-only POSTs; no settings, XP, permissions, messages, payments or tickets were changed. Normal authentication sessions were created and cleaned up.
- API times run from fetch start through reading the complete response body. TTFB is also retained in the JSON. These are not browser navigation/LCP/INP timings.
- First means first observed in this audit, not a verified empty backend cache. No production restart/cache flush occurred. Repeats may cross cache expiry boundaries; initial slowness alone does not prove its root cause.
- Bytes are decoded response bytes, not compressed wire size. Small sample counts do not support p95/p99 or capacity claims.
- Browser smoke check confirmed successful login, Overview and Levels rendering. No comprehensive browser waterfall was captured.
- Deployed API reports version 4.1.0. No production deployment occurred; local performance patches are not proven deployed by that version number.

## Findings, highest priority first

1. **Room Access: consistently slow.** GET `/api/guilds/:guildId/room-access` took 3548 ms initially, then 2076, 1911 and 1574 ms. The page-shaped three-request batch took 3320 ms, gated by this endpoint. Local source forces a Discord channel refresh for every configured room and originally awaits rooms/users sequentially. Existing local bounded-concurrency and per-request user deduplication changes target this path directly. No stage timing is exposed here yet, so Discord attribution remains a code-supported inference. Preserve fresh permission checks.
2. **Levels: large first-observed delay.** GET `/api/guilds/:guildId/levels?page=1&pageSize=25` took 8195 ms, then 585, 203 and 355 ms. It returns only 24 rows / about 2.2 KB. Slow response is before headers, not a large payload transfer. Local code awaits Discord profile resolution when cache entries are missing; cache-warming is a plausible explanation, not confirmed without internal timings. Deploy the local worker scheduling/query overlap improvements, then measure again; consider separating optional display-name enrichment from the critical leaderboard data path if cold latency persists.
3. **Weather preview: large first-observed delay.** POST `/api/guilds/:guildId/weather/preview` took 8388 ms, then 292 and 328 ms for the same saved draft. About 77 KB decoded JSON. The endpoint awaits weather retrieval and chart/radar rendering before responding. Existing caches explain a possible fast repeat, but absent Server-Timing prevents distinguishing provider/radar/render cost. Add separate weather, chart and radar timings before selecting a fix; progressive optional radar loading is a candidate.
4. **Image previews: first-use cost, fast cache hits.** Leaderboard preview 2331 → 898 ms; welcome 1627 → 527 → 182 ms; rank 1038 → 631 → 173 ms. Leaderboard timed total was 697.2 ms; image work reports 4142.9 ms summed across concurrent jobs, which is not wall time. Keep image caching/deduplication and investigate cold image retrieval before changing drawing architecture.
5. **Overview is not the main API bottleneck for this dataset.** Thirty-day responses: 297, 376, 395 and 127 ms. Uncached timed totals: 12.6, 10.5 and 8.7 ms; cached total 0 ms. Ninety-day response 356 ms, timed total 135.6 ms. No evidence here supports new heavy DB indexing as the first fix.
6. **Most configuration/list endpoints are much faster.** Typically roughly 0.1–0.6 s, with occasional spikes. A cache-hit preview can still spend hundreds of milliseconds outside the timed section. Network/proxy/guards/authorization are included in HTTP time but not fully in Server-Timing; do not label that whole gap as database latency.

## Next actions

- Deploy the already-reviewed local Room Access / Levels / Voice Guard improvements through the normal deployment process, then rerun the same URLs and saved preview variants. This audit does not deploy them.
- Add Server-Timing to Levels and Room Access (DB, channel refresh, profile resolution) and Weather preview (provider fetch, chart, radar) to distinguish stages.
- Prioritize repeated Room Access latency, then avoid holding first-load Levels/Weather UI behind optional external data. Preserve authorization and guild isolation.
- Compare from the same client/network and add server-side latency histograms for meaningful production percentiles.

## Complete request observations

Times below are milliseconds. Separate scenario rows are intentional. SSE time is time to first chunk, then the stream was cancelled.

| Request | N | First | Min | Max | All times (ms) |
|---|---:|---:|---:|---:|---|
| `POST preview only /api/guilds/{main-guild}/weather/preview` | 3 | 8388 | 292 | 8388 | 8388, 292, 328 |
| `GET /api/guilds/{main-guild}/levels?page=1&pageSize=25` | 4 | 8195 | 203 | 8195 | 8195, 585, 203, 355 |
| `GET /api/guilds/{main-guild}/room-access` | 4 | 3548 | 1574 | 3548 | 3548, 2076, 1911, 1574 |
| `GET /api/guilds/{main-guild}/room-access [room-page-concurrency-3]` | 1 | 3320 | 3320 | 3320 | 3320 |
| `POST preview only /api/guilds/{main-guild}/rank-card/preview?compact=1 [leaderboard]` | 2 | 2331 | 898 | 2331 | 2331, 898 |
| `POST preview only /api/guilds/{main-guild}/welcome/preview?compact=1` | 3 | 1627 | 182 | 1627 | 1627, 527, 182 |
| `GET /api/guilds/{main-guild}/room-access/rooms [room-page-concurrency-3]` | 1 | 1163 | 1163 | 1163 | 1163 |
| `GET /api/guilds/{main-guild}/channels [room-page-concurrency-3]` | 1 | 1163 | 1163 | 1163 | 1163 |
| `POST /api/auth/login` | 1 | 1055 | 1055 | 1055 | 1055 |
| `POST preview only /api/guilds/{main-guild}/rank-card/preview?compact=1 [rank]` | 3 | 1038 | 173 | 1038 | 1038, 631, 173 |
| `GET /api/guilds/{guild-2}/whitelist` | 2 | 873 | 328 | 873 | 873, 328 |
| `GET /api/guilds/{main-guild}/levels?q=boat&page=1&pageSize=25` | 2 | 530 | 530 | 858 | 530, 858 |
| `GET /api/guilds` | 3 | 428 | 171 | 775 | 428, 775, 171 |
| `GET /api/admin/audit-logs` | 2 | 615 | 228 | 615 | 615, 228 |
| `GET /api/health` | 2 | 598 | 374 | 598 | 598, 374 |
| `GET /api/guilds/{main-guild}/jira/settings` | 2 | 590 | 455 | 590 | 590, 455 |
| `GET /api/guilds/{main-guild}/config` | 2 | 196 | 196 | 579 | 196, 579 |
| `GET /api/guilds/{main-guild}/room-access/rooms` | 2 | 531 | 372 | 531 | 531, 372 |
| `GET /api/guilds/{main-guild}/funds/1` | 2 | 526 | 187 | 526 | 526, 187 |
| `GET /api/guilds/{guild-2}/levels?page=1&pageSize=25` | 2 | 526 | 120 | 526 | 526, 120 |
| `GET /api/guilds/{main-guild}/whitelist` | 4 | 181 | 140 | 502 | 181, 502, 140, 163 |
| `GET /api/guilds/{main-guild}/welcome/meta` | 2 | 500 | 206 | 500 | 500, 206 |
| `GET /api/guilds/{main-guild}/activity?limit=50` | 2 | 486 | 122 | 486 | 486, 122 |
| `GET /api/guilds/{main-guild}/activity/stats?hours=720&tz=Asia%2FBangkok` | 4 | 297 | 127 | 395 | 297, 376, 395, 127 |
| `GET /api/guilds/{guild-2}/jira/tickets` | 2 | 149 | 149 | 393 | 149, 393 |
| `GET /api/guilds/{main-guild}/members/search?q=boat` | 2 | 383 | 383 | 383 | 383, 383 |
| `GET /api/guilds/{guild-2}/funds` | 2 | 373 | 130 | 373 | 373, 130 |
| `GET /api/guilds/{guild-3}/whitelist` | 2 | 362 | 144 | 362 | 362, 144 |
| `GET /api/guilds/{main-guild}/activity/stats?hours=2160&tz=Asia%2FBangkok` | 1 | 356 | 356 | 356 | 356 |
| `GET /api/guilds/{main-guild}/audit-logs` | 2 | 350 | 216 | 350 | 350, 216 |
| `POST preview only /api/guilds/{main-guild}/rank-card/preview?compact=1 [levelup]` | 2 | 181 | 181 | 341 | 181, 341 |
| `GET /api/guilds/{main-guild}/rank-card/meta` | 2 | 339 | 204 | 339 | 339, 204 |
| `GET /api/guilds/{main-guild}/rank-card/me` | 2 | 338 | 127 | 338 | 338, 127 |
| `GET /api/guilds/{guild-2}` | 2 | 328 | 112 | 328 | 328, 112 |
| `GET /api/guilds/{main-guild}/audit-logs/actions` | 2 | 314 | 198 | 314 | 314, 198 |
| `GET /api/guilds/{main-guild}/funds` | 2 | 309 | 133 | 309 | 309, 133 |
| `GET /api/version` | 2 | 263 | 263 | 306 | 263, 306 |
| `GET /api/guilds/{main-guild}/levels/settings` | 2 | 305 | 155 | 305 | 305, 155 |
| `GET /api/guilds/{guild-2}/room-access` | 2 | 177 | 177 | 300 | 177, 300 |
| `GET /api/guilds/{main-guild}/jira/tickets` | 2 | 297 | 129 | 297 | 297, 129 |
| `GET /api/guilds/{main-guild}/rank-card/level-up` | 2 | 259 | 259 | 278 | 259, 278 |
| `GET /api/admin/users` | 2 | 269 | 120 | 269 | 269, 120 |
| `GET /api/guilds/{main-guild}/weather/meta` | 2 | 265 | 124 | 265 | 265, 124 |
| `GET /api/guilds/{main-guild}/activity/stats?hours=24&tz=Asia%2FBangkok` | 2 | 262 | 184 | 262 | 262, 184 |
| `GET /api/auth/me` | 2 | 247 | 197 | 247 | 247, 197 |
| `GET /api/guilds/{guild-3}/levels?page=1&pageSize=25` | 2 | 246 | 138 | 246 | 246, 138 |
| `GET /api/guilds/{guild-3}/jira/tickets` | 2 | 243 | 183 | 243 | 243, 183 |
| `GET /api/guilds/{main-guild}/voice-channels` | 2 | 223 | 119 | 223 | 223, 119 |
| `GET /api/guilds/{main-guild}/welcome/cards` | 2 | 222 | 195 | 222 | 222, 195 |
| `GET /api/guilds/{main-guild}/activity/meta` | 2 | 220 | 127 | 220 | 220, 127 |
| `GET /api/growth` | 2 | 214 | 135 | 214 | 214, 135 |
| `GET /api/guilds/{main-guild}/levels/history` | 2 | 211 | 127 | 211 | 211, 127 |
| `GET /api/guilds/{guild-3}` | 2 | 114 | 114 | 207 | 114, 207 |
| `GET /api/guilds/{main-guild}/levels?page=2&pageSize=25` | 2 | 198 | 198 | 204 | 198, 204 |
| `GET /api/guilds/{main-guild}/pr-bot/settings` | 2 | 194 | 194 | 201 | 194, 201 |
| `GET /api/guilds/{guild-2}/activity/stats?hours=720&tz=Asia%2FBangkok` | 2 | 164 | 164 | 201 | 164, 201 |
| `GET /api/logs/2026-10-27_history.log` | 2 | 180 | 180 | 197 | 180, 197 |
| `GET /api/guilds/{main-guild}/rank-card/theme` | 2 | 172 | 172 | 196 | 172, 196 |
| `GET /api/guilds/{main-guild}/activity/stats?hours=168&tz=Asia%2FBangkok` | 2 | 166 | 166 | 194 | 166, 194 |
| `GET /api/guilds/{main-guild}/pr-bot/stats?days=30` | 2 | 194 | 117 | 194 | 194, 117 |
| `GET /api/guilds/{main-guild}/levels?q={user-id}&page=1&pageSize=25` | 2 | 168 | 168 | 190 | 168, 190 |
| `GET /api/guilds/{guild-3}/funds` | 2 | 116 | 116 | 188 | 116, 188 |
| `GET /api/guilds/{main-guild}/roles` | 2 | 136 | 136 | 186 | 136, 186 |
| `GET /api/guilds/{guild-3}/activity/stats?hours=720&tz=Asia%2FBangkok` | 2 | 168 | 168 | 186 | 168, 186 |
| `GET /api/guilds/{main-guild}/weather/settings` | 2 | 183 | 129 | 183 | 183, 129 |
| `GET /api/guilds/{guild-3}/room-access` | 2 | 162 | 162 | 180 | 162, 180 |
| `GET /api/logs` | 2 | 167 | 124 | 167 | 167, 124 |
| `GET /api/admin/audit-logs/actions` | 2 | 147 | 147 | 166 | 147, 166 |
| `GET /api/guilds/{main-guild}/welcome/assets` | 2 | 166 | 125 | 166 | 166, 125 |
| `GET /api/guilds/{main-guild}/weather/locations?q=Bangkok` | 2 | 163 | 145 | 163 | 163, 145 |
| `GET /api/guilds/{main-guild}/channels` | 2 | 152 | 127 | 152 | 152, 127 |
| `GET /api/guilds/{main-guild}/log-settings` | 2 | 151 | 124 | 151 | 151, 124 |
| `GET /api/logs/2026-10-27.log` | 2 | 141 | 122 | 141 | 141, 122 |
| `GET /api/guilds/{main-guild}/blacklist` | 2 | 134 | 118 | 134 | 134, 118 |
| `GET /api/guilds/{main-guild}` | 2 | 131 | 119 | 131 | 131, 119 |
| `GET /api/live?guild={main-guild}` | 1 | 122 | 122 | 122 | 122 |

Raw timing-only data: `production-api-performance-2026-10-27.json`. Credentials, cookies, response payloads and user profile data are omitted.
