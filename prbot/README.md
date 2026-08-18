# PR Bot (add-on)

แจ้งเตือน GitHub Pull Request (opened) และอัปเดตข้อความเดิมเมื่อ PR ถูก merge/close เข้า Discord — ตามแผนใน `discord-pr-bot-plan.html`

รวมเข้ากับบอทหลักที่มีอยู่แล้ว (ใช้ discord.js `Client` ตัวเดียวกับ `index.js`, รันบน Express app ตัวเดียวกับ `server.js`) โดย**ไม่แก้ไขโค้ดเดิม** — มีแค่ 2 บรรทัดที่ถูก "เพิ่ม" เข้าไปใน `server.js`:

1. `app.use('/webhook', require('./prbot/routes/github'))` — mount ก่อน `express.json()` เสมอ เพื่อให้ route นี้ยังได้ raw body สำหรับ verify HMAC signature (ถ้า mount หลัง `express.json()` มันจะ parse body ทิ้งไปแล้ว verify ไม่ผ่าน)
2. `require('./prbot/discordClient').setClient(client)` ใน `startServer(client)` — ส่ง reference ของ client ตัวเดียวกับบอทหลักให้ prbot ใช้ยิงข้อความ

หน้า Dashboard เพิ่ม tab ใหม่ **PR Bot** สำหรับตั้งค่า org/repo mapping แบบเข้าใจง่าย (ดูหัวข้อ Dashboard UI ด้านล่าง) โดยเป็นไฟล์ใหม่ล้วนๆ ไม่แก้ `script.js` เดิมเลย

โค้ดใหม่ทั้งหมดอยู่ใน `prbot/` และ `public/prbot-dashboard.js` ไฟล์เดิมของโปรเจกต์ (`index.js`, `db.js`, `script.js` ฯลฯ) ไม่ถูกแตะเลย

## Setup

1. เพิ่มตัวแปรใน `.env` (root) ตามตัวอย่างใน `prbot/.env.example`:
   - `GITHUB_WEBHOOK_SECRET`
2. รันบอทตามปกติ (`node index.js`) — webhook พร้อมใช้งานทันทีที่ dashboard server (`server.js`) start
3. เข้าหน้า Dashboard → tab **PR Bot** (ใหม่) → กรอกห้อง/role ผ่านฟอร์มได้เลย ไม่ต้องแก้ code หรือ redeploy:
   - **ห้อง Default** — `PR_CHANNEL_ID` ใช้กับ org/repo ที่ไม่ได้ระบุไว้ด้านล่าง
   - **ห้องแยกตาม Organization** — เพิ่ม/ลบแถว `org name → channel ID` ได้ไม่จำกัดจำนวน (เก็บเป็น JSON ใน `PR_ORG_CHANNEL_MAP`)
   - **Mention แยกตาม Repo** — เพิ่ม/ลบแถว `owner/repo → role name (หรือ mention tag)` ได้ไม่จำกัดจำนวน (เก็บเป็น JSON ใน `PR_REPO_MENTION_MAP`) — repo ที่ไม่ได้ระบุจะไม่ mention เลย
   - ค่าดิบ (raw JSON) ของทั้ง 3 key นี้ยังโผล่ในหน้า tab **Configuration** เดิมด้วย (เพราะใช้ endpoint `/api/config` เดียวกัน) — ใช้ tab **PR Bot** เป็นหลักจะสะดวกกว่า
4. ตั้ง GitHub repo webhook: Settings → Webhooks → Add webhook
   - Payload URL: `https://<your-domain>/webhook/github`
   - Content type: `application/json`
   - Secret: ค่าเดียวกับ `GITHUB_WEBHOOK_SECRET`
   - Events: เลือก "Pull requests"

## ครอบคลุมตอนนี้

