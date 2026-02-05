# 🤖 Bot_NotStack  
### Discord Security & Utility Bot

**Bot_NotStack** คือบอท Discord อเนกประสงค์ที่พัฒนาโดย **Arlif Thongrakjan**  
โดดเด่นด้าน **ระบบความปลอดภัยห้องเสียง**, **ระบบ Log ขั้นสูง** และล่าสุดเพิ่ม **AI Chat Assistant ภายในเซิร์ฟเวอร์**  
พัฒนาด้วย **Node.js**, **Discord.js v14** และ **Google Gemini AI**

---

## ✨ ความสามารถหลัก (Key Features)

### 🛡️ ระบบรักษาความปลอดภัย (Security Systems)
ทำงานแบบ **Real-time** ภายในไฟล์ `index.js`

#### 🔁 Anti-Force Move (ป้องกันการลากผู้ใช้)
- ตรวจจับการถูกลากย้ายห้องเสียงผ่าน **Audit Log**
- **Auto Return:** ดึงผู้เสียหายกลับห้องเดิมทันที
- **Loop Protection:** ป้องกันบอททำงานชนกับตัวเอง
- **Abuse Logging:** บันทึกพฤติกรรมลง `logs/abuse_report.log`

#### 🎚️ Bitrate Monitor
แจ้งเตือนเมื่อมีการเปลี่ยน Bitrate ห้องเสียง พร้อมระบุผู้แก้ไข

#### 🌍 Region Monitor
แจ้งเตือนเมื่อมีการเปลี่ยน Region ของ Voice Channel

#### 💬 Anti-Spam
จำกัดข้อความ **6 ข้อความ / 5 วินาที** พร้อมลบข้อความและแจ้งเตือนแอดมิน

#### 🚫 Bad Word Filter
กรองคำหยาบจาก `badWords.json` และคำต้องห้ามเพิ่มเติม

---

### 🧠 AI Chat System (Gemini AI)

บอทสามารถตอบคำถามแบบ AI ได้โดยใช้ **Google Gemini (gemini-2.5-flash)**

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

### 📝 ระบบบันทึกข้อมูล (Logging)

| ประเภท | รายละเอียด |
|--------|-------------|
| Chat Log | บันทึกข้อความทั้งหมดรายวัน |
| Voice Log | บันทึกการเข้า/ออก/ย้ายห้องเสียง |
| Abuse Log | บันทึกผู้ใช้ที่ลากคนอื่นซ้ำๆ |
| Role Log | บันทึกการขอ Role พิเศษ |

---

### 🛠️ คำสั่งของบอท (Slash Commands)

**Admin/System:** `/botinfo` • `/serverinfo` • `/userinfo` • `/ping` • `/admininfo`  
**Utility:** `/weather` • `/poll` • `/random`  
**Roles:** `/verify` • `/addroles`

---

### 🤖 ระบบอัตโนมัติอื่น ๆ
- Auto Reply ข้อความพื้นฐาน
- รายงานอากาศอัตโนมัติทุก 07:00 น.
- ระบบ Welcome / Goodbye

---

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

---

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

---

## 📦 Dependencies สำคัญ
discord.js  
dotenv  
node-schedule  
node-fetch  
@google/generative-ai  

---

## 👨‍💻 ผู้พัฒนา
**Arlif Thongrakjan**  
AT Tech
