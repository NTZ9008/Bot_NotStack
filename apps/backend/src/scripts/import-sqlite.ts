// ==========================================
// 🚚 ย้ายข้อมูลเก่าจาก SQLite → PostgreSQL (ทำครั้งเดียวก่อนเปิดบอทเวอร์ชัน Postgres ครั้งแรก)
//   1. ใส่ DATABASE_URL ใน .env
//   2. pnpm db:migrate                          ← สร้างตารางใน Postgres
//   3. pnpm db:import-sqlite -- --dry-run       ← ดูว่าจะย้ายอะไรบ้าง (ไม่เขียนอะไรลง Postgres)
//   4. pnpm db:import-sqlite                    ← ย้ายจริง ใน transaction เดียว แล้วตรวจเทียบข้อมูลทีละแถว
//
// - ไฟล์ SQLite ถูกเปิดแบบ read-only จึงไม่ถูกแก้ไขแน่นอน
// - ถ้าตารางใน Postgres มีข้อมูลอยู่แล้ว (เช่น เผลอเปิดบอทก่อน) สคริปต์จะหยุด — ใส่ --force เพื่อลบแล้วแทนที่ด้วยข้อมูลจาก SQLite
// - เปลี่ยนไฟล์ต้นทางได้ด้วย --sqlite=<path> และ --pr-sqlite=<path> (ค่าเริ่มต้น: database.sqlite และ prbot/data/messages.sqlite ที่ root ของ repo)
// - ข้อมูลใน SQLite เป็นของเซิร์ฟเวอร์หลัก (DISCORD_GUILD_ID) ทั้งหมด — ตรวจ/ลบ/เทียบเฉพาะข้อมูลของเซิร์ฟเวอร์หลัก ไม่แตะเซิร์ฟเวอร์อื่น
// ==========================================
import fs from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import { DEFAULT_GUILD_ID } from '../config/env.validation';
import { ENV_FILES, REPO_ROOT } from '../config/paths';
import { PrismaClient } from '../generated/prisma/client';

dotenv.config({ path: ENV_FILES, quiet: true });

type Row = Record<string, unknown>;

const args = process.argv.slice(2);
const hasFlag = (name: string) => args.includes(`--${name}`);
const getPathOption = (name: string, fallback: string) => {
    const arg = args.find((a) => a.startsWith(`--${name}=`));
    return arg ? path.resolve(arg.slice(name.length + 3)) : fallback;
};

const DRY_RUN = hasFlag('dry-run');
const FORCE = hasFlag('force');
const SOURCE_FILES: Record<'main' | 'pr', string> = {
    main: getPathOption('sqlite', path.join(REPO_ROOT, 'database.sqlite')),
    pr: getPathOption('pr-sqlite', path.join(REPO_ROOT, 'prbot', 'data', 'messages.sqlite')),
};
const CHUNK_SIZE = 1000;
const HOME_GUILD_ID = process.env.DISCORD_GUILD_ID || DEFAULT_GUILD_ID;

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const int = (v: unknown) => Math.trunc(Number(v) || 0);
const bool = (v: unknown) => Boolean(Number(v));
// คอลัมน์ notify เพิ่งถูกเพิ่มทีหลัง — SQLite ที่ยังไม่มีคอลัมน์นี้ให้ถือว่าเปิดอยู่ (ค่า default เดิมคือ 1)
const notifyBool = (v: unknown) => (v === undefined || v === null ? true : bool(v));

interface TableDef {
    table: string;
    source: 'main' | 'pr';
    model: string;
    fields: string[];
    required: string[];
    transform: (r: Row) => Row;
    // ตาราง user ของ Voice Guard ไม่มี guild_id — แยกเซิร์ฟเวอร์ผ่านตารางห้องของมัน
    channelsModel?: string;
}

const home = (row: Row): Row => ({ guildId: HOME_GUILD_ID, ...row });