- `pull_request` action `opened` / `reopened` / `ready_for_review` → ส่ง embed ใหม่ + ปุ่ม Open PR / Latest Commit ผ่าน channel ที่ตั้งไว้
- `pull_request` action `closed` → แก้ไขข้อความเดิม (หา message id จาก SQLite แยกไฟล์ `prbot/data/messages.sqlite`) เป็นสีม่วง "Merged" (ถ้า `pr.merged === true`) หรือสีแดง "Closed"
- Routing ตาม org/repo:
  - PR จาก org ไหนก็ตามที่ระบุไว้ใน `PR_ORG_CHANNEL_MAP` → ส่งเข้า channel ของ org นั้นแทน `PR_CHANNEL_ID`
  - PR ที่เปิดจาก repo ไหนก็ตามที่ระบุไว้ใน `PR_REPO_MENTION_MAP` → mention role ที่ตั้งไว้ต่อท้ายข้อความด้วย (เป็น `content` ของข้อความ ไม่ใช่ field ใน embed เพราะ Discord ping ได้จาก content เท่านั้น) — repo อื่นที่ไม่ได้ระบุไว้จะไม่ mention

**หมายเหตุ migration:** ถ้าเคยใช้รุ่นก่อน (มี key `PR_CHANNEL_PEGASUS` หรือ `PR_MENTION_PEGASUS_TCG_WEB` แบบเจาะจง org/repo เดียว) บอทจะย้ายค่าที่เคยตั้งไว้เข้า `PR_ORG_CHANNEL_MAP` / `PR_REPO_MENTION_MAP` ให้อัตโนมัติตอน start ครั้งแรกหลังอัปเดต แล้วลบ key เก่าทิ้ง

Event อื่น ๆ ตามแผน (review, workflow_run/CI) ยังไม่ได้ทำในรอบนี้ — เพิ่ม handler ใหม่ใน `handlers/` แล้ว map event ใน `routes/github.js` ได้โดยไม่กระทบของเดิม

## Dashboard UI

Tab **PR Bot** ใหม่ใน `views/dashboard.html` เป็น editor แบบ add/remove แถว แทนการพิมพ์ JSON ดิบ:

- ไฟล์ logic: `public/prbot-dashboard.js` (**ไฟล์ใหม่** — ไม่แก้ `public/script.js` เดิมเลย ผูกกับหน้าเว็บผ่าน `<script src="prbot-dashboard.js">` อีกบรรทัดที่เพิ่มเข้าไปใน `dashboard.html`)
- ใช้ endpoint `/api/config` (GET/POST) เดิมที่มีอยู่แล้ว — ไม่มีการเพิ่ม backend route ใหม่
- CSS ใหม่ (`.prbot-row`, `.prbot-add-btn`, `.prbot-remove-btn`, ฯลฯ) ถูกเพิ่มต่อท้ายไฟล์ `public/style.css` เดิม ไม่ได้แก้ rule เดิมตัวไหนเลย

## โครงสร้าง

```
prbot/
├── config.js              # อ่าน GITHUB_WEBHOOK_SECRET จาก .env, อ่าน/seed PR_CHANNEL_ID, PR_ORG_CHANNEL_MAP, PR_REPO_MENTION_MAP ในตาราง config ของ db.js
├── discordClient.js        # เก็บ reference ของ client ตัวเดียวกับบอทหลัก
├── routes/github.js        # POST /webhook/github → verify signature → dispatch
├── handlers/pullRequest.js # logic ต่อ action: opened/reopened → send, closed → edit
├── discord/embeds/         # pure function: PR data → { embeds, components }
│   ├── prOpened.js
│   └── prClosed.js
├── store/messageStore.js   # SQLite แยกไฟล์ เก็บ PR → message id
└── utils/verifySignature.js # HMAC SHA-256 ตรวจ X-Hub-Signature-256

public/prbot-dashboard.js   # logic ของ tab "PR Bot" ในหน้า Dashboard (ไฟล์ใหม่ แยกจาก script.js)
```
