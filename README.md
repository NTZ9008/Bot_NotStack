# Bot_NotStack

### Discord Security & Utility Bot

**Bot_NotStack** คือบอท Discord อเนกประสงค์ที่พัฒนาโดย **Arlif Thongrakjan**  
โดดเด่นด้าน **ระบบความปลอดภัยห้องเสียง**, **ระบบ Log ขั้นสูง** และ **AI Chat Assistant ภายในเซิร์ฟเวอร์**  
รองรับ **หลายเซิร์ฟเวอร์** — ใครก็เชิญบอทเข้าเซิร์ฟเวอร์ของตัวเอง แล้วตั้งค่าผ่าน Dashboard ได้แยกกันทุกอย่าง  
พัฒนาด้วย **NestJS** + **Discord.js v14** + **Prisma (PostgreSQL)** + **Google Gemini AI** และหน้า Dashboard ด้วย **React + TanStack + shadcn/ui**

---

## ความสามารถหลัก (Key Features)

### ระบบรักษาความปลอดภัย (Security Systems)

ระบบทั้งหมดทำงานแบบ **Real-time** (โค้ดอยู่ใน `apps/backend/src/chat`) — เปิด/ปิดแยกต่อเซิร์ฟเวอร์ได้ที่หน้า Configuration

#### Bitrate Monitor1

- แจ้งเตือนเมื่อมีการแอบปรับ Bitrate ห้องเสียง\
  (ช่วยป้องกันการก่อกวนหรือทำให้เซิร์ฟเวอร์แลค)

#### Region Monitor

- แจ้งเตือนเมื่อมีการเปลี่ยน **Server Region**
- แจ้งเตือนเมื่อมีการเปลี่ยน **Voice Channel Region Override**

#### Anti-Spam System

- จำกัดการส่งข้อความ: **6 ข้อความ / 5 วินาที**
- ลบข้อความสแปมอัตโนมัติ พร้อมแจ้งเตือน

#### Bad Word Filter

---

### 🧠 AI Chat System (Gemini AI)

### ระบบบันทึกข้อมูล (Logging Systems)

#### วิธีใช้งาน

เพียง **แท็กบอทในข้อความ** เช่น  
@Bot_NotStack อธิบายเรื่อง Black Hole แบบสั้นๆ

#### ความสามารถ

- ตอบคำถามทั่วไป
- โทนเป็นกันเอง กวนเล็กน้อย
- จำกัดเนื้อหาผิดกฎหมายและ 18+ อัตโนมัติ
- แสดงสถานะ "กำลังพิมพ์..." ก่อนตอบ

#### ระบบจำกัดโควตา

- ใช้ได้ประมาณ **250 ครั้ง / วัน**
- รีเซ็ตอัตโนมัติทุกวัน
- หากเกินโควตา บอทจะแจ้งเตือนว่าหมดสิทธิ์ใช้งาน AI ชั่วคราว

---

### คำสั่งของบอท (Slash Commands)

#### หมวด Admin / System

คำสั่ง ความสามารถ

---

`/botinfo` แสดงสถานะบอท (Uptime, RAM, CPU, OS)
`/serverinfo` แสดงข้อมูลเซิร์ฟเวอร์
`/userinfo` ข้อมูลผู้ใช้ (วันที่สมัคร, วันที่เข้าเซิร์ฟ, Role)
`/ping` ทดสอบ Latency
`/admininfo` ข้อมูลผู้พัฒนา

#### หมวด Utility

---

#### หมวด Verification & Roles

**Admin/System:** `/botinfo` • `/serverinfo` • `/userinfo` • `/ping` • `/admininfo`  
**Utility:** `/weather` • `/poll` • `/random`  
**Roles:** `/verify` • `/addroles`

> `/verify` `/addroles` `/setuproles` `/admininfo` เป็นคำสั่งเฉพาะของเซิร์ฟเวอร์ NotStack (`DISCORD_GUILD_ID`) — ลงทะเบียนเป็น guild command
> ที่เซิร์ฟเวอร์หลักที่เดียว ส่วนคำสั่งอื่นเป็น global command ใช้ได้ทุกเซิร์ฟเวอร์ที่เชิญบอท

---

### ระบบอัตโนมัติอื่น ๆ

- **Auto Reply** --- ตอบข้อความอัตโนมัติ เช่น "สวัสดีบอท",
  "หิวข้าว"
- **Daily Weather Report** --- รายงานสภาพอากาศประจำวันแบบ embed พร้อมกราฟพยากรณ์และแผนที่เรดาร์ฝน
  ตั้งเวลา ห้อง สถานที่ และข้อมูลที่แสดงได้จาก Dashboard (ดูหัวข้อ **หน้า Weather** ด้านล่าง)
- **Welcome / Goodbye System** --- ต้อนรับสมาชิกใหม่
  และแจ้งเตือนเมื่อมีคนออก
- **Welcome Announcement (การ์ดรูปภาพ)** --- ส่งรูปต้อนรับที่มีพื้นหลัง รูปโปรไฟล์ และชื่อสมาชิก
  ตั้งค่าทั้งหมดจาก Dashboard (ดูหัวข้อ **หน้า Welcome** ด้านล่าง)

---

## 🏗️ สถาปัตยกรรม (Architecture)

Monorepo แบบ **pnpm workspaces + Turborepo** แยก frontend / backend ชัดเจน และแชร์ type + กฎตรวจข้อมูลชุดเดียวกัน

