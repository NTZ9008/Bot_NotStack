# Deploy Grafana monitoring

คู่มือนี้ใช้กับ backend PM2 `BotNotStack` และ workflow `Deploy BotNotStack` ของ repo
โดยนำ metrics ไปแสดงบน Grafana ที่มีอยู่แล้ว ไม่ต้อง deploy frontend ใหม่สำหรับฟีเจอร์นี้
ไม่มี schema migration หรือ slash command ใหม่

## 1. เตรียมค่า backend

สร้าง secret ด้วย `openssl rand -hex 32` แล้วเพิ่ม `METRICS_TOKEN=<ค่าที่สร้าง>`
ใน `/home/arlifzs/BotNotStack/.env` บนเซิร์ฟเวอร์ เก็บค่าเดียวกันไว้ให้ Prometheus
ถ้ามี `apps/backend/.env` ค่าจากไฟล์นั้นมีลำดับความสำคัญสูงกว่า root `.env`
ถ้าตั้งตัวแปรผ่าน PM2/process environment อยู่แล้ว ให้ปรับค่านั้นด้วย
อย่าใส่ token ใน PR, Git หรือ dashboard JSON

ไม่ตั้ง token = metrics ยังปิด (404) จึง deploy โค้ดก่อนแล้วค่อยเปิดภายหลังได้

## 2. Deploy backend หลัง merge

### ผ่าน GitHub Actions (ตรงกับระบบปัจจุบัน)

1. Merge PR เข้า `release/v.4.1.0` หลัง CI ผ่าน
2. เปิด **Actions → Deploy BotNotStack → Run workflow** เลือก `release/v.4.1.0`
3. รอ job สำเร็จ: workflow build backend/shared, backup เวอร์ชันเดิม, upload,
   install production dependencies, migrate ตามปกติ และ restart PM2
4. Workflow นี้กดได้เฉพาะ `main` หรือ `release/*`; อย่าเลือก feature branch
5. ตรวจ `pm2 status` และ `pm2 logs BotNotStack --lines 50 --nostream` บนเซิร์ฟเวอร์

workflow ยังรัน migrate/register commands ตามขั้นตอนเดิม แม้ฟีเจอร์ monitoring ไม่ต้องเพิ่มทั้งสองอย่าง
การ restart ทำให้บอทหลุดชั่วครู่; ห้ามเปิดบอท production สองโปรเซสเพื่อทดสอบ

### แบบ manual (เฉพาะเซิร์ฟเวอร์ที่เป็น Git checkout)

สำรองเวอร์ชันที่ใช้งานอยู่และตรวจว่าไม่มี local changes ที่ต้องเก็บก่อน update
อย่ารัน `git pull` ในโฟลเดอร์ bundle ที่ Actions สร้าง เพราะไม่ใช่ Git checkout
จาก root ของ checkout:

```sh
git switch release/v.4.1.0
git pull --ff-only origin release/v.4.1.0
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=@notstack/backend...
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

หากอัปเดตข้าม release ที่มี migration อื่นด้วย ให้ทำ migration ตามคู่มือของ release นั้นก่อน restart

## 3. เตรียม Prometheus แยกจากโฟลเดอร์ deploy

**สำคัญสำหรับ Actions:** bundle ของ workflow ไม่มี `monitoring/` และ upload ด้วย `rsync --delete`
จึงต้องเก็บ Prometheus config และ token นอก `/home/arlifzs/BotNotStack/`
เช่น `/home/arlifzs/notstack-monitoring/` หรือใช้ config directory ของ Prometheus เดิม
ตัวอย่างใน README ที่รัน `monitoring/compose.yml` ภายใน repo เหมาะกับ local/Git checkout เท่านั้น

ถ้ามี Prometheus แล้ว: เพิ่ม job จาก `prometheus.yml` ใน config เดิม
วาง token ใน secret file ที่ process Prometheus อ่านได้ แก้ `credentials_file` ให้ตรง
และเพิ่ม `alerts.yml` ใน `rule_files` ถ้าต้องการ จากนั้น reload/restart ตามวิธีที่ใช้งานอยู่
อย่าแทนที่ config ทั้งไฟล์จน job เดิมหาย

ถ้ายังไม่มี Prometheus: จากเครื่องที่มี checkout ของ commit ที่ merge แล้ว ใช้ SSH host ที่เข้าถึงได้จริง:

```sh
# ตั้ง DEPLOY_HOST เป็น SSH destination เช่น arlifzs@<private-host>
ssh "$DEPLOY_HOST" 'mkdir -p /home/arlifzs/notstack-monitoring && chmod 700 /home/arlifzs/notstack-monitoring'
scp monitoring/compose.yml monitoring/prometheus.yml monitoring/alerts.yml \
    "$DEPLOY_HOST":/home/arlifzs/notstack-monitoring/
