import { Injectable } from '@nestjs/common';
import { normalizeDesign, type WelcomeAsset, type WelcomeCard, type WelcomeDesign } from '@notstack/shared';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
} satisfies Prisma.WelcomeCardSelect;

// ไม่ดึงคอลัมน์ data (ตัวไฟล์รูป) มาด้วยเวลาแสดงรายการ
const ASSET_FIELDS = {
    id: true,
    name: true,
    mimeType: true,
    width: true,
    height: true,
    size: true,
    createdAt: true,
} satisfies Prisma.WelcomeAssetSelect;

type CardRow = Prisma.WelcomeCardGetPayload<{ select: typeof CARD_FIELDS }>;
type AssetRow = Prisma.WelcomeAssetGetPayload<{ select: typeof ASSET_FIELDS }>;

export interface CardData {
    name: string;
    enabled: boolean;
    channelId: string;
    content: string;
    design: WelcomeDesign;
    backgroundId: number | null;
}

// design ในฐานข้อมูลอาจมาจากโค้ดเวอร์ชันเก่า — ผ่าน normalize ทุกครั้งที่อ่าน จะได้มีฟิลด์ครบเสมอ
const toCard = (row: CardRow): WelcomeCard => ({
    ...row,
    design: normalizeDesign(row.design),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
});

const toAsset = (row: AssetRow): WelcomeAsset => ({ ...row, createdAt: row.createdAt.toISOString() });

// ==========================================
// 💾 WELCOME STORE — การ์ดต้อนรับ (welcome_cards) + คลังรูปพื้นหลัง (welcome_assets) ของแต่ละเซิร์ฟเวอร์
// ไม่มี cache เพราะอ่านแค่ตอนมีคนเข้าเซิร์ฟเวอร์และตอนแอดมินแก้
// ทุกเมธอดรับ guildId — การ์ด/รูปของเซิร์ฟเวอร์อื่นจะหาไม่เจอ (เหมือนไม่มีอยู่)
// ==========================================
@Injectable()
export class WelcomeStore {
    constructor(private readonly prisma: PrismaService) {}

    async listCards(guildId: string): Promise<WelcomeCard[]> {
        const rows = await this.prisma.welcomeCard.findMany({ where: { guildId }, select: CARD_FIELDS, orderBy: { id: 'asc' } });
        return rows.map(toCard);
    }

    async listEnabledCards(guildId: string): Promise<WelcomeCard[]> {
        const rows = await this.prisma.welcomeCard.findMany({
            where: { guildId, enabled: true, channelId: { not: '' } },
            select: CARD_FIELDS,
            orderBy: { id: 'asc' },
        });
        return rows.map(toCard);
    }

    async getCard(guildId: string, id: number): Promise<WelcomeCard | null> {
        const row = await this.prisma.welcomeCard.findFirst({ where: { id, guildId }, select: CARD_FIELDS });
        return row ? toCard(row) : null;
    }

    async createCard(guildId: string, data: CardData): Promise<WelcomeCard> {
        return toCard(await this.prisma.welcomeCard.create({ data: { ...data, guildId, design: data.design as unknown as Prisma.InputJsonValue }, select: CARD_FIELDS }));
    }

    // คืน null ถ้าไม่มีการ์ดนี้ (ถูกลบไปแล้วจากอีกแท็บ)
    async updateCard(guildId: string, id: number, data: Partial<CardData>): Promise<WelcomeCard | null> {
        const { design, ...rest } = data;
        const { count } = await this.prisma.welcomeCard.updateMany({
            where: { id, guildId },
            data: { ...rest, ...(design ? { design: design as unknown as Prisma.InputJsonValue } : {}) },
        });
        return count ? this.getCard(guildId, id) : null;
    }

    async deleteCard(guildId: string, id: number): Promise<boolean> {
        const { count } = await this.prisma.welcomeCard.deleteMany({ where: { id, guildId } });
        return count > 0;
    }

    async listAssets(guildId: string): Promise<WelcomeAsset[]> {
        const rows = await this.prisma.welcomeAsset.findMany({ where: { guildId }, select: ASSET_FIELDS, orderBy: { id: 'desc' } });
        return rows.map(toAsset);
    }

    async getAssetInfo(guildId: string, id: number): Promise<WelcomeAsset | null> {
        const row = await this.prisma.welcomeAsset.findFirst({ where: { id, guildId }, select: ASSET_FIELDS });
        return row ? toAsset(row) : null;
    }

    // ใช้ตอนวาดการ์ด (id ถูกตรวจแล้วว่าเป็นของเซิร์ฟเวอร์ไหนตอนบันทึก/ขอตัวอย่าง)
    getAssetFile(id: number) {
        return this.prisma.welcomeAsset.findUnique({ where: { id }, select: { id: true, mimeType: true, data: true } });
    }

    getGuildAssetFile(guildId: string, id: number) {
        return this.prisma.welcomeAsset.findFirst({ where: { id, guildId }, select: { id: true, mimeType: true, data: true } });
    }

    async createAsset(guildId: string, data: { name: string; mimeType: string; width: number; height: number; size: number; data: Buffer }): Promise<WelcomeAsset> {
        return toAsset(await this.prisma.welcomeAsset.create({ data: { ...data, guildId, data: new Uint8Array(data.data) }, select: ASSET_FIELDS }));
    }

    async renameAsset(guildId: string, id: number, name: string): Promise<WelcomeAsset | null> {
        const { count } = await this.prisma.welcomeAsset.updateMany({ where: { id, guildId }, data: { name } });
        return count ? this.getAssetInfo(guildId, id) : null;
    }

    // การ์ดที่ใช้รูปนี้อยู่จะถูกตั้ง background_id เป็น null ให้เอง (ON DELETE SET NULL)
    async deleteAsset(guildId: string, id: number): Promise<boolean> {
        const { count } = await this.prisma.welcomeAsset.deleteMany({ where: { id, guildId } });
        return count > 0;
    }
}