```
BOT_NOTSTACK/
├── apps/
│   ├── backend/                 ← NestJS 12 + Prisma 7 (PostgreSQL) + discord.js 14 — API และบอทในโปรเซสเดียว
│   │   ├── prisma/              ← schema.prisma + migrations
│   │   └── src/
│   │       ├── main.ts / app.module.ts
│   │       ├── common/          ← decorators / dto (createZodDto) / exceptions / filters / interfaces / pipes / utils
│   │       ├── config/          ← ตรวจ .env (zod) + path ต่างๆ
│   │       ├── prisma/          ← PrismaService
│   │       ├── discord/         ← Client ตัวเดียวของระบบ + decorators (@OnDiscord / @SlashCommand) + interfaces
│   │       ├── auth/            ← Passport strategies (local / jwt / discord) + guards (jwt-auth / roles / csrf / rate-limit) + dto
│   │       ├── users/           ← บัญชีผู้ใช้ Dashboard + /api/admin/users
│   │       ├── audit/           ← audit log (middleware + interceptor) + /api/admin/audit-logs
│   │       ├── guilds/          ← 🏰 multi-server: รายการเซิร์ฟเวอร์ + GuildAccessGuard (ตรวจสิทธิ์ Manage Server) + sync listener
│   │       ├── bot-config/ levels/ news/ room-access/ voice-guard/ welcome/ weather/ pr-bot/ log-manager/
│   │       │                    ← แต่ละโมดูล: *.controller / *.service + dto/ listeners/ tasks/ (ตามที่มี)
│   │       ├── chat/            ← listeners ของข้อความ: Anti-Spam, กรองคำหยาบ (Gemini), AI Chat, ตอบกลับอัตโนมัติ, reaction roles
│   │       ├── commands/        ← คำสั่ง / (slash/ คลาสละไฟล์) + interaction listener
│   │       └── scripts/         ← deploy-commands.ts
│   └── frontend/                ← React 19 + Vite + TanStack Router / Query / Table / Form + shadcn/ui (Tailwind v4)
│       ├── wrangler.jsonc       ← deploy ไป Cloudflare Workers (static assets)
│       └── src/
│           ├── routes/          ← file-based routes: /servers (เลือกเซิร์ฟเวอร์), /servers/$guildId/* (หน้าของเซิร์ฟเวอร์),
│           │                      _admin (ADMIN เท่านั้น: Users / System Audit / Bot Logs)
│           ├── api/             ← query/mutation ของ TanStack Query แยกตามหมวด (key ขึ้นต้นด้วย ['guild', guildId])
│           ├── features/        ← ชิ้นส่วนของหน้าที่ซับซ้อน (Welcome / Weather editor, Audit panels)
│           └── components/      ← ui/ (shadcn) + ส่วนกลาง (GuildSwitcher, UserPicker, ChannelSelect, DataTable ...)
├── packages/
│   └── shared/                  ← @notstack/shared: type ของ API, zod schema, ค่าคงที่ (แคตตาล็อก Log / Config, ดีไซน์การ์ด, รายงานอากาศ)
├── ecosystem.config.cjs         ← PM2 (backend)
└── turbo.json / pnpm-workspace.yaml / tsconfig.base.json
```

- **Backend** — ทุก route อยู่ใต้ `/api/*` ยกเว้น GitHub webhook `/webhook/github[/:guildId]`; ทุก route ต้อง login โดยค่าเริ่มต้น
  (`@Public()` / `@AdminOnly()` กำหนดเป็นราย route) และใช้แค่ `GET`/`POST` เพราะ Cloudflare ตอบ 403 กับ `PATCH`/`DELETE`
- **การตรวจข้อมูล** — DTO สร้างจาก zod schema ใน `@notstack/shared` (`class XxxDto extends createZodDto(schema)`) แล้ว
  `ZodValidationPipe` (global) ตรวจ body / query ให้ — schema ชุดเดียวกันใช้ตรวจฟอร์มในหน้าเว็บด้วย
- **Discord** — event handler เป็นเมธอดใน provider ของ Nest (`@OnDiscord(Events.X)` ในโฟลเดอร์ `listeners/`) จึงใช้ dependency injection ได้เต็มที่;
  คำสั่ง `/` เป็นคลาส `@SlashCommand()` ที่มี `static data` (ลงทะเบียนได้โดยไม่ต้องต่อฐานข้อมูล)
- **Frontend** — build เป็นไฟล์ static แล้ว deploy ไป Cloudflare Workers; ส่ง `/api/*` และ `/webhook/*` ต่อให้ backend ที่ Cloudflare
  (โดเมนเดียวกัน → cookie / การตรวจ Origin ทำงานแบบเดิม) — ตอน dev ใช้ Vite (`:5173`) ที่ proxy `/api` ไป backend (`:3035`)

## 🏰 หลายเซิร์ฟเวอร์ (Multi-server)

- ทุกการตั้งค่าแยกตามเซิร์ฟเวอร์: Configuration, Log Management, Welcome (การ์ด + คลังรูป), Weather, Room Access, Voice Guard,
  PR Bot, Levels, Activity Log / Overview และ audit log ของการตั้งค่า
- **เพิ่มเซิร์ฟเวอร์ของตัวเอง:** เข้าสู่ระบบด้วย Discord → หน้า **เซิร์ฟเวอร์ทั้งหมด** → **เชิญบอท** (Discord ให้เลือกได้เฉพาะเซิร์ฟเวอร์ที่มีสิทธิ์ Manage Server)
  กลับมาที่หน้าเว็บ เซิร์ฟเวอร์จะขึ้นในรายการเอง
- **สิทธิ์:** ตรวจสดจากตัวบอททุกครั้ง (cache 1 นาที) ว่าบัญชี Discord ที่เชื่อมไว้มีสิทธิ์ **Manage Server** / Administrator / เป็นเจ้าของเซิร์ฟเวอร์ไหม
  - มีสิทธิ์ → ตั้งค่าได้ทุกหน้าของเซิร์ฟเวอร์นั้น · เป็นสมาชิกธรรมดา → ดูได้แค่ Levels
  - `ADMIN` ของระบบจัดการได้ทุกเซิร์ฟเวอร์ที่บอทอยู่ (รวมถึงตอนบอทออฟไลน์)
- เซิร์ฟเวอร์ใหม่เริ่มต้นแบบปลอดภัย: ความสามารถในแชทที่ลบข้อความ/ตอบเอง (Anti-Spam, กรองคำหยาบภาษาไทย, AI Chat, ตอบกลับอัตโนมัติ)
  **ปิดไว้ก่อน** ทุก log event ปิด และรายงานสภาพอากาศปิด — แอดมินของเซิร์ฟเวอร์เปิดเองที่หน้า Configuration
- ข้อมูลเดิมก่อนรองรับหลายเซิร์ฟเวอร์ถูกย้ายเป็นของเซิร์ฟเวอร์หลัก (`DISCORD_GUILD_ID`) ทั้งหมดด้วย migration `multi_guild`
  (ไม่มีข้อมูลหาย แต่ย้อนกลับไปใช้โค้ดเวอร์ชันก่อนไม่ได้ — **สำรองฐานข้อมูลด้วย `pg_dump` ก่อน deploy ครั้งแรก**)
