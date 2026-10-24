# Monitor NotStack ด้วย Grafana ที่มีอยู่แล้ว

วิธี deploy บน production ผ่าน Actions/PM2 รวม verification และ rollback: [DEPLOY.md](DEPLOY.md)

เส้นทางข้อมูล: **NotStack `/api/metrics` → Prometheus → Grafana**
Grafana ต้องใช้ Prometheus data source; URL `/api/metrics` ไม่ใช่ data source โดยตรง

## 1. เปิด metrics ของ backend

ติดตั้ง dependencies และ build ตามปกติ (`pnpm install`, `pnpm build`) แล้วสร้าง token:

```sh
openssl rand -hex 32
```

เพิ่ม `METRICS_TOKEN=<ค่าที่สร้าง>` ใน `.env` ของ backend แล้ว restart backend/PM2
(ใช้ชื่อโปรเซสใน `ecosystem.config.cjs` และ `--update-env` ถ้าส่ง environment ผ่าน PM2)
ไม่ตั้ง token = endpoint ตอบ 404 และไม่เก็บ HTTP/process metrics; token ต้องยาวอย่างน้อย 32 ตัวอักษร
ใช้ token แยกจาก Discord และ JWT

ทดสอบโดยตั้ง shell variable `METRICS_TOKEN` เป็นค่าเดียวกัน:

```sh
curl --fail -H "Authorization: Bearer ${METRICS_TOKEN}" http://127.0.0.1:3035/api/metrics
```

จะได้ข้อความ Prometheus เช่น `notstack_database_up 1` และ `notstack_discord_ready 1`
กรณีไม่มี TOKEN ของ Discord: `discord_enabled = 0`, `discord_ready = 0` เป็นเรื่องปกติ

## 2. เชื่อม Prometheus

### มี Prometheus อยู่แล้ว

นำ job `notstack` ใน [prometheus.yml](prometheus.yml) ไปเพิ่มใต้ `scrape_configs` ของเดิม
เปลี่ยน target เป็น hostname/IP และ port ของ backend ที่ **เครื่อง Prometheus เข้าถึงได้**
วางไฟล์ token (มีเพียงค่า token ไม่มี `METRICS_TOKEN=`) ในเครื่อง/คอนเทนเนอร์ Prometheus
แล้วแก้ `credentials_file` ให้ตรงกับตำแหน่งนั้น จากนั้น reload/restart Prometheus
ถ้าข้ามเครือข่ายที่ไม่ไว้ใจ ให้ใช้ HTTPS (`scheme: https` และ target port 443) ผ่าน reverse proxy
ตรวจว่า proxy ส่ง Authorization header ต่อและไม่ cache endpoint นี้

เพิ่ม [alerts.yml](alerts.yml) ใน `rule_files` ได้ด้วย แต่ยังต้องต่อ Alertmanager หรือสร้าง Grafana alert/contact point เองเพื่อรับการแจ้งเตือน

### ยังไม่มี Prometheus

ตัวอย่างนี้เพิ่มเฉพาะ Prometheus และใช้ Grafana เดิม:

1. สร้าง `monitoring/metrics-token` ใส่ค่าเดียวกับ backend (ไฟล์นี้ถูก gitignore)
2. ให้ user ของ Prometheus ใน container อ่านไฟล์ได้ และป้องกันไฟล์จากผู้ใช้อื่นตามสิทธิ์ของเครื่อง
3. ปรับ target ใน `monitoring/prometheus.yml` หาก backend อยู่คนละเครื่องหรือใช้ port อื่น
4. รันจาก root ของ repo:

```sh
docker compose -f monitoring/compose.yml up -d
```

ตัวอย่างใช้ `host.docker.internal:3035` สำหรับ backend บน Docker host
ถ้า backend bind `HOST=127.0.0.1` บน Linux bridge จะเข้าถึงไม่ได้: ใช้ IP/interface ส่วนตัวที่ container เข้าถึงได้พร้อม firewall หรือรัน Prometheus บน host และใช้ target `127.0.0.1:3035`
ห้ามใช้ `localhost` เพื่ออ้างถึง host จาก container เพราะจะหมายถึง container เอง