// ลำดับแถวอ่านตาม rowid เดิม ทำให้ config.sort_order เรียงเหมือนหน้า Dashboard เดิม
// required = ฟิลด์ที่ห้ามว่าง (SQLite ยอมให้ primary key แบบ TEXT เป็น NULL ได้ แต่ Postgres ไม่ยอม → ข้ามแถวนั้น)
const TABLES: TableDef[] = [
    {
        table: 'config', source: 'main', model: 'config', fields: ['guildId', 'key', 'value', 'description'], required: ['key'],
        transform: (r) => home({ key: str(r.key), value: str(r.value), description: str(r.description) }),
    },
    {
        table: 'levels', source: 'main', model: 'level', fields: ['guildId', 'userId', 'xp', 'level'], required: ['userId'],
        transform: (r) => home({ userId: str(r.userId), xp: int(r.xp), level: int(r.level) }),
    },
    {
        table: 'room_access', source: 'main', model: 'roomAccess', fields: ['id', 'guildId', 'userId', 'roomId', 'expireAt', 'notified'], required: ['userId', 'roomId', 'expireAt'],
        transform: (r) => home({
            id: int(r.id),
            userId: str(r.userId),
            roomId: str(r.roomId),
            expireAt: r.expireAt === null ? null : new Date(Number(r.expireAt)),
            notified: bool(r.notified),
        }),
    },
    {
        table: 'voice_whitelist_channels', source: 'main', model: 'voiceWhitelistChannel', fields: ['guildId', 'channelId', 'enabled', 'notify'], required: ['channelId'],
        transform: (r) => home({ channelId: str(r.channelId), enabled: bool(r.enabled), notify: notifyBool(r.notify) }),
    },
    {
        table: 'voice_whitelist_users', source: 'main', model: 'voiceWhitelistUser', fields: ['channelId', 'userId'], required: ['channelId', 'userId'],
        transform: (r) => ({ channelId: str(r.channelId), userId: str(r.userId) }),
        channelsModel: 'voiceWhitelistChannel',
    },
    {
        table: 'voice_blacklist_channels', source: 'main', model: 'voiceBlacklistChannel', fields: ['guildId', 'channelId', 'enabled', 'notify'], required: ['channelId'],
        transform: (r) => home({ channelId: str(r.channelId), enabled: bool(r.enabled), notify: notifyBool(r.notify) }),
    },
    {
        table: 'voice_blacklist_users', source: 'main', model: 'voiceBlacklistUser', fields: ['channelId', 'userId'], required: ['channelId', 'userId'],
        transform: (r) => ({ channelId: str(r.channelId), userId: str(r.userId) }),
        channelsModel: 'voiceBlacklistChannel',
    },
    {
        table: 'log_settings', source: 'main', model: 'logSetting', fields: ['guildId', 'eventKey', 'enabled', 'channelId', 'color'], required: ['eventKey'],
        // โค้ดเดิมถือว่าเปิดเฉพาะค่า 1 เท่านั้น (row.enabled === 1)
        transform: (r) => home({ eventKey: str(r.event_key), enabled: Number(r.enabled) === 1, channelId: str(r.channel_id) || '', color: str(r.color) || '' }),
    },
    {
        table: 'log_options', source: 'main', model: 'logOption', fields: ['guildId', 'key', 'value'], required: ['key'],
        transform: (r) => home({ key: str(r.key), value: str(r.value) }),
    },
    {
        table: 'pr_messages', source: 'pr', model: 'prMessage', fields: ['guildId', 'repoFullName', 'prNumber', 'channelId', 'messageId'], required: ['repoFullName', 'channelId', 'messageId'],
        transform: (r) => home({ repoFullName: str(r.repoFullName), prNumber: int(r.prNumber), channelId: str(r.channelId), messageId: str(r.messageId) }),
    },
];

function openReadOnly(file: string): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, (err) => (err ? reject(err) : resolve(db)));
    });
}

function sqliteAll(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<Row[]> {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as Row[])));
    });
}

// คืน null ถ้าไม่มีไฟล์หรือไม่มีตารางนั้น (เซิร์ฟเวอร์ที่รันเวอร์ชันเก่าอาจยังไม่มีบางตาราง)
async function readSqliteTable(db: sqlite3.Database | undefined, table: string): Promise<Row[] | null> {
    if (!db) return null;
    const found = await sqliteAll(db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]);
    if (found.length === 0) return null;
    return sqliteAll(db, `SELECT * FROM "${table}" ORDER BY rowid`);
}

// แปลงแถวเป็น string เพื่อเทียบ SQLite กับ Postgres แบบไม่สนลำดับ
const fingerprint = (row: Row, fields: string[]) => JSON.stringify(fields.map((f) => (row[f] instanceof Date ? (row[f] as Date).getTime() : row[f])));

