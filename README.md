<p align="center">
  <br/>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?color=3F51B5&style=for-the-badge&label=License&labelColor=ececec" alt="License: Apache 2.0"></a>
  <a href="https://github.com/NTZ9008/Bot_NotStack/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/NTZ9008/Bot_NotStack/ci.yml?branch=main&style=for-the-badge&label=CI&logo=githubactions&logoColor=000000&labelColor=ececec" alt="CI status"></a>
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A520.19-339933?style=for-the-badge&logo=nodedotjs&logoColor=000000&labelColor=ececec" alt="Node.js 20.19 or later">
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=000000&labelColor=ececec" alt="discord.js v14">
  <br/>
  <br/>
</p>

<p align="center">
  <img src="apps/frontend/public/favicon.svg" width="96" alt="Bot_NotStack logo">
</p>
<h1 align="center">Bot_NotStack</h1>
<h3 align="center">Multi-server Discord bot for voice security, detailed logging, levels with image rank cards<br/>and an AI chat assistant, managed from a web dashboard</h3>

<p align="center">
  <a href="#getting-started">Getting started</a> ·
  <a href="#slash-commands">Commands</a> ·
  <a href="#dashboard-guide">Dashboard guide</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="LICENSE">License</a>
</p>

<br/>

Bot_NotStack started as the house bot of the **NotStackOverflow** Discord community. Anyone can now invite it to their own
server and configure every feature separately through the dashboard.

- **Backend:** NestJS, discord.js 14, Prisma 7 (PostgreSQL) and Google Gemini, in a single process that runs both the bot and the API.
- **Dashboard:** React 19, Vite, TanStack Router, Query, Table and Form, and shadcn/ui (Tailwind CSS v4).

> [!NOTE]
> The bot's Discord messages and the dashboard UI are written in Thai. This README is in English. The detailed
> [XP system guide](docs/xp-system.md) is in Thai.

## Contents

