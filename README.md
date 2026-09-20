# Bot_NotStack

### Discord Security & Utility Bot

**Bot_NotStack** คือบอท Discord อเนกประสงค์ที่พัฒนาโดย **Arlif Thongrakjan**  
โดดเด่นด้าน **ระบบความปลอดภัยห้องเสียง**, **ระบบ Log ขั้นสูง** และล่าสุดเพิ่ม **AI Chat Assistant ภายในเซิร์ฟเวอร์**  
พัฒนาด้วย **Node.js**, **Discord.js v14** และ **Google Gemini AI**

---

## ความสามารถหลัก (Key Features)

### ระบบรักษาความปลอดภัย (Security Systems)

ระบบทั้งหมดทำงานแบบ **Real-time** ภายในไฟล์ `index.js`

#### Bitrate Monitor

-   แจ้งเตือนเมื่อมีการแอบปรับ Bitrate ห้องเสียง\
    (ช่วยป้องกันการก่อกวนหรือทำให้เซิร์ฟเวอร์แลค)

#### Region Monitor

-   แจ้งเตือนเมื่อมีการเปลี่ยน **Server Region**
-   แจ้งเตือนเมื่อมีการเปลี่ยน **Voice Channel Region Override**

#### Anti-Spam System

-   จำกัดการส่งข้อความ: **6 ข้อความ / 5 วินาที**
-   ลบข้อความสแปมอัตโนมัติ พร้อมแจ้งเตือน

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

  คำสั่ง          ความสามารถ
  --------------- ----------------------------------------------------
  `/botinfo`      แสดงสถานะบอท (Uptime, RAM, CPU, OS)
  `/serverinfo`   แสดงข้อมูลเซิร์ฟเวอร์
  `/userinfo`     ข้อมูลผู้ใช้ (วันที่สมัคร, วันที่เข้าเซิร์ฟ, Role)
  `/ping`         ทดสอบ Latency
  `/admininfo`    ข้อมูลผู้พัฒนา

#### หมวด Utility

---

#### หมวด Verification & Roles

**Admin/System:** `/botinfo` • `/serverinfo` • `/userinfo` • `/ping` • `/admininfo`  
**Utility:** `/weather` • `/poll` • `/random`  
**Roles:** `/verify` • `/addroles`

---

### ระบบอัตโนมัติอื่น ๆ

-   **Auto Reply** --- ตอบข้อความอัตโนมัติ เช่น "สวัสดีบอท",
    "หิวข้าว"
-   **Weather Scheduler** --- รายงานอากาศทุกวันเวลา **07:00 น.**
-   **Welcome / Goodbye System** --- ต้อนรับสมาชิกใหม่
    และแจ้งเตือนเมื่อมีคนออก

------------------------------------------------------------------------

## โครงสร้างโปรเจกต์ (Project Structure)

## 📂 โครงสร้างโปรเจกต์

BOT_NOTSTACK/  
├── commands/  
├── events/  
├── logs/  
├── prisma/  
│   ├── schema.prisma  
│   ├── migrations/  
│   └── client.js  
├── scripts/  
│   └── migrate-sqlite-to-postgres.js  
├── db.js  
├── index.js  
├── deploy-command.js  
├── badWords.json  
├── config.json  
└── README.md  

## การติดตั้งและใช้งาน (Installation Guide)

## 🚀 การติดตั้ง

### 1️⃣ ติดตั้งแพ็กเกจ
npm install  
(รัน `prisma generate` ให้อัตโนมัติ — ต้องใช้ Node.js 20.19+ / 22.12+ / 24+)

### 2️⃣ ตั้งค่าไฟล์ `.env`
TOKEN=DISCORD_BOT_TOKEN  
OPENWEATHER_KEY=OPENWEATHER_API_KEY  
GEMINI_KEY=GOOGLE_GEMINI_API_KEY  
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME  

> ถ้ารหัสผ่านมีอักขระพิเศษ (เช่น `@ # / : ?`) ต้อง URL-encode ก่อน เช่น `#` → `%23`, `@` → `%40`

### 3️⃣ สร้างตารางใน PostgreSQL
npm run db:migrate

### 4️⃣ (ครั้งเดียว) ย้ายข้อมูลเก่าจาก SQLite
ถ้าเคยรันบอทเวอร์ชัน SQLite มาก่อน ให้ย้ายข้อมูลจาก `database.sqlite` และ `prbot/data/messages.sqlite` **ก่อนเปิดบอทครั้งแรก**  
npm run db:import-sqlite -- --dry-run  ← ดูก่อนว่าจะย้ายอะไรบ้าง (ไม่เขียนลง Postgres)  
npm run db:import-sqlite  ← ย้ายจริงใน transaction เดียว แล้วตรวจเทียบข้อมูลทุกแถว  