- ถูกเตะออกจากเซิร์ฟเวอร์ → หยุดทำงานในเซิร์ฟเวอร์นั้น แต่เก็บการตั้งค่าไว้ เผื่อเชิญกลับมาใหม่

## 🚀 การติดตั้ง (Installation Guide)

ต้องใช้ **Node.js 20.19+ / 22.12+** และ **pnpm 10** (`corepack enable pnpm` หรือ `npm i -g pnpm`)

### 1️⃣ ติดตั้งแพ็กเกจ

```bash
pnpm install
```

(รัน `prisma generate` ให้อัตโนมัติ — client ถูกสร้างที่ `apps/backend/src/generated`)

### 2️⃣ ตั้งค่าไฟล์ `.env` ที่ root ของ repo

ดูตัวอย่างทั้งหมดใน `.env.example` — ค่าหลักคือ `TOKEN`, `DATABASE_URL`, `JWT_SECRET`, `DASHBOARD_URL`, `OPENWEATHER_KEY`, `GEMINI_KEY`
และ `DISCORD_CLIENT_SECRET` / `DISCORD_REDIRECT_URI` (ต้องมีถ้าจะให้คนอื่นเพิ่มเซิร์ฟเวอร์ของตัวเอง)

> ถ้ารหัสผ่านใน `DATABASE_URL` มีอักขระพิเศษ (เช่น `@ # / : ?`) ต้อง URL-encode ก่อน เช่น `#` → `%23`, `@` → `%40`

### 3️⃣ สร้างตารางใน PostgreSQL

```bash
pnpm db:migrate
```

### 4️⃣ Build และลงทะเบียนคำสั่ง `/`

```bash
pnpm build
```

```bash
pnpm discord:deploy-commands
```

คำสั่งทั่วไปลงทะเบียนแบบ global (ขึ้นในทุกเซิร์ฟเวอร์ — Discord อาจใช้เวลาสักพัก) ส่วนคำสั่งเฉพาะ NotStack ลงทะเบียนที่เซิร์ฟเวอร์หลัก
(guild command เดิมของเซิร์ฟเวอร์หลักถูกแทนที่ คำสั่งจึงไม่ขึ้นซ้ำ 2 อัน)

### 5️⃣ รันบอท + API (production)

```bash
pnpm start
```

หรือใช้ PM2: `pm2 start ecosystem.config.cjs` — API อยู่ที่ `http://localhost:3035/api`
(หน้า Dashboard deploy แยก — หรือตั้ง `FRONTEND_DIST=../frontend/dist` ให้ backend เสิร์ฟหน้าเว็บเองที่พอร์ตเดียวกัน)

## 🧑‍💻 พัฒนา (Development)

```bash
pnpm dev
```

รัน 3 อย่างพร้อมกันผ่าน Turborepo: `packages/shared` (tsc --watch), backend (`nest start --watch`, พอร์ต 3035)
และหน้าเว็บ (Vite, `http://localhost:5173` — แก้แล้วเห็นผลทันที)

> ⚠️ `pnpm dev` อ่าน `.env` เหมือน production — ถ้า `.env` มี `TOKEN` / `DATABASE_URL` ของจริง บอทจริงจะ login และต่อฐานข้อมูลจริง
> ตอนพัฒนาให้สร้าง `apps/backend/.env` (ไฟล์นี้ชนะ `.env` ที่ root) ใส่ `TOKEN=` ว่าง และ `DATABASE_URL` ของฐานข้อมูลทดสอบ

- ไม่ใส่ `TOKEN` = เปิดแค่ API บอทไม่ login (เหมาะกับการแก้หน้าเว็บ)
- ตรวจ type ทั้ง repo: `pnpm typecheck` · build ทั้งหมด: `pnpm build`
- เพิ่มคอมโพเนนต์ shadcn/ui: `cd apps/frontend && pnpm dlx shadcn@latest add <ชื่อคอมโพเนนต์>`
- แก้ `schema.prisma` แล้วสร้าง migration: `cd apps/backend && pnpm exec prisma migrate dev --name <ชื่อ>`
  (**ห้ามรันกับฐานข้อมูลจริง** — ใช้ Postgres สำหรับทดสอบ)

## 🏆 Levels & XP ที่ตั้งค่าได้ต่อเซิร์ฟเวอร์

คู่มือฉบับเต็ม: [รายละเอียดระบบ XP ทั้งหมด](docs/xp-system.md) — การตั้งค่า สูตร ตัวอย่าง CRUD, API, โครงสร้างข้อมูล และข้อจำกัด

หน้า **Levels** มี 4 แท็บ: อันดับสมาชิก, กฎและอัตรา XP, จัดการสมาชิก, ประวัติ
สมาชิกทั่วไปดูอันดับได้ ส่วนการตั้งค่า/แก้ XP/ดูประวัติต้องมี **Manage Server** หรือเป็น ADMIN ของระบบ

- **กฎกิจกรรม:** เพิ่ม/อ่าน/แก้/คัดลอก/ลบ/เรียงลำดับ/เปิด–ปิดกฎ สำหรับข้อความ ห้องเสียง และคำสั่งบอท ได้สูงสุด 50 กฎต่อเซิร์ฟเวอร์
- **อัตรา XP:** กำหนดช่วง XP ต่อครั้ง, ตัวคูณรายกฎและทั้งเซิร์ฟเวอร์ (100% = ปกติ, 150% = 1.5 เท่า), โอกาสได้รับ 0–100%, cooldown และเพดานรายวัน
- **กลุ่มเป้าหมาย:** ให้เฉพาะห้อง/หมวด/ยศที่เลือก, ยกเว้นห้อง/ยศ, จำกัดชื่อคำสั่ง และตั้งความยาวข้อความขั้นต่ำได้
- **ห้องเสียง:** ตั้งจำนวนคนขั้นต่ำ และเลือกไม่ให้ XP เมื่อปิดไมค์/ปิดหูฟัง/อยู่ AFK ได้ ตรวจทุก 15 วินาทีแล้วใช้ cooldown ของกฎตัดสินว่าให้ XP ได้หรือยัง
- **สูตรเลเวล:** XP สะสมขั้นต่ำ = `ceil(curveBase × level^curveExponent)` ค่าเดิมคือ `100 × level²` เปลี่ยนสูตรแล้ว XP เดิมยังอยู่ และคำนวณเลเวลใหม่ทั้ง Dashboard และ `/rank`
- **สมาชิก:** เพิ่ม/ลด/กำหนด XP, รีเซ็ตเป็นศูนย์, ลบออกจากอันดับ หรือรีเซ็ตทั้งเซิร์ฟเวอร์ พร้อมเหตุผลและกล่องยืนยัน การลบไม่ห้ามรับ XP ใหม่
- **ประวัติ:** เก็บกิจกรรมและการแก้ไขโดยผู้ดูแล 90 วัน มีตัวกรองสมาชิกและแบ่งหน้า อันดับแบ่งหน้าฝั่ง API ไม่โหลดรายชื่อทั้งหมดพร้อมกัน

