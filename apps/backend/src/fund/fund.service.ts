import { Injectable, Logger } from '@nestjs/common';
import {
    FUND_LIMITS,
    defaultAvatarUrl,
    fundCsvFilename,
    fundMemberStatus,
    generateFundCsv,
    roundMoney,
    type AddFundMembersData,
    type BatchFundPaymentData,
    type CreateFundPaymentData,
    type CreateFundTopicData,
    type FundMemberView,
    type FundPaymentView,
    type FundTopicDetail,
    type FundTopicSummary,
    type SendFundReportInput,
    type UpdateFundMemberData,
    type UpdateFundPaymentData,
    type UpdateFundTopicData,
} from '@notstack/shared';
import { AttachmentBuilder, type GuildMember } from 'discord.js';
import { badRequest, notFound } from '../common/exceptions/api.exception';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildFundReport } from './utils/fund-report';
import { renderFundReportCard } from './utils/fund-report-card.renderer';
import { planPaidAdjustment } from './utils/paid-adjustment';

type Decimalish = { toNumber(): number } | null | undefined;
const toNum = (value: Decimalish): number => (value ? roundMoney(value.toNumber()) : 0);

// วันที่จาก body: ไม่ส่งมา = ไม่แก้ค่าเดิม, ค่าว่าง/null = ล้างค่า
const patchDate = (value: string | null | undefined): Date | null | undefined => (value === undefined ? undefined : value ? new Date(value) : null);
const toDateOrNull = (value: string | null | undefined): Date | null => (value ? new Date(value) : null);