async function main(): Promise<void> {
    if (!process.env.DATABASE_URL) throw new Error('ยังไม่ได้ตั้งค่า DATABASE_URL ในไฟล์ .env');
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    // เข้าถึง delegate ตามชื่อ model (config / level / ...) แบบ dynamic
    const delegate = (client: unknown, model: string) => (client as Record<string, any>)[model]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const sources: Partial<Record<'main' | 'pr', sqlite3.Database>> = {};
    // เฉพาะแถวของเซิร์ฟเวอร์หลัก (ตาราง user ของ Voice Guard: เฉพาะห้องของเซิร์ฟเวอร์หลัก)
    const whereHome = async (client: unknown, def: TableDef): Promise<Row> => {
        if (!def.channelsModel) return { guildId: HOME_GUILD_ID };
        const channels = (await delegate(client, def.channelsModel).findMany({ where: { guildId: HOME_GUILD_ID }, select: { channelId: true } })) as { channelId: string }[];
        return { channelId: { in: channels.map((c) => c.channelId) } };
    };

    console.log(DRY_RUN ? '🔍 Dry run — อ่านอย่างเดียว ไม่เขียนอะไรลง PostgreSQL' : '🚚 เริ่มย้ายข้อมูล SQLite → PostgreSQL');
    try {
        if (!fs.existsSync(SOURCE_FILES.main)) throw new Error(`ไม่พบไฟล์ SQLite: ${SOURCE_FILES.main}`);
        for (const [name, file] of Object.entries(SOURCE_FILES) as ['main' | 'pr', string][]) {
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
            const data: Row[] = [];
            let skipped = 0;
            for (const row of rows ?? []) {
                const item = def.transform(row);
                if (def.required.some((f) => item[f] === null || item[f] === undefined)) {
                    skipped++;
                    console.log(`⚠️  ข้ามแถวใน ${def.table} เพราะข้อมูลไม่ครบ:`, row);
                    continue;
                }
                data.push(item);
            }
            plan.push({ ...def, hasSource: rows !== null, data, skipped, existing: (await delegate(prisma, def.model).count({ where: await whereHome(prisma, def) })) as number });
        }

        console.table(plan.map((p) => ({ table: p.table, sqlite: p.hasSource ? p.data.length : '(no table)', skipped: p.skipped, postgres_now: p.existing })));
        if (DRY_RUN) return;

        const toImport = plan.filter((p) => p.hasSource);
        const nonEmpty = toImport.filter((p) => p.existing > 0);
        if (nonEmpty.length > 0 && !FORCE) {
            throw new Error(
                `ตารางใน PostgreSQL มีข้อมูลอยู่แล้ว: ${nonEmpty.map((p) => `${p.table} (${p.existing})`).join(', ')}\n` +
                    '   ถ้าต้องการลบข้อมูลเหล่านี้แล้วแทนที่ด้วยข้อมูลจาก SQLite ให้รันใหม่พร้อม --force',
            );
        }

        // 2. เขียนลง Postgres ใน transaction เดียว — ถ้าพังกลางทาง จะไม่มีอะไรถูกเขียนเลย
        await prisma.$transaction(
            async (tx) => {
                // ลบตาราง user ก่อนตารางห้อง (ต้องใช้ห้องหาว่า user แถวไหนเป็นของเซิร์ฟเวอร์หลัก)
                if (FORCE) for (const p of [...toImport].sort((a, b) => Number(Boolean(b.channelsModel)) - Number(Boolean(a.channelsModel)))) {
                    await delegate(tx, p.model).deleteMany({ where: await whereHome(tx, p) });
                }
                for (const p of toImport) {
                    for (let i = 0; i < p.data.length; i += CHUNK_SIZE) {
                        await delegate(tx, p.model).createMany({ data: p.data.slice(i, i + CHUNK_SIZE) });
                    }
                }
                // เซิร์ฟเวอร์หลักต้องอยู่ในตาราง guilds (ชื่อ/รูปถูกเติมเองตอนบอทออนไลน์)
                await tx.guild.createMany({ data: [{ id: HOME_GUILD_ID }], skipDuplicates: true });
                // room_access ใส่ id เดิมเข้าไปเอง → ต้องเลื่อน sequence ให้เกิน id สูงสุด ไม่งั้นแถวใหม่จะชน primary key
                await tx.$queryRaw`SELECT setval(pg_get_serial_sequence('room_access', 'id'), COALESCE((SELECT MAX(id) FROM room_access), 0) + 1, false)`;
            },
            { timeout: 120000 },
        );

        // 3. ตรวจสอบ: อ่านกลับจาก Postgres แล้วเทียบกับข้อมูลจาก SQLite ทีละแถว
        let allMatch = true;
        for (const p of toImport) {
            const select = Object.fromEntries(p.fields.map((f) => [f, true]));
            const actual = ((await delegate(prisma, p.model).findMany({ where: await whereHome(prisma, p), select })) as Row[]).map((r) => fingerprint(r, p.fields)).sort();
            const expected = p.data.map((r) => fingerprint(r, p.fields)).sort();
            const match = actual.length === expected.length && actual.every((v, i) => v === expected[i]);
            if (!match) allMatch = false;
            console.log(`${match ? '✅' : '❌'} ${p.table}: SQLite ${expected.length} แถว / PostgreSQL ${actual.length} แถว`);
        }

        if (!allMatch) throw new Error('ข้อมูลใน PostgreSQL ไม่ตรงกับ SQLite — ตรวจสอบว่าไม่มีบอทตัวอื่นเขียนข้อมูลอยู่ระหว่างย้าย แล้วรันใหม่ด้วย --force');
        console.log('🎉 ย้ายข้อมูลเสร็จ ข้อมูลตรงกันทุกตาราง');
    } finally {
        for (const db of Object.values(sources)) db?.close();
        await prisma.$disconnect();
    }
}

main().catch((err: Error) => {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
});
