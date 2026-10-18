import { Injectable, Logger } from '@nestjs/common';
import { JIRA_LIMITS } from '@notstack/shared';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Events,
    MessageFlags,
    OverwriteType,
    PermissionFlagsBits,
    type ButtonInteraction,
    type Channel,
    type GuildMember,
    type Interaction,
    type ModalSubmitInteraction,
    type OverwriteResolvable,
    type StringSelectMenuInteraction,
} from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import type { JiraTicket } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JiraApiError, JiraClient } from '../clients/jira.client';
import { JiraService, type StoredJiraSettings } from '../jira.service';
import {
    cardCreatedMessage,
    cardLogMessage,
    issueModal,
    JIRA_IDS,
    parseJiraCustomId,
    ticketChannelName,
    ticketDoneComponents,
    ticketWelcomeMessage,
} from '../utils/jira.messages';

const ephemeral = MessageFlags.Ephemeral;

// สิทธิ์ในห้องส่วนตัวของคนเปิด / ทีมงาน / บอท
const MEMBER_ALLOW = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
];
const BOT_ALLOW = [...MEMBER_ALLOW, PermissionFlagsBits.ManageChannels];

// ==========================================
// 🎫 JIRA TICKET (ฝั่ง Discord)
// 1) ปุ่มในห้องแผง → สร้างห้องส่วนตัว (ทุกคนมองไม่เห็น ยกเว้นคนกด + ยศทีมงาน + บอท)
// 2) เมนูเลือกประเภทในห้องนั้น → pop-up กรอก title / description
// 3) ส่ง pop-up → สร้าง issue ใน Jira → ส่งลิงก์ในห้อง + แจ้งห้อง log
// 4) ปุ่มปิดห้อง (คนเปิด / ทีมงาน) → ยืนยัน → ลบห้อง
// ==========================================
@Injectable()
export class JiraInteractionListener {
    private readonly logger = new Logger('Jira');
    // กันกดปุ่มรัวๆ จนได้หลายห้อง / ส่ง pop-up ซ้ำจนได้หลาย card
    private readonly opening = new Set<string>();
    private readonly creating = new Set<number>();

    constructor(
        private readonly jira: JiraService,
        private readonly client: JiraClient,
        private readonly prisma: PrismaService,
    ) {}

