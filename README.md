# Bot_NotStack

### Discord Security & Utility Bot

**Bot_NotStack** คือบอท Discord อเนกประสงค์ที่พัฒนาโดย **Arlif Thongrakjan**  
โดดเด่นด้าน **ระบบความปลอดภัยห้องเสียง**, **ระบบ Log ขั้นสูง** และล่าสุดเพิ่ม **AI Chat Assistant ภายในเซิร์ฟเวอร์**  
พัฒนาด้วย **Node.js**, **Discord.js v14** และ **Google Gemini AI**

---

## ความสามารถหลัก (Key Features)

### ระบบรักษาความปลอดภัย (Security Systems)

ระบบทั้งหมดทำงานแบบ **Real-time** ภายในไฟล์ `index.js`

#### Anti-Force Move (ป้องกันการลากผู้ใช้)

-   ตรวจจับการถูกลากย้ายห้องเสียงผ่าน **Audit Log**
-   **Auto Return:** ดึงผู้เสียหายกลับห้องเดิมทันที
-   **Loop Protection:** ป้องกันบอททำงานชนกับตัวเอง
-   **Abuse Logging:** บันทึกชื่อผู้ก่อกวนลง `logs/abuse_report.log`

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
├── index.js  
├── deploy-command.js  
├── badWords.json  
├── config.json  
└── README.md  

## การติดตั้งและใช้งาน (Installation Guide)

## 🚀 การติดตั้ง

### 1️⃣ ติดตั้งแพ็กเกจ
npm install

### 2️⃣ ตั้งค่าไฟล์ `.env`
TOKEN=DISCORD_BOT_TOKEN  
OPENWEATHER_KEY=OPENWEATHER_API_KEY  
GEMINI_KEY=GOOGLE_GEMINI_API_KEY  

### 3️⃣ ลงทะเบียนคำสั่ง
node deploy-command.js

### 4️⃣ รันบอท
node index.js

---

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

---

## 👨‍💻 ผู้พัฒนา
**Arlif Thongrakjan**  
AT Tech