// ข้อมูลดิบจากฐานข้อมูลก่อนแปลงเป็นข้อมูลหน้าเว็บ
interface TopicRow {
    id: number;
    guildId: string;
    name: string;
    description: string;
    amountPerMember: Decimalish;
    dailyRate?: Decimalish;
    startDate?: Date | null;
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
    periodStart?: Date | null;
    periodEnd?: Date | null;
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
        const avatars = await this.avatars(
            guildId,
            topic.members.map((m) => m.userId),
        );
        const members: FundMemberView[] = computed.map((m) => ({ ...m, avatar: avatars.get(m.userId) ?? defaultAvatarUrl(m.userId) }));
        const names = new Map(topic.members.map((m) => [m.id, m.displayName]));
        const payments: FundPaymentView[] = topic.payments.map((p) => ({
            id: p.id,
            memberId: p.memberId,
            memberName: names.get(p.memberId) ?? '-',
            amount: toNum(p.amount),
            note: p.note,
            paidAt: p.paidAt.toISOString(),
            periodStart: p.periodStart?.toISOString() ?? null,
            periodEnd: p.periodEnd?.toISOString() ?? null,
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
                dailyRate: body.dailyRate ?? null,
                startDate: toDateOrNull(body.startDate),
                reportChannelId: body.reportChannelId ?? '',
                dueDate: toDateOrNull(body.dueDate),
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
                dailyRate: body.dailyRate,
                startDate: patchDate(body.startDate),
                reportChannelId: body.reportChannelId,
                dueDate: patchDate(body.dueDate),
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

    async updateMember(guildId: string, topicId: number, memberId: number, body: UpdateFundMemberData, recordedBy = 'Dashboard'): Promise<void> {
        const topic = await this.requireTopic(guildId, topicId);
        await this.requireMember(topicId, memberId);
        if (body.paidAmount !== undefined && topic.closed) throw badRequest('หัวข้อนี้ปิดการเก็บเงินแล้ว — เปิดอีกครั้งก่อนแก้ไขยอดเงิน');

        await this.prisma.$transaction(async (tx) => {
            if (body.targetAmount !== undefined) {
                await tx.fundMember.update({ where: { id: memberId }, data: { targetAmount: body.targetAmount } });
            }
            if (body.paidAmount !== undefined) {
                const payments = await tx.fundPayment.findMany({
                    where: { topicId, memberId },
                    orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
                    select: { id: true, amount: true },
                });
                const plan = planPaidAdjustment(
                    payments.map((p) => ({ id: p.id, amount: toNum(p.amount) })),
                    body.paidAmount,
                );
                if (plan.deleteIds.length) await tx.fundPayment.deleteMany({ where: { id: { in: plan.deleteIds } } });
                for (const update of plan.updates) {
                    await tx.fundPayment.update({ where: { id: update.id }, data: { amount: update.amount, recordedBy } });
                }
                if (plan.create !== null) {
                    await tx.fundPayment.create({
                        data: { topicId, memberId, amount: plan.create, note: 'ปรับปรุงยอดจ่ายแล้ว', paidAt: new Date(), recordedBy },
                    });
                }
            }
            await tx.fundTopic.update({ where: { id: topicId }, data: { updatedAt: new Date() } });
        });
    }

    async removeMember(guildId: string, topicId: number, memberId: number): Promise<void> {
        await this.requireTopic(guildId, topicId);
        await this.requireMember(topicId, memberId);
        // รายการรับเงินของคนนี้ลบตาม (ON DELETE CASCADE)
        await this.prisma.fundMember.delete({ where: { id: memberId } });
        await this.touch(topicId);
    }

    // ---------- รับเงิน ----------
    async addPayment(guildId: string, topicId: number, body: CreateFundPaymentData, recordedBy: string): Promise<void> {
        await this.requireOpenTopic(guildId, topicId, 'บันทึกรายการ');
        await this.requireMember(topicId, body.memberId);
        await this.prisma.fundPayment.create({
            data: {
                topicId,
                memberId: body.memberId,
                amount: body.amount,
                note: body.note ?? '',
                paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
                periodStart: toDateOrNull(body.periodStart),
                periodEnd: toDateOrNull(body.periodEnd),
                recordedBy,
            },
        });
        await this.touch(topicId);
    }

    async updatePayment(guildId: string, topicId: number, paymentId: number, body: UpdateFundPaymentData, recordedBy: string): Promise<void> {
        await this.requireOpenTopic(guildId, topicId, 'แก้ไขรายการ');
        const existing = await this.prisma.fundPayment.findFirst({ where: { id: paymentId, topicId } });
        if (!existing) throw notFound('ไม่พบรายการรับเงินนี้');
        if (body.memberId !== undefined) await this.requireMember(topicId, body.memberId);

        await this.prisma.fundPayment.update({
            where: { id: paymentId },
            data: {
                memberId: body.memberId,
                amount: body.amount,
                note: body.note,
                paidAt: body.paidAt ? new Date(body.paidAt) : undefined, // วันเวลาที่รับเงินล้างไม่ได้
                periodStart: patchDate(body.periodStart),
                periodEnd: patchDate(body.periodEnd),
                recordedBy,
            },
        });
        await this.touch(topicId);
    }

    async batchPayments(guildId: string, topicId: number, body: BatchFundPaymentData, recordedBy: string): Promise<{ count: number }> {
        await this.requireOpenTopic(guildId, topicId, 'บันทึกรายการ');
        if (!body.memberIds.length) throw badRequest('กรุณาเลือกสมาชิกอย่างน้อย 1 คน');

        const members = await this.prisma.fundMember.findMany({
            where: { topicId, id: { in: body.memberIds } },
            select: { id: true },
        });
        if (members.length === 0) throw badRequest('ไม่พบสมาชิกที่เลือกในหัวข้อนี้');

        const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
        const periodStart = toDateOrNull(body.periodStart);
        const periodEnd = toDateOrNull(body.periodEnd);

        await this.prisma.fundPayment.createMany({
            data: members.map((m) => ({
                topicId,
                memberId: m.id,
                amount: body.amount,
                note: body.note ?? '',
                paidAt,
                periodStart,
                periodEnd,
                recordedBy,
            })),
        });
        await this.touch(topicId);
        return { count: members.length };
    }

    async removePayment(guildId: string, topicId: number, paymentId: number): Promise<void> {
        await this.requireTopic(guildId, topicId);
        const { count } = await this.prisma.fundPayment.deleteMany({ where: { id: paymentId, topicId } });
        if (!count) throw notFound('ไม่พบรายการรับเงินนี้');
        await this.touch(topicId);
    }

    async exportCsv(guildId: string, topicId: number): Promise<{ filename: string; csv: string }> {
        const detail = await this.detail(guildId, topicId);
        return { filename: fundCsvFilename(detail.name), csv: generateFundCsv(detail) };
    }

    // ---------- รายงาน ----------
    async renderReportImage(guildId: string, topicId: number, compact = false): Promise<Buffer> {
        const detail = await this.detail(guildId, topicId);
        return renderFundReportCard(detail, compact);
    }

    async sendReport(guildId: string, topicId: number, body: SendFundReportInput): Promise<{ channelName: string }> {
        const detail = await this.detail(guildId, topicId);
        const channelId = body.channelId || detail.reportChannelId;
        if (!channelId) throw badRequest('ยังไม่ได้เลือกห้องส่งรายงานของหัวข้อนี้');
        const channel = await this.assertSendableChannel(guildId, channelId);

        const payload = buildFundReport(detail, { mentionUnpaid: body.mentionUnpaid ?? false });
        try {
            const image = await renderFundReportCard(detail);
            await channel.send({
                ...(payload.content ? { content: payload.content } : {}),
                files: [new AttachmentBuilder(image, { name: 'fund-report.png' })],
                allowedMentions: payload.allowedMentions,
            });
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
            dailyRate: toNum(topic.dailyRate) || null,
            startDate: topic.startDate?.toISOString() ?? null,
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

    private async requireOpenTopic(guildId: string, topicId: number, action: string) {
        const topic = await this.requireTopic(guildId, topicId);
        if (topic.closed) throw badRequest(`หัวข้อนี้ปิดการเก็บเงินแล้ว — เปิดอีกครั้งก่อน${action}`);
        return topic;
    }

    // เรียกหลัง requireTopic เสมอ (ตรวจว่าหัวข้อเป็นของเซิร์ฟเวอร์นี้แล้ว)
    private async requireMember(topicId: number, memberId: number) {
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

    // หาข้อมูลของหลายคนพร้อมกัน (discord.js จัดคิว rate limit ให้เอง) — คนที่หาไม่เจอจะไม่อยู่ใน Map
    private async lookupUsers(userIds: string[], find: (userId: string) => Promise<string | null>): Promise<Map<string, string>> {
        const found = await Promise.all(userIds.map(async (userId) => [userId, await find(userId)] as const));
        return new Map(found.filter((entry): entry is readonly [string, string] => entry[1] !== null));
    }

    private displayNames(guildId: string, userIds: string[]): Promise<Map<string, string>> {
        const guild = this.discord.guild(guildId);
        return this.lookupUsers(userIds, async (userId) => {
            const member = guild?.members.cache.get(userId) ?? (await guild?.members.fetch(userId).catch(() => null));
            if (member) return member.displayName;
            const user = await this.discord.fetchUser(userId);
            return user ? user.globalName || user.username : null;
        });
    }

    private avatars(guildId: string, userIds: string[]): Promise<Map<string, string>> {
        const guild = this.discord.guild(guildId);
        return this.lookupUsers(userIds, async (userId) => {
            const member = guild?.members.cache.get(userId);
            if (member) return member.displayAvatarURL({ size: 64 });
            const user = await this.discord.fetchUser(userId);
            return user ? user.displayAvatarURL({ size: 64 }) : null;
        });
    }
}