- [Features](#features)
- [Slash commands](#slash-commands)
- [Multi-server support](#multi-server-support)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Dashboard guide](#dashboard-guide)
- [Levels and XP reference](#levels-and-xp-reference)
- [Authentication and security](#authentication-and-security)
- [Contributing](#contributing)
- [Repository activity](#repository-activity)
- [Contributors](#contributors)
- [License and credits](#license-and-credits)

---

## Features

Each server turns each feature on and off on its own **Configuration** page.

### Security and moderation

| Feature             | What it does                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Voice monitor**   | Alerts the security channel when someone changes a voice channel's **bitrate** or **region override**, and names who did it using the audit log. This helps catch people deliberately lagging the server.                                                                                                                                          |
| **Voice Guard**     | Per-channel **whitelist / blacklist** for voice channels. Members who are not allowed in are disconnected, and the bot can tell them why.                                                                                                                                                                                                          |
| **Anti-spam**       | Deletes messages from anyone sending **more than 6 messages in 5 seconds** and alerts the security channel.                                                                                                                                                                                                                                        |
| **Bad-word filter** | Thai profanity filter. Explicit words are deleted at once. "Suspicious" words go to Gemini, which judges them in context and answers only `BAD` or `PASS`. If the AI is unavailable (no key, quota used up or an error), the message is **allowed**: Thai is written without spaces, so substring matching on its own catches many innocent words. |
| **Room Access**     | Gives members access to private channels **permanently or for a limited time**. The bot DMs them 5 minutes before access expires and again when it is revoked. Revoking only removes what the ticket granted, so other overwrites an admin set by hand stay in place.                                                                              |

### AI chat (Google Gemini)

- **Mention the bot** to ask it anything, e.g. `@Bot_NotStack explain black holes briefly`.
- Friendly, slightly cheeky persona. Illegal and 18+ content is refused, and a typing indicator shows while it answers.
- AI answers can never ping users or roles.
- **Quotas:** every Gemini call counts, whether from chat or the bad-word filter.
    - `AI_DAILY_LIMIT` caps calls across all servers (default **250/day**).
    - `AI_GUILD_DAILY_LIMIT` caps each server other than the home server (default **50/day**), so one server cannot use up the shared quota.
    - Counters reset at 00:00 Asia/Bangkok and are stored in the `ai_usage` table, so they survive restarts.

### Levels and rank cards

- XP rules per server for **messages, voice time and bot commands**, with multipliers, chance, cooldowns, daily caps and a configurable level curve.
- **Image rank cards** (`/rank`), an image **leaderboard** and member-customisable cards (`/rankcard`).
- **Level-up announcements** and up to 25 **reward roles**.
- Full XP history, plus admin tools to add, subtract, set or reset XP.
- See [Levels and XP reference](#levels-and-xp-reference) and the full [XP guide](docs/xp-system.md) (Thai).

### Welcome, goodbye and announcements

- Plain-text **welcome / goodbye** messages.
- **Image welcome cards** with a custom background, avatar and up to 12 text layers, edited with a live server-rendered preview.
- **News** page with a Discord-markdown embed editor and live preview.

### Daily weather report

- A scheduled embed for each server built from **OpenWeatherMap** data: temperature, rain chance, humidity, wind, **PM2.5** and more.
- A **forecast chart** and an animated **rain radar map** from RainViewer on OpenStreetMap tiles.
- The same report is available on demand with `/weather`.

### Logging and analytics

- **Log Manager:** per-event Discord log channels (joins and leaves, voice, bans, message edits and deletes, role and channel changes, AutoMod, …) with an appearance editor and filters.
- **Activity Log and Overview:** every captured event is stored in the database and drives charts of joins and leaves, voice activity, the most active members and time spent in voice.
- **Dashboard audit log:** who changed which setting, when and from which IP.
- **Daily log files** for the home server (chat, voice history and special-role requests), viewable by system admins.

### Other

- **PR Bot:** posts GitHub pull-request notifications into Discord and keeps editing the same message as the PR changes: who approved or requested changes, which checks passed or failed, the latest comments, and the merged/closed state. Each server gets its own webhook URL and secret. Subscribe the webhook to Pull requests, Pull request reviews, Pull request review comments, Issue comments, Check runs and Statuses.
- **Polls:** anonymous, one vote per member. Voting again changes your vote.
- **Reaction roles**, **auto-replies** (e.g. `สวัสดีบอท`, "hello bot") and password-protected role claiming for the home server.

---

## Slash commands

| Command                  | Description                                                                                              | Where       |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ----------- |
| `/gethelp`               | Lists the commands available in the current server                                                       | All servers |
| `/botinfo`               | Bot status: uptime, RAM, CPU and OS                                                                      | All servers |
| `/serverinfo`            | Information about the current server                                                                     | All servers |
| `/userinfo [target]`     | Account creation date, join date and roles                                                               | All servers |
| `/ping`                  | Latency check                                                                                            | All servers |
| `/weather [city]`        | Weather report with forecast chart and rain radar (one use per user every 30 seconds)                    | All servers |
| `/poll question choices` | Anonymous poll, one vote per member                                                                      | All servers |
| `/random items`          | Picks one item from a comma-separated list                                                               | All servers |
| `/rank [target]`         | Image rank card: avatar, name, rank, level, XP and progress bar                                          | All servers |
| `/leaderboard [page]`    | Image leaderboard, 10 members per page, with ◀ ▶ buttons (one page change per user every 3 seconds)      | All servers |
| `/rankcard`              | Customise your own rank card: layout, accent colour and background (only you see it)                     | All servers |
| `/xp history [member]`   | Your last 10 XP changes and today's XP against the daily cap. Other members' history needs Manage Server | All servers |
| `/verify`                | Password-protected cohort verification                                                                   | Home server |
| `/addroles`              | Password-protected special roles (VIP card)                                                              | Home server |
| `/setuproles`            | Posts the reaction-role message                                                                          | Home server |
| `/admininfo`             | Developer information                                                                                    | Home server |

- Home-server commands are registered as **guild commands** on `DISCORD_GUILD_ID` only. All other commands are **global**,
  and Discord may take a while to show them in every server.
- `/verify` and `/addroles` read their passwords from `VERIFY_PASSWORD` and `VIP_ROLE_PASSWORD`. If a password is unset, that role cannot be claimed.
  After 5 wrong attempts in 15 minutes the member has to wait before trying again.
- Reaction roles only work on messages created by `/setuproles`.

---

## Multi-server support

- **Every setting is stored per server:** Configuration, Log Manager, Welcome cards and image library, Weather, Room Access, Voice Guard, PR Bot,
  Levels, Activity Log, Overview, and the audit log of setting changes.
- **Adding your own server:** sign in with Discord, open **All servers** and click **Invite bot**. Discord only lists servers where you
  have Manage Server. When you return to the dashboard, the server is in your list.
- **Permissions are checked live through the bot** (cached for one minute). A member needs **Manage Server**, Administrator or ownership:
    - With those permissions you can configure every page of that server.
    - Regular members can only open **Levels**, where they can view the leaderboard and customise their own card.
    - A system `ADMIN` can manage every server the bot is in, even while the bot is offline.
- **New servers start safe.** Chat features that delete messages or reply on their own are **off** until a server admin turns them on:
  anti-spam, the bad-word filter, AI chat and auto-replies. Every log event and the weather report start off too.
- **Removed from a server?** The bot stops working there but keeps the settings in case it is invited back.
- **The home server** (`DISCORD_GUILD_ID`) receives the NotStack-only commands, the daily log files and some legacy defaults.
  If you self-host, set it to your own server ID.

---

## Architecture

The repo is a pnpm workspaces and Turborepo monorepo. The frontend and backend share one package of types and validation rules.

```text
Bot_NotStack/
├── apps/
│   ├── backend/                 NestJS 12 + Prisma 7 (PostgreSQL) + discord.js 14: API and bot in one process
│   │   ├── prisma/              schema.prisma + migrations
│   │   └── src/
│   │       ├── main.ts, app.module.ts
│   │       ├── common/          decorators, DTOs (createZodDto), exceptions, filters, pipes, canvas helpers
│   │       ├── config/          .env validation (zod) and paths
│   │       ├── prisma/          PrismaService
│   │       ├── discord/         the single discord.js Client + @OnDiscord / @SlashCommand decorators
│   │       ├── auth/            Passport strategies (local / jwt / discord) + guards (jwt / roles / csrf / rate limit)
│   │       ├── users/ audit/    dashboard accounts, audit log
│   │       ├── guilds/          multi-server: guild list, GuildAccessGuard (Manage Server check), sync listener
│   │       ├── bot-config/ levels/ rank/ news/ room-access/ voice-guard/ welcome/ weather/ pr-bot/ log-manager/
│   │       │                    one module per feature: *.controller / *.service + dto/ listeners/ tasks/
│   │       ├── chat/            message listeners: anti-spam, bad-word filter, AI chat, auto-reply, reaction roles
│   │       ├── commands/        slash commands (one class per file) + interaction listener
│   │       └── scripts/         deploy-commands.ts
│   └── frontend/                React 19 + Vite + TanStack Router / Query / Table / Form + shadcn/ui (Tailwind v4)
│       ├── wrangler.jsonc       Cloudflare Workers deployment (static assets)
│       └── src/
│           ├── routes/          file-based routes: /servers, /servers/$guildId/*, _admin (Users / System Audit / Bot Logs)
│           ├── api/             TanStack Query hooks per feature (keys start with ['guild', guildId])
│           ├── features/        larger page parts (Welcome, Weather, Levels editors, audit panels)
│           └── components/      ui/ (shadcn) + shared pieces (GuildSwitcher, UserPicker, ChannelSelect, DataTable, …)
├── packages/
│   └── shared/                  @notstack/shared: API types, zod schemas, constants (log and config catalogues, card designs, weather report)
├── docs/                        feature guides
├── tests/                       node:test unit and integration tests
└── ecosystem.config.cjs         PM2 config for the backend
```

- **API:** every route lives under `/api/*` except the GitHub webhook `/webhook/github[/:guildId]`. Routes require a login by default
  (`@Public()` and `@AdminOnly()` mark exceptions per route). The API only uses `GET` and `POST`, because Cloudflare answers `PATCH` and `DELETE` with 403.
- **Validation:** DTOs are generated from zod schemas in `@notstack/shared` (`class XxxDto extends createZodDto(schema)`), and a global
  `ZodValidationPipe` validates bodies and queries. The dashboard forms use the same schemas.
- **Discord:** event handlers are methods on Nest providers, decorated with `@OnDiscord(Events.X)` under `listeners/`, so dependency injection works everywhere.
  Slash commands are `@SlashCommand()` classes with a `static data` builder, which means they can be registered without a database connection.
- **Frontend:** built as static files and deployed to Cloudflare Workers, with `/api/*` and `/webhook/*` routed to the backend on the same domain
  so cookies and Origin checks work unchanged. In development, Vite (`:5173`) proxies `/api` to the backend (`:3035`).

### Main dependencies

- **Backend:**
    - `@nestjs/*` (core, config, schedule, passport, jwt, serve-static) and passport (local, jwt, custom)
    - discord.js
    - prisma, `@prisma/client` and `@prisma/adapter-pg`
    - `@google/generative-ai`
    - `@napi-rs/canvas` for welcome cards, rank cards, charts and radar maps (prebuilt binaries, no system packages needed)
    - gifenc for radar GIFs, and cron for per-server weather schedules
    - bcryptjs, helmet, express-rate-limit and zod
- **Frontend:**
    - React, `@tanstack/react-router`, `@tanstack/react-query`, `@tanstack/react-table` and `@tanstack/react-form`
    - shadcn/ui (Radix UI and Tailwind CSS v4)
    - recharts, sonner and lucide-react

---

## Getting started

### Prerequisites

- **Node.js 20.19+ or 22.12+** and **pnpm 10** (`corepack enable pnpm` or `npm i -g pnpm`)
- **PostgreSQL** (CI runs version 18)
- A **Discord application** with a bot token and the **Message Content** and **Server Members** privileged intents enabled
- Optional: a [Google Gemini](https://ai.google.dev/) API key for AI chat and the bad-word filter, and an
  [OpenWeatherMap](https://openweathermap.org/api) API key (the free tier is enough) for weather

### 1. Install dependencies

```bash
pnpm install
```

This also runs `prisma generate`. The client is generated into `apps/backend/src/generated`.

### 2. Configure `.env` at the repo root

```bash
cp .env.example .env
```

At minimum, set `TOKEN`, `DATABASE_URL`, `JWT_SECRET` and `DASHBOARD_URL`. See [Environment variables](#environment-variables) for the full list.

> [!TIP]
> If the password in `DATABASE_URL` contains special characters such as `@ # / : ?`, URL-encode them first (`#` → `%23`, `@` → `%40`).

### 3. Create the database tables

```bash
pnpm db:migrate
```

### 4. Build and register slash commands

```bash
pnpm build
```

```bash
pnpm discord:deploy-commands
```

Global commands can take a while to appear in Discord. Home-server commands replace the existing guild commands, so nothing shows up twice.

### 5. Run the bot and API

```bash
pnpm start
```

Or run it under PM2 with `pm2 start ecosystem.config.cjs`. The API listens on `http://localhost:3035/api`.
The dashboard is normally deployed separately. To serve it from the backend on the same port instead, set `FRONTEND_DIST=../frontend/dist`.

### 6. Invite the bot

Open the dashboard, go to **All servers** and click **Invite bot**. The invite link already requests everything the bot needs:

- View Audit Log, Move Members, Manage Roles, Manage Messages
- Manage Channels (Room Access) and Manage Server (invite tracking in Log Manager)
- Attach Files (welcome cards, weather charts and rank cards) and Embed Links (weather report)
- Privileged intents (enable them in the Developer Portal): **Message Content** and **Server Members**

---

## Environment variables

All variables live in `.env` at the repo root. To override some of them for the backend only, create `apps/backend/.env`; values in that file win.
The dashboard does not read `.env`. See [`.env.example`](.env.example) for the annotated template.

| Variable                                        | Required    | Description                                                                                                                                                                                   |
| ----------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TOKEN`                                         | For the bot | Discord bot token. Leave it empty to run only the API, without logging the bot in.                                                                                                            |
| `DISCORD_CLIENT_ID`                             |             | The bot's application ID                                                                                                                                                                      |
| `DISCORD_GUILD_ID`                              |             | Home server ID, which gets the NotStack-only commands. Self-hosters should set their own.                                                                                                     |
| `DATABASE_URL`                                  | Yes         | PostgreSQL connection string                                                                                                                                                                  |
| `JWT_SECRET`                                    | Yes         | At least 32 characters. With `NODE_ENV=production` the server refuses to start without it. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `DASHBOARD_URL`                                 | Yes         | Public dashboard URL, used for CSRF origin checks and as the redirect after Discord login                                                                                                     |
| `NODE_ENV`, `PORT`                              |             | Environment and API port (default `3035`)                                                                                                                                                     |
| `CORS_ORIGINS`                                  |             | Comma-separated dashboard origins when the dashboard runs on a different subdomain. Wildcards work (`https://*.example.com`) but do not match the apex domain itself.                         |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`              |             | Used only to create the first `ADMIN` account. `ADMIN_PASSWORD` is a **bcrypt hash**.                                                                                                         |
| `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` |             | Discord OAuth2 login. Leave them empty to hide the "Sign in with Discord" button. Other people need Discord login to add their own servers.                                                   |
| `ADMIN_DISCORD_IDS`                             |             | Comma-separated Discord IDs that become `ADMIN` on first sign-in                                                                                                                              |
| `GEMINI_KEY`                                    |             | Google Gemini key for AI chat and the bad-word filter                                                                                                                                         |
| `AI_DAILY_LIMIT`, `AI_GUILD_DAILY_LIMIT`        |             | Daily Gemini quotas for all servers combined (default 250) and for each non-home server (default 50)                                                                                          |
| `OPENWEATHER_KEY`                               |             | OpenWeatherMap key. The free tier covers `weather`, `forecast`, `air_pollution` and `geo`.                                                                                                    |
| `VERIFY_PASSWORD`, `VIP_ROLE_PASSWORD`          |             | Passwords for `/verify` and `/addroles`. Unset means the role cannot be claimed.                                                                                                              |
| `GITHUB_WEBHOOK_SECRET`                         |             | Secret for the legacy `/webhook/github` endpoint, which posts to the home server. Other servers use their own URL and secret from the PR Bot page.                                            |
| `AUDIT_LOG_RETENTION_DAYS`                      |             | Days to keep the dashboard audit log (default 180)                                                                                                                                            |
| `ACTIVITY_LOG_RETENTION_DAYS`                   |             | Days to keep Discord activity events (default 90)                                                                                                                                             |
| `LOG_DIR`, `LOG_RETENTION_DAYS`                 |             | Folder for daily log files (default `<repo>/logs`) and days to keep them (default 30)                                                                                                         |
| `FRONTEND_DIST`                                 |             | Serve a built dashboard from the backend, e.g. `../frontend/dist`                                                                                                                             |

Dashboard build variable: `VITE_API_URL`. Set it only when the API is on a different subdomain from the dashboard.

---

## Development

```bash
pnpm dev
```

Turborepo starts three processes together:

- `packages/shared` (`tsc --watch`)
- the backend (`nest start --watch`, port 3035)
- the dashboard (Vite, `http://localhost:5173`, with hot reload)

> [!WARNING]
> **`pnpm dev` reads the same `.env` as production.** If `.env` holds the real `TOKEN` or `DATABASE_URL`, the real bot logs in and
> connects to the real database. For development, create `apps/backend/.env` (it overrides the root file) with an empty `TOKEN=` and the
> `DATABASE_URL` of a test database.

- With no `TOKEN`, only the API starts. This is the easiest way to work on the dashboard.
- Type-check everything with `pnpm typecheck`, and build everything with `pnpm build`.
- To add a shadcn/ui component: `cd apps/frontend && pnpm dlx shadcn@latest add <component>`
- To create a migration after editing `schema.prisma`: `cd apps/backend && pnpm exec prisma migrate dev --name <name>`.
  **Never run this against a production database.** Use a throwaway PostgreSQL instance.

---

## Testing

| Command                 | What it does                                                                                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`             | ESLint: catches bugs the type checker misses, such as unused variables and React hooks rules                                                                                                                                                                                            |
| `pnpm format`           | Prettier, using `.prettierrc.json`                                                                                                                                                                                                                                                      |
| `pnpm test`             | Builds the backend, then runs the unit tests. `pnpm test:unit` skips the build.                                                                                                                                                                                                         |
| `pnpm test:integration` | XP and PR statistics integration tests against a temporary PostgreSQL cluster on loopback. It runs every migration and tests concurrency, caps, CRUD, rollback and API permissions, then removes the cluster. It needs `initdb`, `pg_ctl` and `createdb` on `PATH` and never touches your `DATABASE_URL`. |

The unit tests cover:

- anti-spam and AI quotas
- the bad-word filter
- Room Access
- session cleanup
- XP formulas and rules
- `/verify`, `/poll`, `/gethelp` and `/weather`
- reaction roles, log files and voice logs
- the health check
- rank card themes, member permissions, the card renderer and the leaderboard
- level-up announcements and reward roles
- `/xp history`
- dashboard helpers

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs typecheck, lint, build and unit tests on every pull request.
It then runs migrations against a PostgreSQL service, checks that the schema matches the migrations and runs the database tests.
No test logs the bot in or sends anything to Discord.

---

## Deployment

### Backend (GitHub Actions)

Run **Actions → Deploy BotNotStack** by hand from `main` or a `release/*` branch.

1. CI builds `@notstack/backend` and `@notstack/shared` and bundles only the files the server needs (the dashboard is not included).
2. The bundle is uploaded with `rsync --delete` over Tailscale and SSH. The upload leaves the server's own files alone: `.env`, `node_modules`,
   `logs/`, `database.sqlite` and `prbot/`. The running version is first backed up to `BotNotStack-prev`, and the rollback steps are in
   [`deploy.yml`](.github/workflows/deploy.yml).
3. The server then runs these steps in order:
    1. `pnpm --filter '@notstack/backend...' install --prod`
    2. `pnpm db:migrate`
    3. `pnpm discord:deploy-commands`
    4. `pm2 startOrReload ecosystem.config.cjs`
4. The job polls `GET /api/health` and fails, printing PM2 logs, if there is no 200 within 60 seconds.
   The endpoint needs no login. It returns 200 when the API and database are up and 503 when the database is unreachable, so you can also point uptime monitors at it.

Required secrets in the `prod` environment: `TAILSCALE_AUTHKEY`, `SERVER_HOST`, `SERVER_USER` and `SERVER_SSH_KEY`.
Also add `SERVER_SSH_KNOWN_HOSTS` (the verified output of `ssh-keyscan <host>`) so the job checks the server's host key strictly.
Deploys work without it, but print a warning.

### Dashboard (Cloudflare Workers)

- Cloudflare builds and deploys the dashboard itself, not GitHub Actions. Connect the repository in **Cloudflare Workers & Pages**
  with the root directory set to `apps/frontend`. [`wrangler.jsonc`](apps/frontend/wrangler.jsonc) runs `pnpm build` and serves `dist/`
  with an SPA fallback.
- In Cloudflare, route `/api/*` and `/webhook/*` on the dashboard domain to the backend.
  To put the API on another subdomain instead, set `VITE_API_URL` as a Cloudflare build variable and `CORS_ORIGINS` on the backend.
  Both must share a parent domain, because cookies are `SameSite`.
- Security and cache headers live in `apps/frontend/public/_headers`.

### Upgrading from v3.x

- Your existing `.env` on the server keeps working. `rsync --delete` replaces the old single-app files but keeps the paths listed above.
- ⚠️ The `multi_guild` migration changes the primary keys of several tables and **cannot be reversed**. Run `pg_dump` before the first deploy.
  All existing data is moved to the home server (`DISCORD_GUILD_ID`).

---

## Dashboard guide

### Navigation

- **Sidebar:** a server switcher at the top (switching servers keeps you on the same page), then that server's pages grouped into Overview,
  Bot management and Data & history. Below them are the global pages: All servers, Users, System Audit, Bot Logs and My Account.
  On small screens the sidebar becomes a drawer (☰).
- **Top bar:** shows the current page and has a page search (`Ctrl/⌘ + K`, which understands Thai and English names) and the profile menu.
- Pages you are not allowed to open are hidden from the menu and from search.
- **Pick members by name.** Every member field (Room Access, Voice Guard, Log Manager filters) is a searchable picker.
  You can still paste a raw user ID, for example for someone who has left the server.
- Use the shadcn/ui components in `apps/frontend/src/components/ui` and the colour tokens in `apps/frontend/src/index.css` for new pages.

### Configuration, Room Access, Voice Guard and PR Bot

- **Configuration:** choose channels from dropdowns (log, security alert, welcome, goodbye, news, general) and toggle the chat features.
  Changes save immediately.
- **Room Access:** each server chooses which channels use the ticket system.
- **Voice Guard:** whitelist and blacklist voice channels, with optional notifications.
- **PR Bot:** each server has its own webhook URL and secret, which you can copy or regenerate from the page.
  The notification-frequency chart shows daily totals or the distribution by hour of day over 7, 30 or 90 calendar days, including today, in Asia/Bangkok.
  Counts distinguish sent notifications (opened, reopened, ready for review), merge updates and close updates. Only successful Discord sends/edits count;
  repeated close updates for the same message are counted once. Data starts accumulating after this version is deployed; old notifications are not backfilled.
  Run `pnpm db:migrate` before starting the updated backend to create `pr_notifications`. The chart refreshes every minute.

### News

- A formatting toolbar for Discord markdown: bold, italic, underline, strikethrough, headings, quotes, lists, code, code blocks, spoilers and links.
  Shortcuts: `Ctrl/⌘ + B / I / U`.
- A **live embed preview** beside the editor.
- A custom embed colour (or the colour of the news type), footer text and image.
- Discord renders embed titles as plain text, so the page shows a reminder under the title field.

### Welcome cards

The image cards are separate from the plain-text welcome message (`WELCOME_CHANNEL_ID`), and both can run at once.
Send them to different channels if you do not want new members greeted twice.

- **Multiple cards.** Create, duplicate, delete and toggle them, each with its own channel. A new member receives every enabled card; bots do not.
- **Background:** upload PNG, JPG, WEBP or GIF up to 8 MB into the server's image library (shared by all of that server's cards), or use a solid colour.
  You can choose cover, contain or stretch, and add blur and a tint overlay. Images are stored in the database (`welcome_assets`), so deploys do not lose them.
- **Avatar:** show or hide it, and set its shape (circle, rounded or square), size, position and border.
- **Text layers:** up to 12, each with its own font (Kanit, Prompt or Noto Sans Thai), weight, size, colour, alignment, position, letter spacing, outline and shadow.
  Long names shrink to fit, and emoji render.
- **Variables:** `{user}` `{username}` `{mention}` `{server}` `{memberCount}` `{id}`. A `{mention}` in the message text really pings the new member.
  The bot can only ping that member and roles typed into the message, never `@everyone`.
- **Live preview:** cards are rendered on the server with the same code as the real message. You can drag the avatar and text anchors,
  preview the card as another member, and **send a test** to a real channel using unsaved values.
- Save with **Save** (`Ctrl/⌘ + S`). Enable/disable toggles save immediately.
- The bot needs **View Channel, Send Messages and Attach Files** in the target channel. The page warns if any are missing.

### Weather report

Each server has its own report (location, time and channel). New servers start with it turned off.

- **Report embed:** a title linking to OpenWeatherMap, the date and conditions, and data fields three per row.
  The forecast chart and rain radar come after the fields. With both enabled, the radar goes in a second embed.
- **Data fields**, chosen and ordered by you:
    - temperature, feels-like and 24-hour high/low
    - rain chance and amount
    - humidity and wind
    - **PM2.5**, with levels from Thailand's Pollution Control Department
    - sunrise and sunset
    - cloud cover, visibility and pressure
- **Forecast chart:** temperature line, rain-chance bars and weather emoji every 3 hours. Choose a 12, 24, 36 or 48-hour range,
  a light or dark theme and the line colour. It is rendered with `@napi-rs/canvas`.
- **Rain radar map** from [RainViewer](https://www.rainviewer.com/api.html) (free, no key) on a greyscale OpenStreetMap base,
  with a location pin and an intensity legend.
    - An animated GIF of the last hour or a still PNG of the latest frame, at regional, medium or close range, in a light or dark theme.
    - It shows **rain that has already fallen, not a forecast**: RainViewer no longer offers future frames. Zoom is capped at level 7, so the edges blur at close range.
    - If the radar cannot be fetched, the report is still sent without it, and the preview shows a warning.
    - Map tiles for a location are cached for a day, following the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
      The image carries the "© OpenStreetMap contributors" and RainViewer credits, which must not be removed.
- **Schedule:** always in Thai time (Asia/Bangkok) regardless of the server's timezone, on the weekdays you choose.
- **Location:** search by Thai or English name, or paste coordinates from Google Maps. You can set a custom display name.
- **Text:** the title, description, footer and accompanying message accept
  `{location}` `{date}` `{time}` `{icon}` `{condition}` `{temp}` `{max}` `{min}` `{rain}`, and can ping roles (never `@everyone`).
- **Live preview** with real weather data, and a **send test** button that uses unsaved values.
- **`/weather`** returns the same report using the saved fields, chart and radar, but without the accompanying message.
    - With no `city`, it uses the server's report location.
    - With a name or coordinates, it shows that place in the same format. In DMs it uses the default format.
- **Retries:** if a scheduled send fails because the API is down or the network drops, the bot retries after 1 and 5 minutes.
  The page shows the next send time and the result of the last send, including the reason for a failure.
- The bot needs **View Channel, Send Messages, Embed Links and Attach Files** in the target channel.

### Log Management

- **Appearance:**
    - a compact or comfortable layout
    - toggles for detail icons, the ID field, avatars and timestamps
    - a detail length of 250, 500 or 1,024 characters
    - footer text
    - a live preview of three sample events

    **Save appearance** applies it to every new log in that server, and unsaved edits survive tab switches.
    The appearance is stored in `log_options` under the `APPEARANCE` key, so no migration is needed. Servers that never set it keep their existing colours, channels and toggles.

- **Events and channels:**
    - search event types
    - filter to enabled events or events with no channel yet
    - toggle each event, pick its channel and set its colour

    Changes save automatically.

- **Filters:** exclude channels, members, roles or bots, and turn activity recording on or off.

Logs separate short facts from multi-line details and show message edits as before/after. Shortening or hiding fields in the embed does not change what the Activity Log stores.

### Overview and Activity Log

Every event Log Manager captures is **always stored in `activity_events`**, even when no Discord log channel is set. That covers:

- member joins and leaves, voice joins and leaves
- kicks and bans, deleted and edited messages
- channel and role changes, AutoMod
- messages sent and bot commands used (who, where and when, never the message content)

The dashboard shows this data on two tabs:

- **Overview:** charts of server joins and leaves and of voice joins and leaves; the most active members by events, messages, voice joins and commands;
  and time in voice per member and per channel, worked out by pairing joins with leaves.
  Choose 24 hours, 7, 30 or 90 days, or a custom range of up to a year, with hourly or daily buckets, and choose whether to include bots.
- **Audit & Activity:**
    - **Dashboard changes** to the server's settings, kept for 180 days. System admins see every server, logins and user management under **System Audit**.
    - **Discord events**, searchable by type, time, name, channel or user ID. Each entry shows who acted and the stated reason.
      Events are kept for 90 days (`ACTIVITY_LOG_RETENTION_DAYS`).

> [!TIP]
> Turn recording off under **Log Management → Filters → Record every event to the database**. The channel, member and role exclusions apply to the Activity Log too.

### Log files (system admins)

- Daily files in `logs/` are named by the Thai-time date. They hold home-server chat, voice joins and leaves, and special-role requests, and you can read them on the **Bot Logs** page.
- Files are kept for `LOG_RETENTION_DAYS` (default 30) and older ones are deleted on startup and every 6 hours. For files over 2 MB, the page shows only the tail.
- Other servers' chat is never written to files. Use their Activity Log or Log Manager instead.
- If voice logging is enabled in Log Manager, the legacy `LOG_CHANNEL_ID` channel does not also receive voice join and leave messages.

---

## Levels and XP reference

The full guide covers settings, formulas, CRUD examples, the API, the data model and limits. It is in Thai: [docs/xp-system.md](docs/xp-system.md).

The **Levels** page has seven tabs: Leaderboard, My card, Card theme, Level-up & reward roles, XP rules & rates, Manage members and History.
Members can view the leaderboard and customise their own card. Everything else needs **Manage Server** or the system `ADMIN` role.

### Rules

- **Activity rules:** add, view, edit, duplicate, delete, reorder and toggle rules for messages, voice and bot commands. Each server can have up to 50.
- **Rates:**
    - an XP range per award
    - per-rule and server-wide multipliers (100% is normal, 150% is ×1.5)
    - a 0–100% chance
    - a cooldown and a daily cap
- **Targeting:** limit a rule to chosen channels, categories or roles; exclude channels or roles; restrict command names; or set a minimum message length.
- **Voice:** a minimum number of people in the channel, and optionally no XP while muted, deafened or AFK. Voice is checked every 15 seconds,
  and the rule's cooldown decides whether XP is due.
- **Level curve:** minimum total XP for a level is `ceil(curveBase × level^curveExponent)`. The default is `100 × level²`.
  Changing the curve keeps everyone's XP and recalculates levels everywhere.
- **Members:** add, subtract or set XP, reset someone to zero, remove them from the leaderboard or reset the whole server.
  Every action takes a reason and a confirmation. A removed member can still earn XP again.
- **History:** activity and admin edits are kept for 90 days, with a member filter and pagination. The leaderboard is paginated server-side.

### How XP is calculated

- The bot picks a random integer in the rule's range, multiplies it by the rule and server multipliers, and rounds down.
  For example, 20 XP × 150% × 200% = 60 XP.
- All matching rules **stack in the displayed order** until the cap is reached.
- A rule with no channels or roles selected applies everywhere and to everyone. With several roles listed, any one of them is enough.
- A cap of `0` means no custom cap; a system limit of 2,000,000,000 XP still applies. Days start at **00:00 Asia/Bangkok**.
- The cooldown starts on every eligible attempt, even when the chance roll gives nothing, so retrying cannot beat the chance roll.
- Defaults keep the original rates: messages give 15–25 XP every 60 seconds and voice gives 5–10 XP every 60 seconds. Command rules must be added by hand.
- Bots and webhooks never earn message XP. A command counts when its handler finishes without throwing, which is not the same as the command succeeding.
- Admin grants do not use up the activity cap. Resetting or removing a member keeps today's used cap and cooldown.

### Consistency

- XP, cooldowns, caps and history are written in **one transaction** under a PostgreSQL advisory lock.
- Awarding or editing XP locks only that member, so different members can earn XP at the same time.
- Editing rules or resetting the whole server locks the whole server and waits for pending awards to finish.
- Nothing is buffered in memory, so stale totals never overwrite new ones, and data survives restarts.
- Rule edits check a revision number, so two admins cannot overwrite each other.
- Rules and the last-attempt time are cached in memory to skip messages that are still on cooldown without opening a transaction. The database still has the final say.

### Rank cards and level-ups

- **Card theme (admins):**
    - three layouts: Classic, Profile and Minimal
    - a solid, gradient or image background (from the same library as welcome cards), with blur and dimming
    - accent, text and XP-bar colours, the font, the avatar shape and which fields to show
    - live previews of `/rank`, `/leaderboard` and the level-up card
- **What members may customise** is set by the admin:
    - everything on or off
    - the layout
    - colours
    - which backgrounds are allowed (members cannot upload their own)

    Member choices the theme no longer allows are ignored when the card is drawn.

- **Level-up announcements:** sent when a level rises from activity (chat, voice or commands), to the current channel (or a fallback channel if
  that fails), a chosen channel or DMs. Templates support `{mention} {user} {level} {previousLevel} {server} {roles}` and can attach a level-up card.
  Admin XP edits never announce.
- **Reward roles:** up to 25 roles, either **stacked** or **highest only**, applied on level up and level down (including admin edits).
  The bot only manages roles in the reward list and skips roles above its own or managed by integrations; the page warns about both.
  **Apply to existing members** syncs roles for everyone who already has XP, in the background. Resetting server XP or changing the curve does not resync roles automatically, so use this button afterwards.

### API

- `GET /api/guilds/:guildId/levels?page=1&pageSize=25[&userId=…][&q=…]` returns `{ items, total, page, pageSize, settings, searchLimited }`.
  `q` searches by Discord ID or name prefix. Name search uses at most 100 results from Discord, and `searchLimited` tells you when that limit was hit.
- Management routes:
    - `/levels/settings` (GET/POST)
    - `/levels/members` (POST) takes `userId`, `action` (`add | subtract | set | reset | delete`), `amount` and `reason`
    - `/levels/reset` (POST) requires `confirmation: "RESET XP"`
    - `/levels/history` (GET)
- Rank cards are under `/api/guilds/:guildId/rank-card/*`. Admin routes are `theme`, `preview`, `level-up` and `level-up/sync`.
  Member routes are `meta`, `me`, `me/preview`, `me/reset` and `backgrounds/:id/image`. Previews are limited to 90 per minute.
- Run `pnpm db:migrate` before starting a new backend version. XP migrations only add tables and indexes; they never delete XP.

---

## Authentication and security

- **Two ways to sign in:** username and password (bcrypt), or **Discord OAuth2**. Both can be linked to one account under My Account.
- **Sessions:** a 15-minute JWT access token and a 7-day refresh token that rotates on every use, both in httpOnly cookies.
  Reusing an old refresh token is treated as theft and signs that user out everywhere.
- **Roles:**
    - `USER` manages servers where their linked Discord account has Manage Server.
    - `ADMIN` manages every server, plus **Users**, **System Audit** and **Bot Logs**.
- **Passport strategies:** `LocalStrategy` (username/password), `JwtStrategy` (access-token cookie) and `DiscordStrategy` (OAuth callback).
- **Protections:**
    - accounts lock for 15 minutes after 5 failed logins
    - rate limits per IP
    - an Origin check on every mutating request (CSRF)
    - `helmet` headers
    - GitHub webhooks verified by HMAC
- **Audit log:** logins, logouts and every dashboard change (who, what, IP and previous value) are kept for 180 days.

### Setting up accounts

1. Run `pnpm db:migrate`.
2. Set `JWT_SECRET` (32+ characters).
3. Start the bot. If there is no `ADMIN` yet, one is created from `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
   Change the password afterwards under My Account. Later edits to `.env` do not affect an account that already exists.
4. Optional Discord login: in the Discord Developer Portal, open your app's **OAuth2** settings.
    1. Add the redirect `https://<dashboard-domain>/api/auth/discord/callback`.
    2. Set `DISCORD_CLIENT_SECRET` and `DISCORD_REDIRECT_URI`. `DISCORD_CLIENT_ID` defaults to the bot's application ID.
    3. First-time Discord users get the `USER` role. Promote them on the **Users** page or list their IDs in `ADMIN_DISCORD_IDS`.

---

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the branch flow, the checks to run and what a pull request should include.

---

## Repository activity

<p align="center">
  <a href="https://github.com/NTZ9008/Bot_NotStack/graphs/commit-activity"><img src="https://img.shields.io/github/commit-activity/m/NTZ9008/Bot_NotStack?style=for-the-badge&labelColor=ececec&color=E8590C&label=commits" alt="Commits per month"></a>
  <a href="https://github.com/NTZ9008/Bot_NotStack/commits"><img src="https://img.shields.io/github/last-commit/NTZ9008/Bot_NotStack?style=for-the-badge&labelColor=ececec&color=E8590C&label=last%20commit" alt="Last commit"></a>
  <a href="https://github.com/NTZ9008/Bot_NotStack/pulls?q=is%3Apr+is%3Aclosed"><img src="https://img.shields.io/github/issues-pr-closed/NTZ9008/Bot_NotStack?style=for-the-badge&labelColor=ececec&color=9C36B5&label=pull%20requests" alt="Closed pull requests"></a>
  <a href="https://github.com/NTZ9008/Bot_NotStack/issues"><img src="https://img.shields.io/github/issues/NTZ9008/Bot_NotStack?style=for-the-badge&labelColor=ececec&color=1C7ED6&label=issues" alt="Open issues"></a>
  <a href="https://github.com/NTZ9008/Bot_NotStack/graphs/contributors"><img src="https://img.shields.io/github/contributors/NTZ9008/Bot_NotStack?style=for-the-badge&labelColor=ececec&color=2F9E44&label=contributors" alt="Contributors"></a>
</p>

See [Insights → Pulse](https://github.com/NTZ9008/Bot_NotStack/pulse) for the full activity breakdown.

## Contributors

<a href="https://github.com/NTZ9008/Bot_NotStack/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=NTZ9008/Bot_NotStack" alt="Contributors" />
</a>

- **Arlif Thongrakjan** ([@NTZ9008](https://github.com/NTZ9008)): creator, AT Tech
- **Thanapat Julakarn** ([@boatngin](https://github.com/boatngin)): core contributor
- Everyone in the [contributors list](https://github.com/NTZ9008/Bot_NotStack/graphs/contributors)

---

## License and credits

Bot_NotStack is open source under the **[Apache License 2.0](LICENSE)**.

You may use, modify and redistribute it, including commercially, **as long as you keep the credit**:

- Keep the [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) files in any copy or fork you distribute.
- Keep the existing copyright and attribution notices in the source.
- Mark files you changed as modified.

If you run your own instance, we would appreciate a visible credit such as:

> Based on [Bot_NotStack](https://github.com/NTZ9008/Bot_NotStack) by Arlif Thongrakjan (AT Tech) and contributors.

Third-party credits:

- UI components generated from [shadcn/ui](https://ui.shadcn.com) (MIT).
- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) and radar data from [RainViewer](https://www.rainviewer.com).
- Fonts Kanit, Prompt, Noto Sans Thai and Noto Color Emoji (SIL Open Font License) via `@expo-google-fonts`.