ไฟล์ SQLite ถูกเปิดแบบ read-only ไม่ถูกแก้ไข — ถ้าเผลอเปิดบอทก่อน (ตารางใน Postgres มีค่า default อยู่แล้ว) สคริปต์จะหยุด ให้รันใหม่พร้อม `--force` เพื่อแทนที่ด้วยข้อมูลจาก SQLite

### 5️⃣ ลงทะเบียนคำสั่ง
node deploy-command.js

### 6️⃣ รันบอท
node index.js

---

## 🖥️ หน้าตา Dashboard

- **เมนูซ้าย (sidebar)** — จัดกลุ่มเป็น ภาพรวม / จัดการบอท / ข้อมูล & ประวัติ / ระบบ
  (จอเล็กจะยุบเป็นลิ้นชัก กดปุ่ม ☰ มุมซ้ายบนเพื่อเปิด)
- **แถบบน (topbar)** — บอกว่าอยู่หน้าไหน, ช่อง **ค้นหาหน้า** (กด `Ctrl/⌘ + K` พิมพ์ได้ทั้งไทยและอังกฤษ
  เช่น "ห้องเสียง" → Voice Guard แล้วกด Enter) และเมนูโปรไฟล์ (My Account / Logout)
- หน้าที่ผู้ใช้ไม่มีสิทธิ์เข้าจะไม่ขึ้นทั้งในเมนูและในผลการค้นหา
- **เลือกคนด้วยชื่อ ไม่ต้องหา User ID** — ทุกที่ที่ต้องระบุสมาชิก (Room Access, Voice Guard,
  ตัวกรองของ Log Management) ใช้ช่องค้นหาเดียวกัน: พิมพ์ชื่อหรือ username แล้วเลือกจากรายการ
  (ยังวาง User ID ตรงๆ ได้ถ้ารู้ เช่นกรณีคนออกจากเซิร์ฟเวอร์ไปแล้ว)
- ปุ่ม/ช่องกรอก/ตารางทั้งระบบใช้ชุดคลาสกลางใน `public/style.css` (`.btn`, `.input`, `.field`,
  `.segmented` ฯลฯ) อิงตัวแปรสีและระยะห่างใน `:root` — เพิ่มหน้าใหม่ให้ใช้คลาสเหล่านี้แทนการเขียน style เอง

### 📢 หน้า News — เขียน embed พร้อมดูตัวอย่าง

- แถบปุ่มจัดรูปแบบตาม Markdown ของ Discord: **ตัวหนา** / *เอียง* / <u>ขีดเส้นใต้</u> / ~~ขีดฆ่า~~,
  หัวข้อ `#` `##` `###`, อ้างอิง, รายการ, โค้ด, บล็อกโค้ด, สปอยเลอร์ และลิงก์
  (ลากคลุมข้อความแล้วกดปุ่ม หรือใช้ `Ctrl/⌘ + B / I / U`)
- **ตัวอย่าง embed แบบสด** ข้างช่องแก้ไข — เห็นหน้าตาจริงก่อนกดส่ง
- เลือกสีแถบ embed เอง (หรือใช้สีตามประเภทข่าว), ใส่ข้อความท้าย embed และรูปภาพประกอบได้
- หัวข้อของ embed Discord แสดงเป็นข้อความธรรมดาเสมอ (จัดตัวหนา/เอียงไม่ได้) — หน้าเว็บบอกไว้ใต้ช่องกรอก

------------------------------------------------------------------------

## 📊 Dashboard — Overview & Activity Log

ทุกเหตุการณ์ที่ Log Manager ดักจับได้ (สมาชิกเข้า/ออก, เข้า/ออกห้องเสียง, ถูกเตะ/แบน, ข้อความถูกลบ/แก้ไข,
แก้ห้อง แก้ยศ AutoMod ฯลฯ) จะถูก **บันทึกลงตาราง `activity_events` เสมอ** ถึงแม้ยังไม่ได้ตั้งห้องส่ง log ใน Discord
พร้อมกับการส่งข้อความและการใช้คำสั่งของบอท (เก็บแค่ว่าใครส่งที่ห้องไหนเมื่อไหร่ — ไม่เก็บเนื้อหาข้อความ)

### แท็บ Overview
- กราฟ **การเข้า / ออกเซิร์ฟเวอร์** และ **การเข้า / ออกห้องเสียง** ตามช่วงเวลา
- อันดับ **ผู้ใช้ที่เคลื่อนไหวมากที่สุด** (จำนวนเหตุการณ์ / ข้อความ / เข้าห้องเสียง / คำสั่ง)
- **เวลาอยู่ในห้องเสียง** รายคนและรายห้อง (คำนวณจากการจับคู่ "เข้า" กับ "ออก" ในช่วงที่เลือก)
- ตัวกรองย้อนหลัง: 24 ชม. / 7 วัน / 30 วัน / 90 วัน หรือกำหนดช่วงเองได้ (สูงสุด 1 ปี),
  เลือกความละเอียดรายชั่วโมง/รายวัน และเลือกว่าจะรวมบอทด้วยไหม

