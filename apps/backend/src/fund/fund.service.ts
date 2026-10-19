import { Injectable, Logger } from '@nestjs/common';
import {
    FUND_LIMITS,
    fundMemberStatus,
    roundMoney,
    type AddFundMembersData,
    type CreateFundPaymentData,
    type CreateFundTopicData,
    type FundMemberView,
    type FundPaymentView,
    type FundTopicDetail,
    type FundTopicSummary,
    type SendFundReportInput,
    type UpdateFundMemberData,
    type UpdateFundTopicData,
} from '@notstack/shared';
import type { GuildMember } from 'discord.js';
import { badRequest, notFound } from '../common/exceptions/api.exception';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildFundReport } from './utils/fund-report';

type Decimalish = { toNumber(): number } | null | undefined;
const toNum = (value: Decimalish): number => (value ? roundMoney(value.toNumber()) : 0);

const fallbackAvatar = (userId: string) => {
    const index = /^\d+$/.test(userId) ? Number(BigInt(userId) % 5n) : 0;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
};

// ข้อมูลดิบจากฐานข้อมูลก่อนแปลงเป็นข้อมูลหน้าเว็บ
interface TopicRow {
    id: number;
    guildId: string;
    name: string;
    description: string;
    amountPerMember: Decimalish;
    reportChannelId: string;
    dueDate: Date | null;
    closed: boolean;
    createdAt: Date;
    updatedAt: Date;
}
interface MemberRow {
    id: number;
    userId: string;
    displayName: string;
    targetAmount: Decimalish;
}
interface PaymentRow {
    id: number;
    memberId: number;
    amount: Decimalish;
    note: string;
    paidAt: Date;
    recordedBy: string;
}

// ==========================================
// 💰 FUND — หัวข้อเก็บเงิน / คนที่ต้องจ่าย / รายการรับเงิน / ส่งรายงานเข้า Discord
// ทุกคำสั่งตรวจก่อนว่าหัวข้อเป็นของเซิร์ฟเวอร์ที่กำลังจัดการอยู่
// ==========================================
@Injectable()
export class FundService {
    private readonly logger = new Logger('Fund');

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    // ---------- หัวข้อ ----------
    async list(guildId: string): Promise<FundTopicSummary[]> {
        const topics = await this.prisma.fundTopic.findMany({
            where: { guildId },
            orderBy: [{ closed: 'asc' }, { createdAt: 'desc' }],
            include: { members: true, payments: { select: { memberId: true, amount: true } } },
        });
        return topics.map((topic) => this.summarize(topic, this.computeMembers(topic, topic.members, topic.payments)));
    }

    async detail(guildId: string, topicId: number): Promise<FundTopicDetail> {
        const topic = await this.prisma.fundTopic.findFirst({
            where: { id: topicId, guildId },
            include: { members: { orderBy: { createdAt: 'asc' } }, payments: { orderBy: { paidAt: 'desc' } } },
        });
        if (!topic) throw notFound('ไม่พบหัวข้อเก็บเงินนี้');
        const computed = this.computeMembers(topic, topic.members, topic.payments);
        const avatars = await this.avatars(guildId, topic.members.map((m) => m.userId));
        const members: FundMemberView[] = computed.map((m) => ({ ...m, avatar: avatars.get(m.userId) ?? fallbackAvatar(m.userId) }));
        const names = new Map(topic.members.map((m) => [m.id, m.displayName]));
        const payments: FundPaymentView[] = topic.payments.map((p) => ({
            id: p.id,
            memberId: p.memberId,
            memberName: names.get(p.memberId) ?? '-',
            amount: toNum(p.amount),
            note: p.note,
            paidAt: p.paidAt.toISOString(),
            recordedBy: p.recordedBy,
        }));
        return { ...this.summarize(topic, members), members, payments };
    }

    async create(guildId: string, body: CreateFundTopicData): Promise<FundTopicDetail> {
        if (body.reportChannelId) await this.assertSendableChannel(guildId, body.reportChannelId);
        const topic = await this.prisma.fundTopic.create({
            data: {
                guildId,
                name: body.name.trim(),
                description: body.description ?? '',
                amountPerMember: body.amountPerMember,
                reportChannelId: body.reportChannelId ?? '',
                dueDate: body.dueDate ? new Date(body.dueDate) : null,
            },
        });
        return this.detail(guildId, topic.id);
    }