    @OnDiscord(Events.InteractionCreate)
    async onInteraction(interaction: Interaction): Promise<void> {
        if (!(interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit())) return;
        const id = parseJiraCustomId(interaction.customId);
        if (!id) return;
        if (!interaction.inCachedGuild()) {
            if (interaction.isRepliable()) await interaction.reply({ content: '❌ ใช้ได้เฉพาะในเซิร์ฟเวอร์', flags: ephemeral }).catch(() => {});
            return;
        }

        try {
            if (id.action === 'open' && interaction.isButton()) return await this.open(interaction);
            if (id.action === 'type' && interaction.isStringSelectMenu()) return await this.chooseType(interaction, id.ticketId);
            if (id.action === 'modal' && interaction.isModalSubmit()) return await this.submit(interaction, id.ticketId, id.issueTypeId);
            if (id.action === 'close' && interaction.isButton()) return await this.askClose(interaction, id.ticketId);
            if (id.action === 'closeConfirm' && interaction.isButton()) return await this.close(interaction, id.ticketId);
        } catch (err) {
            this.logger.error(`${interaction.customId}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
            const content = '❌ มีบางอย่างผิดพลาด ลองใหม่อีกครั้ง';
            if (interaction.deferred || interaction.replied) await interaction.editReply({ content, embeds: [], components: [] }).catch(() => {});
            else await interaction.reply({ content, flags: ephemeral }).catch(() => {});
        }
    }

    // ห้องส่วนตัวถูกลบจาก Discord โดยตรง → บันทึกว่าปิดแล้ว (คนเปิดจะเปิดห้องใหม่ได้)
    @OnDiscord(Events.ChannelDelete)
    async onChannelDelete(channel: Channel): Promise<void> {
        if (channel.type !== ChannelType.GuildText) return;
        await this.jira.markChannelDeleted(channel.id);
    }

    private isStaff(member: GuildMember, settings: StoredJiraSettings): boolean {
        return member.permissions.has(PermissionFlagsBits.ManageChannels) || settings.options.staffRoleIds.some((roleId) => member.roles.cache.has(roleId));
    }

    // ตรวจว่ากดในห้องของ ticket นี้จริง และคนกดมีสิทธิ์ (คนเปิด หรือทีมงาน)
    private async loadTicket(
        interaction: StringSelectMenuInteraction<'cached'> | ModalSubmitInteraction<'cached'> | ButtonInteraction<'cached'>,
        ticketId: number,
    ): Promise<{ ticket: JiraTicket; settings: StoredJiraSettings } | null> {
        const [ticket, settings] = await Promise.all([this.jira.findTicket(interaction.guildId, ticketId), this.jira.getSettings(interaction.guildId)]);
        if (!ticket || ticket.closedAt || ticket.channelId !== interaction.channelId) {
            await interaction.reply({ content: '❌ ห้องนี้ปิดไปแล้ว', flags: ephemeral });
            return null;
        }
        if (ticket.userId !== interaction.user.id && !this.isStaff(interaction.member, settings)) {
            await interaction.reply({ content: '❌ เฉพาะคนเปิดห้องหรือทีมงานเท่านั้น', flags: ephemeral });
            return null;
        }
        return { ticket, settings };
    }

    // 1) ปุ่มในห้องแผง → สร้างห้องส่วนตัว
    private async open(interaction: ButtonInteraction<'cached'>): Promise<void> {
        const { guild, user } = interaction;
        const settings = await this.jira.getSettings(guild.id);
        if (!settings.enabled) {
            await interaction.reply({ content: '⏸️ ระบบเปิด Jira card ปิดอยู่ในตอนนี้', flags: ephemeral });
            return;
        }
        const missing = this.jira.missingSetup(settings);
        if (missing) {
            await interaction.reply({ content: `⚠️ ระบบยังตั้งค่าไม่ครบ — แจ้งแอดมิน (${missing})`, flags: ephemeral });
            return;
        }

        const lockKey = `${guild.id}:${user.id}`;
        if (this.opening.has(lockKey)) {
            await interaction.reply({ content: '⏳ กำลังสร้างห้องให้อยู่ รอสักครู่', flags: ephemeral });
            return;
        }
        this.opening.add(lockKey);
        try {
            await interaction.deferReply({ flags: ephemeral });
            const existing = await this.jira.findOpenTicket(guild.id, user.id);
            if (existing) {
                await interaction.editReply(`📌 คุณมีห้องที่เปิดอยู่แล้ว: <#${existing.channel.id}> — ปิดห้องเดิมก่อนถ้าต้องการเปิดใหม่`);
                return;
            }

            const userName = user.globalName || user.username;
            const ticket = await this.prisma.jiraTicket.create({ data: { guildId: guild.id, userId: user.id, userName } });
            const me = guild.members.me ?? (await guild.members.fetchMe());
            const overwrites: OverwriteResolvable[] = [
                { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
                { id: user.id, type: OverwriteType.Member, allow: MEMBER_ALLOW },
                { id: me.id, type: OverwriteType.Member, allow: BOT_ALLOW },
                ...settings.options.staffRoleIds
                    .filter((roleId) => guild.roles.cache.has(roleId))
                    .map((roleId): OverwriteResolvable => ({ id: roleId, type: OverwriteType.Role, allow: MEMBER_ALLOW })),
            ];
            const parent = settings.categoryId && guild.channels.cache.get(settings.categoryId)?.type === ChannelType.GuildCategory ? settings.categoryId : null;

            let channel;
            try {
                channel = await guild.channels.create({
                    name: ticketChannelName(user.username, ticket.id),
                    type: ChannelType.GuildText,
                    parent,
                    topic: `Jira card ของ ${userName} (${user.id})`,
                    permissionOverwrites: overwrites,
                    reason: `Jira ticket #${ticket.id} โดย ${user.username}`,
                });
            } catch (err) {
                await this.prisma.jiraTicket.delete({ where: { id: ticket.id } });
                this.logger.warn(`สร้างห้อง Jira (${guild.id}) ไม่สำเร็จ: ${(err as Error).message}`);
                await interaction.editReply('❌ บอทสร้างห้องไม่ได้ — แจ้งแอดมินให้ตรวจสิทธิ์ จัดการห้อง / จัดการยศ ของบอท');
                return;
            }

            await this.prisma.jiraTicket.update({ where: { id: ticket.id }, data: { channelId: channel.id } });
            await channel.send(ticketWelcomeMessage(ticket.id, user.id, settings.options.issueTypes));
            await interaction.editReply(`✅ สร้างห้องให้แล้ว: <#${channel.id}>`);
        } finally {
            this.opening.delete(lockKey);
        }
    }

    // 2) เลือกประเภท → เด้ง pop-up
    private async chooseType(interaction: StringSelectMenuInteraction<'cached'>, ticketId: number): Promise<void> {
        const loaded = await this.loadTicket(interaction, ticketId);
        if (!loaded) return;
        if (loaded.ticket.issueKey) {
            await interaction.reply({ content: `✅ ห้องนี้สร้าง card ไปแล้ว (${loaded.ticket.issueKey})`, flags: ephemeral });
            return;
        }
        const type = loaded.settings.options.issueTypes.find((t) => t.id === interaction.values[0]);
        if (!type) {
            await interaction.reply({ content: '❌ ประเภทนี้ถูกปิดไปแล้ว เลือกประเภทอื่น', flags: ephemeral });
            return;
        }
        await interaction.showModal(issueModal(ticketId, type));
    }

    // 3) ส่ง pop-up → สร้าง card ใน Jira
    private async submit(interaction: ModalSubmitInteraction<'cached'>, ticketId: number, issueTypeId: string): Promise<void> {
        const loaded = await this.loadTicket(interaction, ticketId);
        if (!loaded) return;
        const { ticket, settings } = loaded;
        if (ticket.issueKey || this.creating.has(ticketId)) {
            await interaction.reply({ content: `✅ ห้องนี้สร้าง card ไปแล้ว${ticket.issueKey ? ` (${ticket.issueKey})` : ''}`, flags: ephemeral });
            return;
        }
        const type = settings.options.issueTypes.find((t) => t.id === issueTypeId);
        const creds = this.jira.credentials(settings);
        if (!type || !creds || !settings.enabled) {
            await interaction.reply({ content: '❌ ระบบหรือประเภท card นี้ถูกปิด/เปลี่ยนไปแล้ว ลองเลือกใหม่อีกครั้ง', flags: ephemeral });
            return;
        }

        const title = interaction.fields.getTextInputValue(JIRA_IDS.titleField).trim().slice(0, JIRA_LIMITS.maxTitleLength);
        const description = interaction.fields.getTextInputValue(JIRA_IDS.descriptionField).trim().slice(0, JIRA_LIMITS.maxDescriptionLength);
        if (!title) {
            await interaction.reply({ content: '❌ ต้องกรอกหัวข้อ', flags: ephemeral });
            return;
        }

        this.creating.add(ticketId);
        try {
            await interaction.deferReply();
            const opener = ticket.userId === interaction.user.id ? interaction.user : await interaction.client.users.fetch(ticket.userId).catch(() => null);
            const footer = `— เปิดจาก Discord โดย ${opener?.username ?? ticket.userName} (${ticket.userId}) · ${interaction.guild.name}`;

            let issue;
            try {
                issue = await this.client.createIssue(creds, {
                    projectKey: settings.projectKey,
                    issueTypeId: type.id,
                    summary: title,
                    description: `${description}\n\n${footer}`,
                });
            } catch (err) {
                const message = err instanceof JiraApiError ? err.message : 'เชื่อมต่อ Jira ไม่สำเร็จ';
                if (!(err instanceof JiraApiError)) this.logger.error(`สร้าง issue (${interaction.guildId}) ไม่สำเร็จ: ${(err as Error).stack}`);
                else this.logger.warn(`สร้าง issue (${interaction.guildId}) ไม่สำเร็จ: ${err.message}`);
                await interaction.editReply(`❌ สร้าง card ไม่สำเร็จ: ${message}\nลองเลือกประเภทแล้วส่งใหม่อีกครั้ง หรือแจ้งแอดมิน`);
                return;
            }

            await this.prisma.jiraTicket.update({
                where: { id: ticketId },
                data: { issueKey: issue.key, issueUrl: issue.url, issueType: type.name, title, cardCreatedAt: new Date() },
            });
            const card = { issueKey: issue.key, issueUrl: issue.url, issueType: type.name, title, userId: ticket.userId };
            await interaction.editReply(cardCreatedMessage(card, description));

            // ข้อความแรกในห้อง: เอาเมนูเลือกประเภทออก (สร้างได้ห้องละ 1 card)
            if (interaction.isFromMessage()) await interaction.message.edit({ components: ticketDoneComponents(ticketId) }).catch(() => {});
            // ตั้งชื่อห้องเป็นเลข card ให้หาง่าย (Discord จำกัดการเปลี่ยนชื่อห้อง — ไม่สำเร็จก็ไม่เป็นไร)
            if (interaction.channel && 'setName' in interaction.channel) {
                void interaction.channel.setName(`jira-${issue.key.toLowerCase()}`).catch(() => {});
            }
            await this.sendLog(interaction, settings, card);
        } finally {
            this.creating.delete(ticketId);
        }
    }

    private async sendLog(interaction: ModalSubmitInteraction<'cached'>, settings: StoredJiraSettings, card: Parameters<typeof cardLogMessage>[0]): Promise<void> {
        if (!settings.logChannelId) return;
        const channel = interaction.guild.channels.cache.get(settings.logChannelId);
        if (!channel?.isSendable()) {
            this.logger.warn(`ไม่พบห้อง log ของ Jira (${interaction.guildId})`);
            return;
        }
        await channel.send(cardLogMessage(card, interaction.channelId)).catch((err: Error) => this.logger.warn(`ส่ง log Jira (${interaction.guildId}) ไม่สำเร็จ: ${err.message}`));
    }

    // 4) ปิดห้อง — ถามยืนยันก่อน (ลบห้องแล้วกู้คืนไม่ได้)
    private async askClose(interaction: ButtonInteraction<'cached'>, ticketId: number): Promise<void> {
        const loaded = await this.loadTicket(interaction, ticketId);
        if (!loaded) return;
        await interaction.reply({
            content: loaded.ticket.issueKey
                ? `ปิดห้องนี้? ห้องจะถูกลบ แต่ card ${loaded.ticket.issueKey} ใน Jira ยังอยู่`
                : 'ปิดห้องนี้? ยังไม่ได้สร้าง card — ห้องจะถูกลบ',
            components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId(JIRA_IDS.closeConfirm(ticketId)).setStyle(ButtonStyle.Danger).setEmoji('🔒').setLabel('ยืนยันปิดห้อง'),
                ),
            ],
            flags: ephemeral,
        });
    }

    private async close(interaction: ButtonInteraction<'cached'>, ticketId: number): Promise<void> {
        const loaded = await this.loadTicket(interaction, ticketId);
        if (!loaded) return;
        await interaction.update({ content: '🔒 กำลังปิดห้อง ..', components: [] });
        try {
            await this.jira.closeTicket(interaction.guildId, ticketId, `ปิด Jira ticket #${ticketId} โดย ${interaction.user.username}`);
        } catch (err) {
            await interaction.editReply({ content: `❌ ${(err as Error).message}` }).catch(() => {});
        }
    }
}