**วิธีคิด:** สุ่มจำนวนเต็มในช่วง XP แล้วคูณตัวคูณรายกฎและทั้งเซิร์ฟเวอร์ จากนั้นปัดลง เช่น 20 XP × 150% × 200% = 60 XP
กฎที่ตรงเงื่อนไข **รวมกันตามลำดับที่แสดง** จนถึงเพดาน; ไม่เลือกห้อง/ยศ = ทุกห้อง/ทุกคน; ยศหลายรายการใช้เงื่อนไขมียศใดยศหนึ่ง
เพดาน `0` = ไม่ตั้งเพดานเอง (ระบบจำกัดยอด/โควตาที่ 2,000,000,000 XP); โควตาวันใหม่เริ่มเวลา **00:00 Asia/Bangkok**
Cooldown เริ่มทุกครั้งที่มีสิทธิ์สุ่ม แม้สุ่มไม่ได้ XP เพื่อป้องกันการยิงคำขอซ้ำจนผ่านโอกาสสุ่ม

ค่าเริ่มต้นคงอัตราเดิม: ข้อความ 15–25 XP/60 วินาที และเสียง 5–10 XP/60 วินาที; กฎคำสั่งต้องเพิ่มเอง
บอทและ webhook ไม่ได้ XP ข้อความ ส่วนคำสั่งนับเมื่อ handler ทำงานจบโดยไม่ throw (ไม่ใช่การตรวจผลสำเร็จเชิงธุรกิจของแต่ละคำสั่ง)
การเพิ่ม XP โดยผู้ดูแลไม่กินโควตากิจกรรม และการรีเซ็ต/ลบสมาชิกคงโควตาที่ใช้แล้วกับ cooldown ของวันนี้ไว้

XP, cooldown, โควตา และประวัติเขียนใน transaction เดียว โดยใช้ PostgreSQL advisory lock ต่อเซิร์ฟเวอร์
ไม่ค้างยอดใน memory จึงไม่มีการ save ยอดเก่าทับยอดใหม่ ข้อมูลยังอยู่หลังรีสตาร์ต และการแก้กฎตรวจ revision เพื่อกันผู้ดูแลสองคนเขียนทับกัน

**API:** `GET /api/guilds/:guildId/levels?page=1&pageSize=25[&userId=...][&q=...]` คืน `{items,total,page,pageSize,settings,searchLimited}`
ค้นหาด้วย Discord ID หรือต้นชื่อผ่าน `q` ได้ โดยการค้นหาชื่อใช้ผลจาก Discord สูงสุด 100 คนและแจ้งเมื่อถึงขีดจำกัด; อันดับยังเป็นอันดับรวมของเซิร์ฟเวอร์
รูปแบบใหม่นี้แทน array เดิม ต้องอัปเดต backend และ frontend รุ่นนี้คู่กัน
เส้นทางจัดการอยู่ใต้ `/levels/settings` (GET/POST), `/levels/members` (POST), `/levels/reset` (POST), `/levels/history` (GET)
การแก้สมาชิกรับ `userId`, `action` (`add|subtract|set|reset|delete`), `amount`, `reason`; รีเซ็ตทั้งเซิร์ฟเวอร์ต้องส่ง `confirmation: "RESET XP"`

**Migration:** รัน `pnpm db:migrate` ก่อนเริ่ม backend รุ่นใหม่ เพื่อเพิ่ม `xp_settings`, `xp_progress`, `xp_daily`, `xp_history` และ index อันดับ
migration ไม่ลบ XP เดิม หน้าอันดับคำนวณเลเวลจาก XP เพื่อแก้ข้อมูลเลเวลเก่าที่คลาดเคลื่อนด้วย

### การทดสอบ

- `pnpm test` — build และทดสอบ Anti-Spam, การถอนสิทธิ์หมดอายุ, การล้าง session และสูตร/กฎ XP
- `pnpm test:integration` — ต้องมี PostgreSQL binaries (`initdb`, `pg_ctl`, `createdb`) ใน PATH; สร้าง cluster ชั่วคราวบน loopback,
  รัน migration ทุกตัว และทดสอบ concurrency, caps, CRUD, rollback และสิทธิ์ HTTP API แล้วปิด/ลบ cluster ให้เอง ไม่ใช้ `DATABASE_URL` ของแอป
- CI ใช้ PostgreSQL service แยกสำหรับชุดทดสอบเดียวกัน ทั้งสองชุดไม่ login บอทหรือส่งข้อความไป Discord

## 📦 Deploy

GitHub Actions → **Deploy BotNotStack** ใช้ deploy backend แบบ manual จาก branch `main` / `release/*` ส่วน frontend deploy แยกผ่าน Cloudflare Workers

**backend** → เซิร์ฟเวอร์ของบอท

1. build `@notstack/backend` + `@notstack/shared` ใน CI แล้วรวมเฉพาะไฟล์ที่ต้องใช้ (ไม่มีหน้าเว็บ)
2. `rsync --delete` ขึ้นเซิร์ฟเวอร์ (ไม่แตะ `.env`, `node_modules`, `logs/`, `database.sqlite`, `prbot/` ฝั่งเซิร์ฟเวอร์)
3. บนเซิร์ฟเวอร์: `pnpm --filter '@notstack/backend...' install --prod` → `pnpm db:migrate` → PM2 เริ่มใหม่จาก `ecosystem.config.cjs`

**frontend** → Cloudflare Workers (`apps/frontend/wrangler.jsonc`, ไฟล์ static + SPA fallback)