    async update(guildId: string, topicId: number, body: UpdateFundTopicData): Promise<FundTopicDetail> {
        await this.requireTopic(guildId, topicId);
        if (body.reportChannelId) await this.assertSendableChannel(guildId, body.reportChannelId);
        await this.prisma.fundTopic.update({
            where: { id: topicId },
            data: {
                name: body.name?.trim(),
                description: body.description,
                amountPerMember: body.amountPerMember,
                reportChannelId: body.reportChannelId,
                dueDate: body.dueDate === undefined ? undefined : body.dueDate ? new Date(body.dueDate) : null,
                closed: body.closed,
            },
        });
        return this.detail(guildId, topicId);
    }

    async remove(guildId: string, topicId: number): Promise<void> {
        await this.requireTopic(guildId, topicId);
        // members / payments ลบตาม (ON DELETE CASCADE)
        await this.prisma.fundTopic.delete({ where: { id: topicId } });
    }

    // ---------- คน ----------
    async addMembers(guildId: string, topicId: number, body: AddFundMembersData): Promise<{ added: number; skipped: number }> {
        await this.requireTopic(guildId, topicId);
        const ids = new Set(body.userIds ?? []);
        if (body.roleId) {
            for (const member of await this.roleMembers(guildId, body.roleId)) ids.add(member.id);
        }
        if (ids.size === 0) throw badRequest('ไม่พบสมาชิกที่จะเพิ่ม');

        const existing = new Set((await this.prisma.fundMember.findMany({ where: { topicId }, select: { userId: true } })).map((m) => m.userId));
        const fresh = [...ids].filter((id) => !existing.has(id));
        if (existing.size + fresh.length > FUND_LIMITS.membersPerTopic) {
            throw badRequest(`หัวข้อหนึ่งมีคนได้ไม่เกิน ${FUND_LIMITS.membersPerTopic} คน (ตอนนี้มี ${existing.size} คน)`);
        }

        const names = await this.displayNames(guildId, fresh);
        const targetAmount = body.targetAmount ?? null;
        const result = await this.prisma.fundMember.createMany({
            data: fresh.map((userId) => ({ topicId, userId, displayName: names.get(userId) ?? userId, targetAmount })),
            skipDuplicates: true,
        });
        await this.touch(topicId);
        return { added: result.count, skipped: ids.size - result.count };
    }

    async updateMember(guildId: string, topicId: number, memberId: number, body: UpdateFundMemberData): Promise<void> {
        await this.requireMember(guildId, topicId, memberId);
        await this.prisma.fundMember.update({ where: { id: memberId }, data: { targetAmount: body.targetAmount } });
        await this.touch(topicId);
    }

    async removeMember(guildId: string, topicId: number, memberId: number): Promise<void> {
        await this.requireMember(guildId, topicId, memberId);
        // รายการรับเงินของคนนี้ลบตาม (ON DELETE CASCADE)
        await this.prisma.fundMember.delete({ where: { id: memberId } });
        await this.touch(topicId);
    }

    // ---------- รับเงิน ----------
    async addPayment(guildId: string, topicId: number, body: CreateFundPaymentData, recordedBy: string): Promise<void> {
        const topic = await this.requireTopic(guildId, topicId);
        if (topic.closed) throw badRequest('หัวข้อนี้ปิดการเก็บเงินแล้ว — เปิดอีกครั้งก่อนบันทึกรายการ');
        await this.requireMember(guildId, topicId, body.memberId);
        await this.prisma.fundPayment.create({
            data: {
                topicId,
                memberId: body.memberId,
                amount: body.amount,
                note: body.note ?? '',
                paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
                recordedBy,
            },
        });
        await this.touch(topicId);
    }

    async removePayment(guildId: string, topicId: number, paymentId: number): Promise<void> {
        await this.requireTopic(guildId, topicId);
        const { count } = await this.prisma.fundPayment.deleteMany({ where: { id: paymentId, topicId } });
        if (!count) throw notFound('ไม่พบรายการรับเงินนี้');
        await this.touch(topicId);
    }

    // ---------- รายงาน ----------
    async sendReport(guildId: string, topicId: number, body: SendFundReportInput): Promise<{ channelName: string }> {
        const detail = await this.detail(guildId, topicId);
        const channelId = body.channelId || detail.reportChannelId;
        if (!channelId) throw badRequest('ยังไม่ได้เลือกห้องส่งรายงานของหัวข้อนี้');
        const channel = await this.assertSendableChannel(guildId, channelId);

        const payload = buildFundReport(detail, { mentionUnpaid: body.mentionUnpaid ?? false });
        try {
            await channel.send(payload);
        } catch (err) {
            this.logger.error(`Error sending fund report: ${(err as Error).message}`);
            throw badRequest(`ส่งรายงานไม่สำเร็จ: ${(err as Error).message}`);
        }
        return { channelName: 'name' in channel && typeof channel.name === 'string' ? channel.name : channelId };
    }