Prometheus เปิดไว้ที่ `127.0.0.1:9090` และเก็บข้อมูล 15 วันใน volume
เข้า `http://localhost:9090/targets` จาก host แล้วตรวจว่า job `notstack` เป็น UP
ถ้า Grafana อยู่ใน container/เครื่องอื่น ต้องจัด network/private listener ให้เข้าถึง Prometheus ได้ก่อน
อย่าเปิดพอร์ต 9090 สู่ public โดยไม่มีการควบคุมการเข้าถึง

## 3. Import dashboard เข้า Grafana เดิม

1. เพิ่ม/เลือก data source ชนิด **Prometheus** และใช้ URL ของ Prometheus ที่ Grafana server เข้าถึงได้
   ถ้าทั้งคู่รันบน host เดียวกันโดยไม่ใช้ container: `http://127.0.0.1:9090`
2. ใน Grafana เลือก **Dashboards → New → Import** แล้วอัปโหลด [grafana-dashboard.json](grafana-dashboard.json)
3. เลือก Prometheus data source ตอน import แล้วเลือก instance ด้านบนของ dashboard
4. รออย่างน้อยสองรอบ scrape; กราฟ rate ใช้ข้อมูลหลาย sample และ HTTP metrics จะปรากฏหลังมี API/webhook traffic

มี 14 panels: scrape/database health, Discord ready/guild count/ping, uptime, process CPU/RAM, Node heap,
HTTP rate/5xx/p95 latency, event loop lag และ database probe duration
CPU 100% หมายถึงหนึ่ง CPU core; memory/CPU เป็นของ backend process ไม่ใช่ทั้งเครื่อง
ยังไม่ได้เก็บ frontend browser performance, system logs หรือ PostgreSQL internals

## พฤติกรรมและขอบเขต

- HTTP metrics นับ response ที่ส่งเสร็จ รวม 4xx/5xx, body-parser errors และ rate-limit responses; ไม่รวมการ scrape metrics และ connection ที่ถูกยกเลิกก่อนจบ
- Labels ใช้ route template เช่น `/api/guilds/:guildId`; ไม่ส่ง URL จริง, query, user ID, guild ID หรือข้อความแชท
- Request ที่ยังไม่ถึง router รวมเป็น `unmatched` เพื่อจำกัดจำนวน series
- Database probe ใช้ transaction อ่าน `SELECT 1` พร้อม pool/statement/transaction timeouts; concurrent scrapes แชร์ probe เดียว
- Database ล่มยังได้ HTTP 200 พร้อม `notstack_database_up 0` เพื่อให้เห็น metrics อื่น; backend ล่มดู `up = 0`
- ค่าจะเริ่มใหม่เมื่อ restart process; Prometheus เก็บประวัติและ `rate()` จัดการ counter reset
- ถ้ามีหลาย replica ให้ scrape แต่ละ instance โดยตรง ไม่ผ่าน load balancer ที่สุ่ม backend
- Alert rules เป็นตัวอย่าง: down 2 นาที, DB fail 1 นาที, Discord หลุด 5 นาที (เฉพาะเปิดบอท), HTTP 5xx >5% เมื่อมีอย่างน้อย 20 requests/5 นาที

อ้างอิง: [Prometheus scrape/authorization configuration](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)

หมายเหตุ dependency: ใช้ `prom-client` 15.x เพื่อรองรับ Node 20 ตาม engines ของ repo; upstream เปลี่ยนชื่อเป็น `@prometheus-io/client` ซึ่งรุ่นปัจจุบันต้องใช้ Node 22/24/26 ขึ้นไป ควรย้ายเมื่อปรับ Node baseline ของโปรเจกต์
