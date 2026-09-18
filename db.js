// ==========================================
// 💾 DATABASE (PostgreSQL ผ่าน Prisma)
// โครงสร้างตารางอยู่ใน prisma/schema.prisma — สร้าง/อัปเดตตารางด้วย `npm run db:migrate`
// ฟังก์ชันด้านล่างคืนค่ารูปแบบเดิมตอนใช้ SQLite (เช่น expireAt เป็นเลข ms) โค้ดส่วนอื่นจึงเรียกใช้ได้เหมือนเดิม
// ==========================================
const path = require("path");
const fs = require("fs");
const { prisma } = require("./prisma/client");

const CONFIG_DEFAULTS = [
  {
    key: "LOG_CHANNEL_ID",
    value: "1369338812819312731",
    description: "ห้องสำหรับส่ง Log ทั่วไป",
  },
  {
    key: "ALERT_CHANNEL_ID",
    value: "1333089825376436295",
    description: "ห้องสำหรับแจ้งเตือนความปลอดภัย",
  },
  {
    key: "GENERAL_CHANNEL_ID",
    value: "1273939427575595184",
    description: "ห้องสำหรับส่งพยากรณ์อากาศ",
  },
  {
    key: "WELCOME_CHANNEL_ID",
    value: "1403025308512157746",
    description: "ห้อง Welcome",
  },
  {
    key: "GOODBYE_CHANNEL_ID",
    value: "1403025414447956019",
    description: "ห้อง Goodbye",
  },
  { key: "NEWS_CHANNEL_ID", value: "", description: "ห้องสำหรับประกาศข่าวสาร" },
];

// เติมค่า default ที่ยังไม่มี (skipDuplicates = ON CONFLICT DO NOTHING → ไม่ทับค่าที่แอดมินตั้งไว้แล้ว)
async function initDatabase() {
  await prisma.config.createMany({
    data: CONFIG_DEFAULTS,
    skipDuplicates: true,
  });

  // Migrate from levels.json if exists
  const levelsFile = path.join(__dirname, "levels.json");
  if (fs.existsSync(levelsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(levelsFile, "utf8"));
      await prisma.level.createMany({
        data: Object.entries(data).map(([userId, d]) => ({
          userId,
          xp: d.xp,
          level: d.level,
        })),
        skipDuplicates: true,
      });

      // ถ้าย้ายเสร็จแล้ว เปลี่ยนชื่อไฟล์เพื่อไม่ให้มันโหลดซ้ำ
      fs.renameSync(levelsFile, path.join(__dirname, "levels_migrated.json"));
      console.log("✅ Migrated levels.json to PostgreSQL database");
    } catch (e) {
      console.error("Error migrating levels:", e);
    }
  }
}
initDatabase().catch((err) =>
  console.error("Error initializing database", err),
);

const getConfig = async (key) => {
  const row = await prisma.config.findUnique({
    where: { key },
    select: { value: true },
  });
  return row ? row.value : null;
};

const getAllConfigs = () =>
  prisma.config.findMany({
    select: { key: true, value: true, description: true },
    orderBy: { sortOrder: "asc" },
  });

const updateConfig = async (key, value) => {
  const { count } = await prisma.config.updateMany({
    where: { key },
    data: { value },
  });
  return count;
};

// --- Levels Functions ---
const getAllLevels = () =>
  prisma.level.findMany({
    orderBy: [{ level: "desc" }, { xp: "desc" }],
  });

// เซฟทุกคนใน memory รวดเดียวด้วย query เดียว (INSERT ... ON CONFLICT + UNNEST)
// ถ้าใช้ prisma.level.upsert ทีละคน จะยิงหลาย round trip ไปเซิร์ฟเวอร์ Postgres ทุกครั้งที่มีคนได้ XP
const saveAllLevelsToDB = async (levelsData) => {
  const userIds = Object.keys(levelsData);
  if (userIds.length === 0) return;
  const xps = userIds.map((id) => levelsData[id].xp);
  const levels = userIds.map((id) => levelsData[id].level);

  await prisma.$executeRaw`
        INSERT INTO levels (user_id, xp, level)
        SELECT * FROM UNNEST(${userIds}::text[], ${xps}::int[], ${levels}::int[])
        ON CONFLICT (user_id) DO UPDATE SET xp = EXCLUDED.xp, level = EXCLUDED.level`;
};

// --- Room Access Functions ---
// expireAt เก็บเป็น timestamptz ใน Postgres แต่ภายนอกยังรับ/คืนเป็นเลข ms (แบบ Date.now()) เหมือนเดิม
const addRoomAccess = async (userId, roomId, expireAt) => {
  const record = await prisma.roomAccess.create({
    data: { userId, roomId, expireAt: new Date(expireAt) },
  });
  return record.id;
};

