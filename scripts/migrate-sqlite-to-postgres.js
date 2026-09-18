// ==========================================
// 🚚 ย้ายข้อมูลเก่าจาก SQLite → PostgreSQL (Prisma)
//
// ขั้นตอน (ทำก่อนเปิดบอทเวอร์ชัน Postgres ครั้งแรก):
//   1. ใส่ DATABASE_URL ใน .env
//   2. npm run db:migrate                        ← สร้างตารางใน Postgres
//   3. npm run db:import-sqlite -- --dry-run     ← ดูว่าจะย้ายอะไรบ้าง (ไม่เขียนอะไรลง Postgres)
//   4. npm run db:import-sqlite                  ← ย้ายจริง ใน transaction เดียว แล้วตรวจเทียบข้อมูลทีละแถว
//
// - ไฟล์ SQLite ถูกเปิดแบบ read-only จึงไม่ถูกแก้ไขแน่นอน
// - ถ้าตารางใน Postgres มีข้อมูลอยู่แล้ว (เช่น เผลอเปิดบอทก่อน ทำให้ค่า default ถูก seed ไว้) สคริปต์จะหยุด
//   ใส่ --force เพื่อลบข้อมูลในตารางปลายทางแล้วแทนที่ด้วยข้อมูลจาก SQLite
// - เปลี่ยนไฟล์ต้นทางได้ด้วย --sqlite=<path> และ --pr-sqlite=<path>
// ==========================================
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { prisma } = require('../prisma/client');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const getPathOption = (name, fallback) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? path.resolve(arg.slice(name.length + 3)) : fallback;
};

const DRY_RUN = hasFlag('dry-run');
const FORCE = hasFlag('force');
const SOURCE_FILES = {
    main: getPathOption('sqlite', path.join(ROOT, 'database.sqlite')),
    pr: getPathOption('pr-sqlite', path.join(ROOT, 'prbot', 'data', 'messages.sqlite')),
};
const CHUNK_SIZE = 1000;

const str = (v) => (v === null || v === undefined ? null : String(v));
const int = (v) => Math.trunc(Number(v) || 0);
const bool = (v) => Boolean(Number(v));
// คอลัมน์ notify เพิ่งถูกเพิ่มทีหลัง — SQLite ที่ยังไม่มีคอลัมน์นี้ให้ถือว่าเปิดอยู่ (ค่า default เดิมคือ 1)
const notifyBool = (v) => (v === undefined || v === null ? true : bool(v));

// source = ไฟล์ SQLite ต้นทาง, model = delegate ของ Prisma, fields = ฟิลด์ที่ใช้ตรวจเทียบหลังย้าย
// required = ฟิลด์ที่ห้ามว่าง (SQLite ยอมให้ primary key แบบ TEXT เป็น NULL ได้ แต่ Postgres ไม่ยอม → ข้ามแถวนั้น)
// ลำดับแถวอ่านตาม rowid เดิม ทำให้ config.sort_order เรียงเหมือนหน้า Dashboard เดิม
const TABLES = [
    {
        table: 'config', source: 'main', model: 'config',
        fields: ['key', 'value', 'description'], required: ['key'],
        transform: r => ({ key: str(r.key), value: str(r.value), description: str(r.description) }),
    },
    {
        table: 'levels', source: 'main', model: 'level',
        fields: ['userId', 'xp', 'level'], required: ['userId'],
        transform: r => ({ userId: str(r.userId), xp: int(r.xp), level: int(r.level) }),
    },
    {
        table: 'room_access', source: 'main', model: 'roomAccess',
        fields: ['id', 'userId', 'roomId', 'expireAt', 'notified'], required: ['userId', 'roomId', 'expireAt'],
        transform: r => ({
            id: int(r.id),
            userId: str(r.userId),
            roomId: str(r.roomId),
            expireAt: r.expireAt === null ? null : new Date(Number(r.expireAt)),
            notified: bool(r.notified),
        }),
    },
    {
        table: 'voice_whitelist_channels', source: 'main', model: 'voiceWhitelistChannel',
        fields: ['channelId', 'enabled', 'notify'], required: ['channelId'],
        transform: r => ({ channelId: str(r.channelId), enabled: bool(r.enabled), notify: notifyBool(r.notify) }),
    },
    {
        table: 'voice_whitelist_users', source: 'main', model: 'voiceWhitelistUser',
        fields: ['channelId', 'userId'], required: ['channelId', 'userId'],
        transform: r => ({ channelId: str(r.channelId), userId: str(r.userId) }),
    },
    {
        table: 'voice_blacklist_channels', source: 'main', model: 'voiceBlacklistChannel',
        fields: ['channelId', 'enabled', 'notify'], required: ['channelId'],
        transform: r => ({ channelId: str(r.channelId), enabled: bool(r.enabled), notify: notifyBool(r.notify) }),
    },
    {
        table: 'voice_blacklist_users', source: 'main', model: 'voiceBlacklistUser',
        fields: ['channelId', 'userId'], required: ['channelId', 'userId'],
        transform: r => ({ channelId: str(r.channelId), userId: str(r.userId) }),
    },
    {
        table: 'log_settings', source: 'main', model: 'logSetting',
        fields: ['eventKey', 'enabled', 'channelId', 'color'], required: ['eventKey'],
        // โค้ดเดิมถือว่าเปิดเฉพาะค่า 1 เท่านั้น (row.enabled === 1)
        transform: r => ({ eventKey: str(r.event_key), enabled: Number(r.enabled) === 1, channelId: str(r.channel_id) || '', color: str(r.color) || '' }),
    },
    {
        table: 'log_options', source: 'main', model: 'logOption',
        fields: ['key', 'value'], required: ['key'],
        transform: r => ({ key: str(r.key), value: str(r.value) }),
    },
    {
        table: 'pr_messages', source: 'pr', model: 'prMessage',
        fields: ['repoFullName', 'prNumber', 'channelId', 'messageId'], required: ['repoFullName', 'channelId', 'messageId'],
        transform: r => ({ repoFullName: str(r.repoFullName), prNumber: int(r.prNumber), channelId: str(r.channelId), messageId: str(r.messageId) }),
    },
];