- ต้องตั้ง GitHub secrets `CLOUDFLARE_API_TOKEN` (สิทธิ์ Workers Scripts: Edit) และ `CLOUDFLARE_ACCOUNT_ID`
- routing ตั้งเองที่ Cloudflare: ให้ `/api/*` และ `/webhook/*` ของโดเมน Dashboard ไปที่ backend
  (หรือวาง API ไว้คนละ subdomain แล้วตั้ง Actions variable `VITE_API_URL` + `CORS_ORIGINS` ใน `.env` ของ backend — ต้องเป็นโดเมนเดียวกัน เพราะ cookie เป็น SameSite · เปิดทุก subdomain ได้ด้วย `CORS_ORIGINS=https://*.example.com`)
- header ความปลอดภัย / cache ของหน้าเว็บอยู่ใน `apps/frontend/public/_headers`

> อัปเกรดจากรุ่นก่อน (v3.6 แบบไฟล์เดียว): ไฟล์ `.env` บนเซิร์ฟเวอร์ใช้ต่อได้เลย — workflow ลบไฟล์ของรุ่นเก่าและโปรเซส PM2 เดิมให้เอง
> ⚠️ migration `multi_guild` เปลี่ยน primary key หลายตาราง (ย้อนกลับไม่ได้) — `pg_dump` ฐานข้อมูลก่อน deploy ครั้งแรก

---

## 🖥️ หน้าตา Dashboard

- **เมนูซ้าย (sidebar)** — ด้านบนเป็นตัว **เลือกเซิร์ฟเวอร์** (สลับเซิร์ฟเวอร์แล้วอยู่หน้าเดิม) ตามด้วยหน้าของเซิร์ฟเวอร์นั้น
  จัดกลุ่มเป็น ภาพรวม / จัดการบอท / ข้อมูล & ประวัติ และหน้าส่วนกลาง (เซิร์ฟเวอร์ทั้งหมด / Users / System Audit / Bot Logs / My Account)
  (จอเล็กจะยุบเป็นลิ้นชัก กดปุ่ม ☰ มุมซ้ายบนเพื่อเปิด)
- **แถบบน (topbar)** — บอกว่าอยู่หน้าไหน, ช่อง **ค้นหาหน้า** (กด `Ctrl/⌘ + K` พิมพ์ได้ทั้งไทยและอังกฤษ
  เช่น "ห้องเสียง" → Voice Guard แล้วกด Enter) และเมนูโปรไฟล์ (My Account / Logout)
- หน้าที่ผู้ใช้ไม่มีสิทธิ์เข้าจะไม่ขึ้นทั้งในเมนูและในผลการค้นหา
- **เลือกคนด้วยชื่อ ไม่ต้องหา User ID** — ทุกที่ที่ต้องระบุสมาชิก (Room Access, Voice Guard,
  ตัวกรองของ Log Management) ใช้ช่องค้นหาเดียวกัน: พิมพ์ชื่อหรือ username แล้วเลือกจากรายการ
  (ยังวาง User ID ตรงๆ ได้ถ้ารู้ เช่นกรณีคนออกจากเซิร์ฟเวอร์ไปแล้ว)
- ปุ่ม/ช่องกรอก/ตาราง/กล่องยืนยันทั้งระบบใช้คอมโพเนนต์ของ **shadcn/ui** (`apps/frontend/src/components/ui`)
  และสีจากตัวแปรใน `apps/frontend/src/index.css` — เพิ่มหน้าใหม่ให้ใช้คอมโพเนนต์เหล่านี้แทนการเขียน style เอง
- **Configuration** — ห้องต่างๆ เลือกจาก dropdown และสวิตช์เปิด/ปิดความสามารถในแชท บันทึกทันทีที่เปลี่ยน
- **Room Access** — ห้องที่ใช้ระบบตั๋วตั้งเองได้ต่อเซิร์ฟเวอร์ (เดิมเขียนตายตัวในโค้ด 4 ห้อง — ยกมาเป็นของเซิร์ฟเวอร์หลักให้แล้ว)
- **PR Bot** — แต่ละเซิร์ฟเวอร์มี webhook URL + secret ของตัวเอง (คัดลอก / สร้าง secret ใหม่ได้จากหน้าเว็บ)

### 📢 หน้า News — เขียน embed พร้อมดูตัวอย่าง

- แถบปุ่มจัดรูปแบบตาม Markdown ของ Discord: **ตัวหนา** / _เอียง_ / <u>ขีดเส้นใต้</u> / ~~ขีดฆ่า~~,
  หัวข้อ `#` `##` `###`, อ้างอิง, รายการ, โค้ด, บล็อกโค้ด, สปอยเลอร์ และลิงก์
  (ลากคลุมข้อความแล้วกดปุ่ม หรือใช้ `Ctrl/⌘ + B / I / U`)
- **ตัวอย่าง embed แบบสด** ข้างช่องแก้ไข — เห็นหน้าตาจริงก่อนกดส่ง
- เลือกสีแถบ embed เอง (หรือใช้สีตามประเภทข่าว), ใส่ข้อความท้าย embed และรูปภาพประกอบได้
- หัวข้อของ embed Discord แสดงเป็นข้อความธรรมดาเสมอ (จัดตัวหนา/เอียงไม่ได้) — หน้าเว็บบอกไว้ใต้ช่องกรอก

### 🎉 หน้า Welcome — การ์ดต้อนรับแบบรูปภาพ

ระบบใหม่ที่แยกจาก Welcome ข้อความเดิม (`WELCOME_CHANNEL_ID`) — ของเดิมยังทำงานเหมือนเดิม
ถ้าไม่อยากให้สมาชิกใหม่ได้ข้อความซ้ำ ให้ตั้งการ์ดไปคนละห้อง หรือเปลี่ยน `WELCOME_CHANNEL_ID` เป็นห้องอื่น

- **การ์ดหลายใบ** — สร้าง / คัดลอก / ลบ / เปิด-ปิด ได้ แต่ละใบเลือกห้องที่จะส่งเอง
  สมาชิกใหม่ 1 คนจะได้ทุกใบที่เปิดอยู่ (บอทที่ถูกเชิญเข้ามาจะไม่ได้การ์ด)