    // ---------- helpers ----------
    private computeMembers(topic: TopicRow, members: MemberRow[], payments: Pick<PaymentRow, 'memberId' | 'amount'>[]): Omit<FundMemberView, 'avatar'>[] {
        const paidBy = new Map<number, number>();
        for (const p of payments) paidBy.set(p.memberId, roundMoney((paidBy.get(p.memberId) ?? 0) + toNum(p.amount)));
        const defaultTarget = toNum(topic.amountPerMember);
        return members.map((m) => {
            const customTarget = m.targetAmount !== null && m.targetAmount !== undefined;
            const target = customTarget ? toNum(m.targetAmount) : defaultTarget;
            const paid = paidBy.get(m.id) ?? 0;
            return {
                id: m.id,
                userId: m.userId,
                displayName: m.displayName,
                target,
                customTarget,
                paid,
                remaining: roundMoney(Math.max(0, target - paid)),
                status: fundMemberStatus(target, paid),
            };
        });
    }

    private summarize(topic: TopicRow, members: Omit<FundMemberView, 'avatar'>[]): FundTopicSummary {
        return {
            id: topic.id,
            name: topic.name,
            description: topic.description,
            amountPerMember: toNum(topic.amountPerMember),
            reportChannelId: topic.reportChannelId,
            dueDate: topic.dueDate?.toISOString() ?? null,
            closed: topic.closed,
            memberCount: members.length,
            paidCount: members.filter((m) => m.status === 'paid').length,
            target: roundMoney(members.reduce((sum, m) => sum + m.target, 0)),
            collected: roundMoney(members.reduce((sum, m) => sum + m.paid, 0)),
            createdAt: topic.createdAt.toISOString(),
            updatedAt: topic.updatedAt.toISOString(),
        };
    }

    private async requireTopic(guildId: string, topicId: number) {
        const topic = await this.prisma.fundTopic.findFirst({ where: { id: topicId, guildId } });
        if (!topic) throw notFound('ไม่พบหัวข้อเก็บเงินนี้');
        return topic;
    }

    private async requireMember(guildId: string, topicId: number, memberId: number) {
        await this.requireTopic(guildId, topicId);
        const member = await this.prisma.fundMember.findFirst({ where: { id: memberId, topicId } });
        if (!member) throw notFound('ไม่พบคนนี้ในหัวข้อ');
        return member;
    }

    // ให้ updatedAt ของหัวข้อขยับทุกครั้งที่มีการเปลี่ยนคน/รายการเงิน
    private async touch(topicId: number): Promise<void> {
        await this.prisma.fundTopic.update({ where: { id: topicId }, data: { updatedAt: new Date() } });
    }

    private async assertSendableChannel(guildId: string, channelId: string) {
        this.discord.requireReady();
        const channel = await this.discord.fetchGuildChannel(guildId, channelId);
        if (!channel || !channel.isSendable()) throw badRequest('ไม่พบห้องนี้ หรือบอทส่งข้อความเข้าห้องนี้ไม่ได้');
        return channel;
    }

    private async roleMembers(guildId: string, roleId: string): Promise<GuildMember[]> {
        const guild = this.discord.requireGuild(guildId);
        const role = guild.roles.cache.get(roleId);
        if (!role) throw badRequest('ไม่พบยศนี้ในเซิร์ฟเวอร์');
        // โหลดสมาชิกทั้งหมดก่อน (cache อาจยังไม่ครบ) — ข้ามบอท
        await guild.members.fetch().catch(() => null);
        return [...role.members.values()].filter((member) => !member.user.bot);
    }

    private async displayNames(guildId: string, userIds: string[]): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        const guild = this.discord.guild(guildId);
        for (const userId of userIds) {
            const member = guild?.members.cache.get(userId) ?? (await guild?.members.fetch(userId).catch(() => null));
            if (member) {
                result.set(userId, member.displayName);
                continue;
            }
            const user = await this.discord.fetchUser(userId);
            if (user) result.set(userId, user.globalName || user.username);
        }
        return result;
    }

    private async avatars(guildId: string, userIds: string[]): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        const guild = this.discord.guild(guildId);
        for (const userId of userIds) {
            const member = guild?.members.cache.get(userId);
            if (member) {
                result.set(userId, member.displayAvatarURL({ size: 64 }));
                continue;
            }
            const user = await this.discord.fetchUser(userId);
            if (user) result.set(userId, user.displayAvatarURL({ size: 64 }));
        }
        return result;
    }
}