function openReadOnly(file) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, (err) => (err ? reject(err) : resolve(db)));
    });
}

function sqliteAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

// คืน null ถ้าไม่มีไฟล์หรือไม่มีตารางนั้น (เซิร์ฟเวอร์ที่รันเวอร์ชันเก่าอาจยังไม่มีบางตาราง)
async function readSqliteTable(db, table) {
    if (!db) return null;
    const found = await sqliteAll(db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]);
    if (found.length === 0) return null;
    return sqliteAll(db, `SELECT * FROM "${table}" ORDER BY rowid`);
}

// แปลงแถวเป็น string เพื่อเทียบ SQLite กับ Postgres แบบไม่สนลำดับ
const fingerprint = (row, fields) => JSON.stringify(fields.map(f => (row[f] instanceof Date ? row[f].getTime() : row[f])));

async function main() {
    console.log(DRY_RUN ? '🔍 Dry run — อ่านอย่างเดียว ไม่เขียนอะไรลง PostgreSQL' : '🚚 เริ่มย้ายข้อมูล SQLite → PostgreSQL');

    if (!fs.existsSync(SOURCE_FILES.main)) throw new Error(`ไม่พบไฟล์ SQLite: ${SOURCE_FILES.main}`);
    const sources = {};
    try {
        for (const [name, file] of Object.entries(SOURCE_FILES)) {
            if (fs.existsSync(file)) {
                sources[name] = await openReadOnly(file);
                console.log(`📂 ${name}: ${file}`);
            } else {
                console.log(`⚠️  ไม่พบ ${file} — ข้ามตารางจากไฟล์นี้`);
            }
        }

        // 1. อ่าน + แปลงข้อมูลจาก SQLite
        const plan = [];
        for (const def of TABLES) {
            const rows = await readSqliteTable(sources[def.source], def.table);
            const data = [];
            let skipped = 0;
            for (const row of rows || []) {
                const item = def.transform(row);
                if (def.required.some(f => item[f] === null || item[f] === undefined)) {
                    skipped++;
                    console.log(`⚠️  ข้ามแถวใน ${def.table} เพราะข้อมูลไม่ครบ:`, row);
                    continue;
                }
                data.push(item);
            }
            plan.push({ ...def, hasSource: rows !== null, data, skipped, existing: await prisma[def.model].count() });
        }

        console.table(plan.map(p => ({
            table: p.table,
            sqlite: p.hasSource ? p.data.length : '(no table)',
            skipped: p.skipped,
            postgres_now: p.existing,
        })));

        if (DRY_RUN) return;

        const toImport = plan.filter(p => p.hasSource);
        const nonEmpty = toImport.filter(p => p.existing > 0);
        if (nonEmpty.length > 0 && !FORCE) {
            throw new Error(
                `ตารางใน PostgreSQL มีข้อมูลอยู่แล้ว: ${nonEmpty.map(p => `${p.table} (${p.existing})`).join(', ')}\n` +
                '   ถ้าต้องการลบข้อมูลเหล่านี้แล้วแทนที่ด้วยข้อมูลจาก SQLite ให้รันใหม่พร้อม --force'
            );
        }

        // 2. เขียนลง Postgres ใน transaction เดียว — ถ้าพังกลางทาง จะไม่มีอะไรถูกเขียนเลย
        await prisma.$transaction(async (tx) => {
            if (FORCE) {
                for (const p of toImport) await tx[p.model].deleteMany();
            }
            for (const p of toImport) {
                for (let i = 0; i < p.data.length; i += CHUNK_SIZE) {
                    await tx[p.model].createMany({ data: p.data.slice(i, i + CHUNK_SIZE) });
                }
            }
            // room_access ใส่ id เดิมเข้าไปเอง → ต้องเลื่อน sequence ให้เกิน id สูงสุด ไม่งั้นแถวใหม่จะชน primary key
            await tx.$queryRaw`SELECT setval(pg_get_serial_sequence('room_access', 'id'), COALESCE((SELECT MAX(id) FROM room_access), 0) + 1, false)`;
        }, { timeout: 120000 });

        // 3. ตรวจสอบ: อ่านกลับจาก Postgres แล้วเทียบกับข้อมูลจาก SQLite ทีละแถว
        let allMatch = true;
        for (const p of toImport) {
            const select = Object.fromEntries(p.fields.map(f => [f, true]));
            const actual = (await prisma[p.model].findMany({ select })).map(r => fingerprint(r, p.fields)).sort();
            const expected = p.data.map(r => fingerprint(r, p.fields)).sort();
            const match = actual.length === expected.length && actual.every((v, i) => v === expected[i]);
            if (!match) allMatch = false;
            console.log(`${match ? '✅' : '❌'} ${p.table}: SQLite ${expected.length} แถว / PostgreSQL ${actual.length} แถว`);
        }

        if (!allMatch) throw new Error('ข้อมูลใน PostgreSQL ไม่ตรงกับ SQLite — ตรวจสอบว่าไม่มีบอทตัวอื่นเขียนข้อมูลอยู่ระหว่างย้าย แล้วรันใหม่ด้วย --force');
        console.log('🎉 ย้ายข้อมูลเสร็จ ข้อมูลตรงกันทุกตาราง');
    } finally {
        for (const db of Object.values(sources)) db.close();
    }
}

main()
    .catch((err) => {
        console.error(`❌ ${err.message}`);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