- **พื้นหลัง** — อัปโหลดรูป (PNG / JPG / WEBP / GIF ไม่เกิน 8 MB) เข้าคลังรูปของเซิร์ฟเวอร์ (ใช้ร่วมกันทุกการ์ดของเซิร์ฟเวอร์นั้น) หรือใช้สีพื้น,
  เลือกวิธีวางรูป (เต็มกรอบ / เห็นทั้งรูป / ยืด), ความเบลอ และสีทับเพื่อให้อ่านตัวหนังสือง่าย
  รูปถูกเก็บในฐานข้อมูล (ตาราง `welcome_assets`) จึงไม่หายตอน deploy
- **รูปโปรไฟล์** — แสดง/ซ่อน, รูปทรง (วงกลม / มุมโค้ง / สี่เหลี่ยม), ขนาด, ตำแหน่ง, ขอบ
- **ข้อความบนรูป** — ได้สูงสุด 12 ชั้น แต่ละชั้นตั้งข้อความ ฟอนต์ (Kanit / Prompt / Noto Sans Thai) น้ำหนัก ขนาด สี
  จัดแนว ตำแหน่ง ระยะห่างตัวอักษร ขอบ และเงาได้ — ชื่อที่ยาวเกินกรอบจะถูกย่อลงเอง, emoji ในชื่อแสดงได้
- **ตัวแปร** ใช้ได้ทั้งบนรูปและในข้อความที่ส่งคู่กับรูป: `{user}` `{username}` `{mention}` `{server}` `{memberCount}` `{id}`
  (`{mention}` ในข้อความจะแท็กสมาชิกใหม่จริง — บอทแท็กได้แค่คนที่เพิ่งเข้ามาและยศที่พิมพ์ไว้ในข้อความเอง ไม่มี @everyone)
- **ตัวอย่างสด** — รูปถูกวาดที่เซิร์ฟเวอร์ด้วยโค้ดเดียวกับตอนส่งจริง, ลากรูปโปรไฟล์/จุดตัวเลขบนรูปเพื่อย้ายตำแหน่ง,
  เลือกดูตัวอย่างในนามสมาชิกคนอื่นได้ และมีปุ่ม **ส่งทดสอบ** เข้าห้องจริง (ใช้ค่าที่กำลังแก้ แม้ยังไม่บันทึก)
- แก้แล้วกด **บันทึก** (`Ctrl/⌘ + S`) — ยกเว้นสวิตช์เปิด/ปิดที่บันทึกทันที
- บอทต้องมีสิทธิ์ **View Channel / Send Messages / Attach Files** ในห้องที่เลือก (หน้าเว็บเตือนถ้าขาด)

### 🌤️ หน้า Weather — รายงานสภาพอากาศประจำวัน

แทนระบบเดิมที่ส่งอากาศศาลายาเข้าห้อง `GENERAL_CHANNEL_ID` ตอน 07:00 — เซิร์ฟเวอร์หลักยกค่าเดิม
(ห้อง `GENERAL_CHANNEL_ID`, ศาลายา, 07:00 ทุกวัน) มาตั้งให้และเปิดไว้เหมือนเดิม จากนั้นแก้ได้จากหน้าเว็บ
แต่ละเซิร์ฟเวอร์มีรายงานของตัวเอง (สถานที่ / เวลา / ห้องต่างกันได้) — เซิร์ฟเวอร์ใหม่ปิดไว้ก่อนจนกว่าแอดมินจะเปิด

- **embed แบบรายงาน** — หัวข้อ (ลิงก์ไป OpenWeatherMap), วันที่ + สภาพอากาศ, ช่องข้อมูลแถวละ 3 ช่อง
  แล้วตามด้วยรูปกราฟพยากรณ์ และ/หรือแผนที่เรดาร์ฝน (เปิดทั้งคู่ = เรดาร์อยู่ embed ที่ 2)
- **ช่องข้อมูล** เลือกได้ว่าจะแสดงอะไรและเรียงลำดับเอง: อุณหภูมิ / รู้สึกเหมือน / สูงสุด-ต่ำสุด 24 ชม. /
  โอกาสฝนตก + ปริมาณฝน / ความชื้น / ลม / **PM2.5** (ระดับตามเกณฑ์กรมควบคุมมลพิษ) / พระอาทิตย์ขึ้น-ตก /
  เมฆ / ทัศนวิสัย / ความกดอากาศ
- **กราฟพยากรณ์** — เส้นอุณหภูมิ + แท่งโอกาสฝนตก + emoji สภาพอากาศทุก 3 ชม. เลือกช่วง 12 / 24 / 36 / 48 ชม.
  ธีมสว่าง/มืด และสีเส้นได้ (วาดที่เซิร์ฟเวอร์ด้วย `@napi-rs/canvas` แนบเป็นรูปใน embed)
