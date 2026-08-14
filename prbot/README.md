# PR Bot (add-on)

แจ้งเตือน GitHub Pull Request (opened) และอัปเดตข้อความเดิมเมื่อ PR ถูก merge/close เข้า Discord — ตามแผนใน `discord-pr-bot-plan.html`

รวมเข้ากับบอทหลักที่มีอยู่แล้ว (ใช้ discord.js `Client` ตัวเดียวกับ `index.js`, รันบน Express app ตัวเดียวกับ `server.js`) โดย**ไม่แก้ไขโค้ดเดิม** — มีแค่ 2 บรรทัดที่ถูก "เพิ่ม" เข้าไปใน `server.js`:

1. `app.use('/webhook', require('./prbot/routes/github'))` — mount ก่อน `express.json()` เสมอ เพื่อให้ route นี้ยังได้ raw body สำหรับ verify HMAC signature (ถ้า mount หลัง `express.json()` มันจะ parse body ทิ้งไปแล้ว verify ไม่ผ่าน)
2. `require('./prbot/discordClient').setClient(client)` ใน `startServer(client)` — ส่ง reference ของ client ตัวเดียวกับบอทหลักให้ prbot ใช้ยิงข้อความ

โค้ดใหม่ทั้งหมดอยู่ใน `prbot/` เพียงโฟลเดอร์เดียว ไฟล์เดิมของโปรเจกต์ (`index.js`, `db.js`, ฯลฯ) ไม่ถูกแตะเลย

## Setup

1. เพิ่มตัวแปรใน `.env` (root) ตามตัวอย่างใน `prbot/.env.example`:
   - `GITHUB_WEBHOOK_SECRET`
2. รันบอทตามปกติ (`node index.js`) — webhook พร้อมใช้งานทันทีที่ dashboard server (`server.js`) start
3. เข้าหน้า Dashboard → tab **Configuration** → จะเห็นแถวใหม่ 3 แถว (ถูกเพิ่มเข้า DB อัตโนมัติตอน start) → กรอกแล้วกด Save เหมือนช่องอื่นๆ (`LOG_CHANNEL_ID`, `ALERT_CHANNEL_ID` ฯลฯ) — ไม่ต้องแก้โค้ดหรือ redeploy เวลาจะเปลี่ยนห้อง/role:
   - `PR_CHANNEL_ID` — channel default สำหรับ PR ของ repo ทั่วไป
   - `PR_CHANNEL_PEGASUS` — channel เฉพาะสำหรับ PR ของ org `MUDST-2026-Pegasus` (ถ้าเว้นว่างไว้ จะ fallback ไปใช้ `PR_CHANNEL_ID` แทน)
   - `PR_MENTION_PEGASUS_TCG_WEB` — ชื่อ Role ใน Discord ที่จะ mention เมื่อ PR เปิดจาก repo `MUDST-2026-Pegasus/pegasus-tcg-web` โดยเฉพาะ (พิมพ์ชื่อ role ให้ตรงเป๊ะ เช่น `frontman-pegasus` แล้วบอทจะหา role นั้นใน guild ให้เอง — หรือจะใส่ mention tag ตรงๆ เช่น `<@&1234567890>` ก็ได้)
4. ตั้ง GitHub repo webhook: Settings → Webhooks → Add webhook
   - Payload URL: `https://<your-domain>/webhook/github`
   - Content type: `application/json`
   - Secret: ค่าเดียวกับ `GITHUB_WEBHOOK_SECRET`
   - Events: เลือก "Pull requests"

## ครอบคลุมตอนนี้

- `pull_request` action `opened` / `reopened` / `ready_for_review` → ส่ง embed ใหม่ + ปุ่ม Open PR / Latest Commit ผ่าน channel ที่ตั้งไว้
- `pull_request` action `closed` → แก้ไขข้อความเดิม (หา message id จาก SQLite แยกไฟล์ `prbot/data/messages.sqlite`) เป็นสีม่วง "Merged" (ถ้า `pr.merged === true`) หรือสีแดง "Closed"
- Routing ตาม org/repo:
  - PR จาก org `MUDST-2026-Pegasus` (repo ไหนก็ได้ในนั้น) → ส่งเข้า `PR_CHANNEL_PEGASUS` แทน `PR_CHANNEL_ID` (ถ้าตั้งไว้)
  - PR ที่เปิดจาก repo `MUDST-2026-Pegasus/pegasus-tcg-web` โดยเฉพาะ → mention role ที่ตั้งไว้ใน `PR_MENTION_PEGASUS_TCG_WEB` ต่อท้ายข้อความด้วย

Event อื่น ๆ ตามแผน (review, workflow_run/CI) ยังไม่ได้ทำในรอบนี้ — เพิ่ม handler ใหม่ใน `handlers/` แล้ว map event ใน `routes/github.js` ได้โดยไม่กระทบของเดิม

## โครงสร้าง

```
prbot/
├── config.js              # อ่าน GITHUB_WEBHOOK_SECRET จาก .env, อ่าน/seed PR_CHANNEL_ID, PR_CHANNEL_PEGASUS, PR_MENTION_PEGASUS_TCG_WEB ในตาราง config ของ db.js
├── discordClient.js        # เก็บ reference ของ client ตัวเดียวกับบอทหลัก
├── routes/github.js        # POST /webhook/github → verify signature → dispatch
├── handlers/pullRequest.js # logic ต่อ action: opened/reopened → send, closed → edit
├── discord/embeds/         # pure function: PR data → { embeds, components }
│   ├── prOpened.js
│   └── prClosed.js
├── store/messageStore.js   # SQLite แยกไฟล์ เก็บ PR → message id
└── utils/verifySignature.js # HMAC SHA-256 ตรวจ X-Hub-Signature-256
```