```

บนเซิร์ฟเวอร์:

1. สร้าง `/home/arlifzs/notstack-monitoring/metrics-token` ซึ่งมีเพียงค่า token จากข้อ 1
   (ไม่มี `METRICS_TOKEN=` หรือเครื่องหมาย quote)
2. ให้ UID/GID ของ Prometheus container อ่านไฟล์ได้ โดยจำกัดสิทธิ์ตามเครื่องนั้น
   ถ้า container อ่านไม่ได้จะขึ้น permission denied ใน logs/targets
3. แก้ `prometheus.yml` ให้ target ชี้ backend จริง: ค่าเริ่มต้นคือ `host.docker.internal:3035`
   ถ้าใช้ Linux Docker bridge และ backend bind `127.0.0.1` ให้ใช้ private interface ที่ container เข้าถึงได้
   หรือรัน Prometheus บน host แล้วใช้ `127.0.0.1:3035` อย่าเปลี่ยน HOST โดยไม่พิจารณา firewall/reverse proxy เดิม
4. ถ้า scrape ผ่าน HTTPS ให้ตั้ง `scheme: https` และ target เป็น hostname:443

```sh
cd /home/arlifzs/notstack-monitoring
docker compose -f compose.yml config --quiet
docker compose -f compose.yml up -d
docker compose -f compose.yml logs --tail=50 prometheus
```

Compose เปิด Prometheus ที่ loopback port 9090 และเก็บข้อมูล 15 วันใน Docker volume
ถ้า Grafana อยู่คนละเครื่อง/container ต้องเชื่อม private network และปรับ listener/port ให้เข้าถึงได้
URL data source ต้องเข้าถึงได้จาก **Grafana server** ไม่ใช่เพียงจาก browser ของผู้ดูแล

## 4. ตรวจหลัง deploy และ import dashboard

บน backend host ให้ตั้ง shell variable `METRICS_TOKEN` เป็นค่าเดียวกับ `.env`
(การมีค่าใน `.env` ไม่ได้ทำให้ shell export ตัวแปรให้อัตโนมัติ):

```sh
curl --fail --max-time 10 http://127.0.0.1:3035/api/health
curl --fail --max-time 10 \
    -H "Authorization: Bearer ${METRICS_TOKEN}" \
    http://127.0.0.1:3035/api/metrics
```

ปรับ port ให้ตรงกับ backend แล้วตรวจ:

- health ตอบ 200; metrics ตอบ 200 และเป็นข้อความ Prometheus
- เรียก metrics โดยไม่มี token ต้องได้ 401 เมื่อเปิดแล้ว
- Prometheus `/targets`: job `notstack` เป็น UP; query `up{job="notstack"}` ได้ 1
- `notstack_database_up` ได้ 1 และ `notstack_discord_ready` ได้ 1 ถ้าเปิดบอทไว้
- Grafana: เพิ่ม/เลือก Prometheus data source → Save & test → Import `grafana-dashboard.json`
  → เลือก data source → เลือก instance
- รอ 2–4 รอบ scrape (15 วินาทีต่อรอบ) และเข้า API เพื่อให้กราฟ HTTP มีข้อมูล
- Alert rules อย่างเดียวไม่ส่งข้อความ: ต่อ Alertmanager หรือ Grafana contact point/rules ตามระบบที่ใช้

แก้ปัญหาเบื้องต้น:

| อาการ | สิ่งที่ตรวจ |
| --- | --- |
| Metrics 404 | ยังไม่ตั้ง token, backend ยังรันโค้ดเก่า หรือ proxy ใช้ path ผิด |
| Metrics 401 | token ฝั่ง scraper ไม่ตรง หรือ proxy ไม่ส่ง Authorization ต่อ |
| Target DOWN/timeout | hostname, port, HOST bind, firewall และสิทธิ์อ่าน token |
| DB = 0 แต่ target UP | API ยังทำงาน แต่ probe ฐานข้อมูลล้มเหลว/หมดเวลา |
| กราฟ No data | เลือก data source/instance, job ต้องชื่อ `notstack`, รอ scrape และสร้าง API traffic |

## 5. ปิด monitoring / rollback

- ปิดเฉพาะ metrics: เอา `METRICS_TOKEN` ออกจากแหล่ง config ที่มีผลจริง แล้ว restart `BotNotStack`
  ถ้าตั้งผ่าน process environment ให้ล้างค่านั้นด้วย; endpoint จะตอบ 404
  ปิด scrape job/alerts ที่เกี่ยวข้องด้วยเพื่อไม่ให้แจ้งว่า target ล่ม
- หยุด Prometheus ตัวอย่าง: `docker compose -f compose.yml down` จาก directory ของ monitoring
  ไม่เติม `-v` เพื่อเก็บ volume ประวัติไว้
- ถ้าต้อง rollback backend ที่ deploy ผ่าน Actions ใช้ backup `/home/arlifzs/BotNotStack-prev`
  ตามขั้นตอนใน `.github/workflows/deploy.yml` แล้วติดตั้ง dependencies ของเวอร์ชันเก่าและ restart PM2
  ฟีเจอร์นี้ไม่มี migration ที่ต้องย้อน; ตรวจ migration ของ PR อื่นที่รวมมาใน deploy เดียวกันด้วย
- Config/token ที่อยู่ `/home/arlifzs/notstack-monitoring/` ไม่ได้รับผลจาก deploy/rollback ของ backend