### แท็บ Audit Logs
- **การกระทำบน Dashboard** — login/logout และทุกการแก้ไขผ่านหน้าเว็บ (เก็บ 180 วัน)
- **เหตุการณ์ในเซิร์ฟเวอร์ Discord** — ค้นหาย้อนหลังได้ตามชนิดเหตุการณ์ / ช่วงเวลา / ชื่อ / ห้อง / User ID
  กดดูรายละเอียดได้ว่าใครเป็นคนลงมือ และเหตุผลที่ระบุไว้ (เก็บ 90 วัน ปรับได้ที่ `ACTIVITY_LOG_RETENTION_DAYS`)

> ปิดการบันทึกได้ที่แท็บ **Log Management → บันทึกทุกเหตุการณ์ลงฐานข้อมูล**
> (ตัวกรอง "ยกเว้นไม่ต้องบันทึก" ห้อง/คน/ยศ ใช้กับ Activity Log ด้วย)

------------------------------------------------------------------------

## 🔐 ระบบ Login ของ Dashboard

- **เข้าสู่ระบบได้ 2 ทาง:** username/password (bcrypt) หรือ **Discord OAuth2** — ผูกทั้งสองทางเข้ากับบัญชีเดียวกันได้ในแท็บ My Account
- **Session:** JWT access token อายุ 15 นาที + refresh token 7 วันที่หมุนใบใหม่ทุกครั้ง เก็บใน httpOnly cookie ทั้งคู่ (JS อ่านไม่ได้)
  ถ้า refresh token ใบเก่าถูกนำกลับมาใช้ซ้ำ ระบบถือว่าโดนขโมย และเตะผู้ใช้นั้นออกทุกเครื่อง
- **Role:** `USER` เห็นแค่ Levels และบัญชีตัวเอง / `ADMIN` เห็นทุกอย่าง รวมถึงแท็บ **Users** (จัดการผู้ใช้) และ **Audit Logs**
- **ความปลอดภัย:** ล็อกบัญชี 15 นาทีเมื่อใส่รหัสผิด 5 ครั้ง, จำกัดความถี่ต่อ IP, ตรวจ Origin ทุก request ที่แก้ข้อมูล (กัน CSRF)
- **Audit log:** บันทึกการ login/logout และทุกการแก้ไขผ่าน Dashboard (ใคร / ทำอะไร / IP / ค่าเดิม) เก็บย้อนหลัง 180 วัน
  ส่วนเหตุการณ์ฝั่ง Discord ดูได้ในแท็บเดียวกัน (ดูหัวข้อ **Dashboard — Overview & Activity Log**)

### ตั้งค่า
1. `npm run db:migrate` — สร้างตาราง `users`, `refresh_tokens`, `audit_logs`, `activity_events`
2. ตั้ง `JWT_SECRET` ใน `.env` (ยาว 32 ตัวขึ้นไป)
3. เปิดบอท — ถ้ายังไม่มี ADMIN ในระบบ จะสร้างให้จาก `ADMIN_USERNAME` / `ADMIN_PASSWORD` เดิมใน `.env` (login ด้วยรหัสเดิมได้เลย)
   หลังจากนั้นเปลี่ยนรหัสผ่านที่แท็บ My Account — แก้ค่าใน `.env` ภายหลังจะไม่มีผลกับบัญชีที่สร้างไปแล้ว
4. (ถ้าต้องการ Discord login) Discord Developer Portal → แอปของบอท → **OAuth2**
   - เพิ่ม Redirect: `https://<โดเมน Dashboard>/api/auth/discord/callback`
   - ใส่ `DISCORD_CLIENT_SECRET` และ `DISCORD_REDIRECT_URI` ใน `.env` (`DISCORD_CLIENT_ID` ถ้าไม่ใส่จะใช้ `clientId` จาก `config.json`)
   - คนที่ login ด้วย Discord ครั้งแรกจะได้ role `USER` — ปรับเป็น `ADMIN` ในแท็บ Users หรือใส่ Discord ID ไว้ใน `ADMIN_DISCORD_IDS`

## ⚠️ Permissions ที่ต้องเปิดให้บอท
- View Audit Log  
- Move Members  
- Manage Roles  
- Manage Messages  
- Message Content Intent  

## Dependencies หลัก
discord.js  
dotenv  
node-schedule  
node-fetch  
@google/generative-ai  
prisma / @prisma/client / @prisma/adapter-pg (PostgreSQL)  

---

## 👨‍💻 ผู้พัฒนา
**Arlif Thongrakjan**  
AT Tech
