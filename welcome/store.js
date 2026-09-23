// ==========================================
// 💾 WELCOME STORE — การ์ดต้อนรับ (welcome_cards) + คลังรูปพื้นหลัง (welcome_assets)
// ใช้ Prisma client ตัวเดียวกับทั้งโปรเจกต์ — ไม่มี cache เพราะอ่านแค่ตอนมีคนเข้าเซิร์ฟเวอร์และตอนแอดมินแก้
// ==========================================
const { prisma } = require('../prisma/client');
const { normalizeDesign } = require('./design');

const CARD_FIELDS = {
    id: true,
    name: true,
    enabled: true,
    channelId: true,
    content: true,
    design: true,
    backgroundId: true,
    createdAt: true,
    updatedAt: true,
};

// ไม่ดึงคอลัมน์ data (ตัวไฟล์รูป) มาด้วยเวลาแสดงรายการ
const ASSET_FIELDS = {
    id: true,
    name: true,
    mimeType: true,
    width: true,
    height: true,
    size: true,
    createdAt: true,
};

// design ในฐานข้อมูลอาจมาจากโค้ดเวอร์ชันเก่า — ผ่าน normalize ทุกครั้งที่อ่าน จะได้มีฟิลด์ครบเสมอ
const toCard = (row) => (row ? { ...row, design: normalizeDesign(row.design) } : null);

async function listCards() {
    const rows = await prisma.welcomeCard.findMany({ select: CARD_FIELDS, orderBy: { id: 'asc' } });
    return rows.map(toCard);
}

async function listEnabledCards() {
    const rows = await prisma.welcomeCard.findMany({
        where: { enabled: true, channelId: { not: '' } },
        select: CARD_FIELDS,
        orderBy: { id: 'asc' },
    });
    return rows.map(toCard);
}

async function getCard(id) {
    return toCard(await prisma.welcomeCard.findUnique({ where: { id }, select: CARD_FIELDS }));
}

async function createCard(data) {
    return toCard(await prisma.welcomeCard.create({ data, select: CARD_FIELDS }));
}

// คืน null ถ้าไม่มีการ์ดนี้ (ถูกลบไปแล้วจากอีกแท็บ)
async function updateCard(id, data) {
    const { count } = await prisma.welcomeCard.updateMany({ where: { id }, data });
    return count ? getCard(id) : null;
}

async function deleteCard(id) {
    const { count } = await prisma.welcomeCard.deleteMany({ where: { id } });
    return count > 0;
}

const listAssets = () => prisma.welcomeAsset.findMany({ select: ASSET_FIELDS, orderBy: { id: 'desc' } });

const getAssetInfo = (id) => prisma.welcomeAsset.findUnique({ where: { id }, select: ASSET_FIELDS });

const getAssetFile = (id) =>
    prisma.welcomeAsset.findUnique({ where: { id }, select: { id: true, mimeType: true, data: true } });

const createAsset = (data) => prisma.welcomeAsset.create({ data, select: ASSET_FIELDS });

async function renameAsset(id, name) {
    const { count } = await prisma.welcomeAsset.updateMany({ where: { id }, data: { name } });
    return count ? getAssetInfo(id) : null;
}

// การ์ดที่ใช้รูปนี้อยู่จะถูกตั้ง background_id เป็น null ให้เอง (ON DELETE SET NULL)
async function deleteAsset(id) {
    const { count } = await prisma.welcomeAsset.deleteMany({ where: { id } });
    return count > 0;
}

module.exports = {
    listCards,
    listEnabledCards,
    getCard,
    createCard,
    updateCard,
    deleteCard,
    listAssets,
    getAssetInfo,
    getAssetFile,
    createAsset,
    renameAsset,
    deleteAsset,
};