- **แผนที่เรดาร์ฝน** — ฝนที่กำลังตกรอบสถานที่ จาก [RainViewer](https://www.rainviewer.com/api.html) (ฟรี ไม่ต้องใช้ key)
  บนแผนที่ OpenStreetMap แบบขาวดำ พร้อมหมุดสถานที่และแถบสีความแรงของฝน
  - ภาพเคลื่อนไหว (GIF) ย้อนหลัง 1 ชม. หรือภาพนิ่ง (PNG) ของภาพล่าสุด, ระยะ ภูมิภาค / กลาง / ใกล้, ธีมสว่าง/มืด
  - เป็นภาพ **ฝนที่ตกแล้ว ไม่ใช่พยากรณ์** (RainViewer ไม่มีภาพล่วงหน้าแล้ว) และซูมได้แค่ระดับ 7 — ระยะ "ใกล้" ขอบฝนจะเบลอ
  - ดึงเรดาร์ไม่ได้ → รายงานยังส่งได้ แค่ไม่มีภาพเรดาร์ (หน้าเว็บขึ้นคำเตือนในตัวอย่าง)
  - แผนที่ของสถานที่เดิมเก็บไว้ 1 วัน ไม่โหลดไทล์ OpenStreetMap ซ้ำ ตาม[นโยบายการใช้ไทล์](https://operations.osmfoundation.org/policies/tiles/)
    — บนภาพมีเครดิต © OpenStreetMap contributors และ RainViewer ตามเงื่อนไข ห้ามตัดออก
- **เวลาและวันที่ส่ง** — เวลาไทย (Asia/Bangkok) เสมอ ไม่ขึ้นกับ timezone ของเซิร์ฟเวอร์, เลือกวันในสัปดาห์ได้
- **สถานที่** — ค้นหาด้วยชื่อไทย/อังกฤษ หรือวางพิกัดจาก Google Maps, ตั้งชื่อที่แสดงเองได้
- **ข้อความ** — หัวข้อ รายละเอียด ข้อความท้าย และข้อความที่ส่งคู่ embed ใช้ตัวแปร
  `{location}` `{date}` `{time}` `{icon}` `{condition}` `{temp}` `{max}` `{min}` `{rain}` ได้, แท็กยศได้ (ไม่มี @everyone)
- **ตัวอย่างสด** ด้วยข้อมูลอากาศจริง + ปุ่ม **ส่งทดสอบ** เข้าห้องจริง (ใช้ค่าที่กำลังแก้ แม้ยังไม่บันทึก)
- **คำสั่ง `/weather`** ตอบเป็นรายงานแบบเดียวกัน (ช่องข้อมูล / กราฟ / เรดาร์ ตามที่บันทึกไว้ ไม่รวมข้อความคู่ embed) —
  เว้น `city` ว่าง = สถานที่ของรายงาน, ใส่ชื่อหรือพิกัด = ดูที่อื่นด้วยรูปแบบเดิม (ใน DM ใช้รูปแบบเริ่มต้น)
- ถ้าส่งตามเวลาไม่สำเร็จเพราะ API ล่ม/เน็ตหลุด จะลองใหม่อีก 2 ครั้ง (หลัง 1 และ 5 นาที) —
  หน้าเว็บแสดงเวลาส่งครั้งถัดไปและผลการส่งครั้งล่าสุด (พร้อมสาเหตุถ้าส่งไม่สำเร็จ)
- ใช้ `OPENWEATHER_KEY` แบบฟรีได้ (เรียก `weather`, `forecast`, `air_pollution`, `geo` — ไม่ต้องสมัคร One Call)
- บอทต้องมีสิทธิ์ **View Channel / Send Messages / Embed Links / Attach Files** ในห้องที่เลือก (หน้าเว็บเตือนถ้าขาด)

---

## 🧾 Log Management — รูปแบบข้อความและการแจ้งเตือน

เปิดหน้า **Log Management** ของเซิร์ฟเวอร์ แล้วเลือกแท็บ:

- **รูปแบบข้อความ** — เลือกการจัดวางแบบกระชับหรืออ่านสบาย เปิด/ปิดไอคอนรายละเอียด ช่อง ID รูปโปรไฟล์ และเวลา
  กำหนดความยาวรายละเอียด 250 / 500 / 1,024 ตัวอักษร และข้อความท้าย embed พร้อมตัวอย่างสด 3 เหตุการณ์
  กด **บันทึกรูปแบบ** เพื่อใช้กับ log ใหม่ทุกประเภทของเซิร์ฟเวอร์นั้น การสลับแท็บยังเก็บการแก้ไขที่ค้างไว้
- **เหตุการณ์และห้อง** — ค้นหาประเภท log กรองรายการที่เปิดหรือยังไม่ได้เลือกห้อง เปิด/ปิด เลือกห้องปลายทาง
  และปรับสีรายเหตุการณ์ (บันทึกอัตโนมัติ)
- **ตัวกรอง** — ยกเว้นห้อง สมาชิก บทบาท หรือบอท และเปิด/ปิดการบันทึก Activity

รูปแบบใหม่แยกข้อมูลสั้นกับรายละเอียดหลายบรรทัด และแสดงข้อความก่อน/หลังแก้ไขให้ชัดเจน
ค่ารูปแบบเก็บใน `log_options` คีย์ `APPEARANCE` แยกตามเซิร์ฟเวอร์ ไม่ต้องเพิ่ม migration;
เซิร์ฟเวอร์ที่ยังไม่เคยตั้งค่าใช้ค่าเริ่มต้นโดยคงสี ห้องปลายทาง และสถานะเปิด/ปิดเดิมไว้
การย่อหรือซ่อนข้อมูลใน embed ไม่เปลี่ยนกติกาการเก็บ Activity Log

---

## 📊 Dashboard — Overview & Activity Log

แยกตามเซิร์ฟเวอร์ — ทุกเหตุการณ์ที่ Log Manager ดักจับได้ (สมาชิกเข้า/ออก, เข้า/ออกห้องเสียง, ถูกเตะ/แบน, ข้อความถูกลบ/แก้ไข,
แก้ห้อง แก้ยศ AutoMod ฯลฯ) จะถูก **บันทึกลงตาราง `activity_events` เสมอ** ถึงแม้ยังไม่ได้ตั้งห้องส่ง log ใน Discord
พร้อมกับการส่งข้อความและการใช้คำสั่งของบอท (เก็บแค่ว่าใครส่งที่ห้องไหนเมื่อไหร่ — ไม่เก็บเนื้อหาข้อความ)

### แท็บ Overview

- กราฟ **การเข้า / ออกเซิร์ฟเวอร์** และ **การเข้า / ออกห้องเสียง** ตามช่วงเวลา
- อันดับ **ผู้ใช้ที่เคลื่อนไหวมากที่สุด** (จำนวนเหตุการณ์ / ข้อความ / เข้าห้องเสียง / คำสั่ง)
- **เวลาอยู่ในห้องเสียง** รายคนและรายห้อง (คำนวณจากการจับคู่ "เข้า" กับ "ออก" ในช่วงที่เลือก)
- ตัวกรองย้อนหลัง: 24 ชม. / 7 วัน / 30 วัน / 90 วัน หรือกำหนดช่วงเองได้ (สูงสุด 1 ปี),
  เลือกความละเอียดรายชั่วโมง/รายวัน และเลือกว่าจะรวมบอทด้วยไหม

### แท็บ Audit & Activity (ของแต่ละเซิร์ฟเวอร์)

- **การตั้งค่าบน Dashboard** — ทุกการแก้ไขค่าของเซิร์ฟเวอร์นั้นผ่านหน้าเว็บ (เก็บ 180 วัน) — ADMIN ดูของทั้งระบบ
  (รวม login/logout และการจัดการผู้ใช้) ได้ที่หน้า **System Audit**
- **เหตุการณ์ในเซิร์ฟเวอร์ Discord** — ค้นหาย้อนหลังได้ตามชนิดเหตุการณ์ / ช่วงเวลา / ชื่อ / ห้อง / User ID
  กดดูรายละเอียดได้ว่าใครเป็นคนลงมือ และเหตุผลที่ระบุไว้ (เก็บ 90 วัน ปรับได้ที่ `ACTIVITY_LOG_RETENTION_DAYS`)

> ปิดการบันทึกได้ที่แท็บ **Log Management → ตัวกรอง → บันทึกทุกเหตุการณ์ลงฐานข้อมูล**
> (ตัวกรอง "ยกเว้นไม่ต้องบันทึก" ห้อง/คน/ยศ ใช้กับ Activity Log ด้วย)

---

## 🔐 ระบบ Login ของ Dashboard

- **เข้าสู่ระบบได้ 2 ทาง:** username/password (bcrypt) หรือ **Discord OAuth2** — ผูกทั้งสองทางเข้ากับบัญชีเดียวกันได้ในแท็บ My Account
- **Session:** JWT access token อายุ 15 นาที + refresh token 7 วันที่หมุนใบใหม่ทุกครั้ง เก็บใน httpOnly cookie ทั้งคู่ (JS อ่านไม่ได้)
  ถ้า refresh token ใบเก่าถูกนำกลับมาใช้ซ้ำ ระบบถือว่าโดนขโมย และเตะผู้ใช้นั้นออกทุกเครื่อง
- **Role:** `USER` จัดการได้เฉพาะเซิร์ฟเวอร์ที่ตัวเองมีสิทธิ์ Manage Server ใน Discord (ต้องเชื่อมบัญชี Discord) /
  `ADMIN` จัดการได้ทุกเซิร์ฟเวอร์ รวมถึงหน้า **Users**, **System Audit** และ **Bot Logs**
- **Passport:** `LocalStrategy` (username/password) · `JwtStrategy` (access token ใน cookie) · `DiscordStrategy` (callback ของ OAuth)
- **ความปลอดภัย:** ล็อกบัญชี 15 นาทีเมื่อใส่รหัสผิด 5 ครั้ง, จำกัดความถี่ต่อ IP, ตรวจ Origin ทุก request ที่แก้ข้อมูล (กัน CSRF)
- **Audit log:** บันทึกการ login/logout และทุกการแก้ไขผ่าน Dashboard (ใคร / ทำอะไร / IP / ค่าเดิม) เก็บย้อนหลัง 180 วัน
  ส่วนเหตุการณ์ฝั่ง Discord ดูได้ในแท็บเดียวกัน (ดูหัวข้อ **Dashboard — Overview & Activity Log**)

### ตั้งค่า

1. `pnpm db:migrate` — สร้าง/อัปเดตตารางทั้งหมด (รวม `guilds` และคอลัมน์ `guild_id` ของทุกตารางที่แยกตามเซิร์ฟเวอร์)
2. ตั้ง `JWT_SECRET` ใน `.env` (ยาว 32 ตัวขึ้นไป)
3. เปิดบอท — ถ้ายังไม่มี ADMIN ในระบบ จะสร้างให้จาก `ADMIN_USERNAME` / `ADMIN_PASSWORD` เดิมใน `.env` (login ด้วยรหัสเดิมได้เลย)
   หลังจากนั้นเปลี่ยนรหัสผ่านที่แท็บ My Account — แก้ค่าใน `.env` ภายหลังจะไม่มีผลกับบัญชีที่สร้างไปแล้ว
4. (ถ้าต้องการ Discord login) Discord Developer Portal → แอปของบอท → **OAuth2**
   - เพิ่ม Redirect: `https://<โดเมน Dashboard>/api/auth/discord/callback`
   - ใส่ `DISCORD_CLIENT_SECRET` และ `DISCORD_REDIRECT_URI` ใน `.env` (`DISCORD_CLIENT_ID` ถ้าไม่ใส่จะใช้ Application ID เดิมของบอท)
   - คนที่ login ด้วย Discord ครั้งแรกจะได้ role `USER` (จัดการเซิร์ฟเวอร์ของตัวเองได้) — ปรับเป็น `ADMIN` ในแท็บ Users หรือใส่ Discord ID ไว้ใน `ADMIN_DISCORD_IDS`

## ⚠️ Permissions ที่ต้องเปิดให้บอท

ลิงก์เชิญจากหน้า **เซิร์ฟเวอร์ทั้งหมด** ขอสิทธิ์เหล่านี้ให้ครบแล้ว (+ Manage Channels สำหรับ Room Access และ Manage Server สำหรับดูคำเชิญใน Log Manager)

- View Audit Log
- Move Members
- Manage Roles
- Manage Messages
- Attach Files (ห้องที่ส่งการ์ดต้อนรับ และห้องรายงานสภาพอากาศ — รูปกราฟ)
- Embed Links (ห้องรายงานสภาพอากาศ)
- Message Content Intent
- Server Members Intent (event สมาชิกเข้าเซิร์ฟเวอร์)11

## Dependencies หลัก

**Backend** — `@nestjs/*` (core / config / schedule / passport / jwt / serve-static), passport (local / jwt / custom), discord.js,
prisma / @prisma/client / @prisma/adapter-pg, @google/generative-ai, @napi-rs/canvas (วาดการ์ดต้อนรับ กราฟ และแผนที่เรดาร์ —
มี binary สำเร็จรูป ไม่ต้องติดตั้งโปรแกรมเพิ่มในเซิร์ฟเวอร์), gifenc (GIF ของแผนที่เรดาร์), cron (ตั้งเวลารายงานอากาศต่อเซิร์ฟเวอร์),
@expo-google-fonts/\* (ฟอนต์ไทย Kanit / Prompt / Noto Sans Thai และ Noto Color Emoji), bcryptjs, helmet, express-rate-limit, zod

**Frontend** — react, @tanstack/react-router, @tanstack/react-query, @tanstack/react-table, @tanstack/react-form,
shadcn/ui (radix-ui + tailwindcss v4), recharts (กราฟหน้า Overview), sonner (แจ้งเตือน), lucide-react (ไอคอน)

---

## 👨‍💻 ผู้พัฒนา

**Arlif Thongrakjan**  
AT Tech