const removeRoomAccess = async (userId, roomId) => {
  const { count } = await prisma.roomAccess.deleteMany({
    where: { userId, roomId },
  });
  return count;
};

const getActiveRoomAccess = async () => {
  const rows = await prisma.roomAccess.findMany();
  return rows.map((row) => ({ ...row, expireAt: row.expireAt.getTime() }));
};

const markRoomAccessNotified = async (id) => {
  const { count } = await prisma.roomAccess.updateMany({
    where: { id },
    data: { notified: true },
  });
  return count;
};

const deleteRoomAccessRecord = async (id) => {
  const { count } = await prisma.roomAccess.deleteMany({ where: { id } });
  return count;
};

// ==========================================
// Voice Guard — Whitelist / Blacklist
// สองระบบมีโครงสร้างเหมือนกันทุกอย่าง ต่างกันแค่ตาราง จึงสร้างชุดฟังก์ชันจาก factory เดียว
// ==========================================

// หน้า Dashboard ส่ง enabled มาเป็น 1/0 — แปลงเป็น boolean ให้ตรงกับคอลัมน์ใน Postgres
const toBoolean = (value) =>
  typeof value === "boolean" ? value : Boolean(Number(value));

function createVoiceGuardStore(channelTable, userTable) {
  return {
    getChannels: () => channelTable.findMany(),

    getChannel: (channelId) =>
      channelTable.findUnique({ where: { channelId } }),

    // อัปเดตเฉพาะ enabled โดยไม่แตะ notify ที่ตั้งไว้
    upsertChannel: async (channelId, enabled = 1) => {
      const value = toBoolean(enabled);
      await channelTable.upsert({
        where: { channelId },
        create: { channelId, enabled: value },
        update: { enabled: value },
      });
      return 1;
    },

    // สวิตช์ "ส่ง DM แจ้งผู้ใช้เมื่อถูกเตะออก" — อัปเดตเฉพาะ notify โดยไม่แตะ enabled
    setChannelNotify: async (channelId, notify = 1) => {
      const value = toBoolean(notify);
      await channelTable.upsert({
        where: { channelId },
        create: { channelId, notify: value },
        update: { notify: value },
      });
      return 1;
    },

    deleteChannel: async (channelId) => {
      const [, deletedChannels] = await prisma.$transaction([
        userTable.deleteMany({ where: { channelId } }),
        channelTable.deleteMany({ where: { channelId } }),
      ]);
      return deletedChannels.count;
    },

    getUsers: async (channelId) => {
      const rows = await userTable.findMany({
        where: { channelId },
        select: { userId: true },
      });
      return rows.map((r) => r.userId);
    },

    getAllUsers: () => userTable.findMany(),

    addUser: async (channelId, userId) => {
      const { count } = await userTable.createMany({
        data: [{ channelId, userId }],
        skipDuplicates: true,
      });
      return count;
    },

    removeUser: async (channelId, userId) => {
      const { count } = await userTable.deleteMany({
        where: { channelId, userId },
      });
      return count;
    },
  };
}

const whitelist = createVoiceGuardStore(
  prisma.voiceWhitelistChannel,
  prisma.voiceWhitelistUser,
);
const blacklist = createVoiceGuardStore(
  prisma.voiceBlacklistChannel,
  prisma.voiceBlacklistUser,
);

module.exports = {
  prisma,
  getConfig,
  getAllConfigs,
  updateConfig,
  getAllLevels,
  saveAllLevelsToDB,
  addRoomAccess,
  removeRoomAccess,
  getActiveRoomAccess,
  markRoomAccessNotified,
  deleteRoomAccessRecord,
  getWhitelistChannels: whitelist.getChannels,
  getWhitelistChannel: whitelist.getChannel,
  upsertWhitelistChannel: whitelist.upsertChannel,
  setWhitelistChannelNotify: whitelist.setChannelNotify,
  deleteWhitelistChannel: whitelist.deleteChannel,
  getWhitelistUsers: whitelist.getUsers,
  getAllWhitelistUsers: whitelist.getAllUsers,
  addWhitelistUser: whitelist.addUser,
  removeWhitelistUser: whitelist.removeUser,
  getBlacklistChannels: blacklist.getChannels,
  getBlacklistChannel: blacklist.getChannel,
  upsertBlacklistChannel: blacklist.upsertChannel,
  setBlacklistChannelNotify: blacklist.setChannelNotify,
  deleteBlacklistChannel: blacklist.deleteChannel,
  getBlacklistUsers: blacklist.getUsers,
  getAllBlacklistUsers: blacklist.getAllUsers,
  addBlacklistUser: blacklist.addUser,
  removeBlacklistUser: blacklist.removeUser,
};
