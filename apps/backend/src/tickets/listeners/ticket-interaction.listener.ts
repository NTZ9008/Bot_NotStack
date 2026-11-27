import { Injectable, Logger, Optional } from '@nestjs/common';
import { PLUGIN_BOT_DISABLED_MESSAGE, formatTicketNumber, type TicketConfigDto } from '@notstack/shared';
import {
    ChannelType,
    Events,
    MessageFlags,
    OverwriteType,
    PermissionFlagsBits,
    type ButtonInteraction,
    type Channel,
    type GuildMember,
    type Interaction,
    type OverwriteResolvable,
} from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import type { Ticket } from '../../generated/prisma/client';
import { PluginsService } from '../../plugins/plugins.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketsService } from '../tickets.service';
import {
    parseTicketCustomId,
    ticketChannelName,
    ticketCloseConfirmMessage,
    ticketWelcomeMessage,
} from '../utils/tickets.messages';

const ephemeral = MessageFlags.Ephemeral;

const MEMBER_ALLOW = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
];
const BOT_ALLOW = [...MEMBER_ALLOW, PermissionFlagsBits.ManageChannels];

@Injectable()
export class TicketInteractionListener {
    private readonly logger = new Logger('Tickets');
    private readonly opening = new Set<string>();
    private readonly closing = new Set<number>();

    constructor(
        private readonly tickets: TicketsService,
        private readonly prisma: PrismaService,
        @Optional() private readonly plugins?: PluginsService,
    ) {}

    @OnDiscord(Events.InteractionCreate)
    async onInteraction(interaction: Interaction): Promise<void> {
        if (!interaction.isButton()) return;
        const parsed = parseTicketCustomId(interaction.customId);
        if (!parsed) return;

        if (!interaction.inCachedGuild()) {
            if (interaction.isRepliable()) {
                await interaction.reply({ content: '❌ ใช้ได้เฉพาะในเซิร์ฟเวอร์', flags: ephemeral }).catch(() => {});
            }
            return;
        }

        if (this.plugins && !(await this.plugins.isInstalled(interaction.guildId, 'ticket-system'))) {
            if (interaction.isRepliable()) {
                await interaction.reply({ content: PLUGIN_BOT_DISABLED_MESSAGE, flags: ephemeral }).catch(() => {});
            }
            return;
        }

        try {
            if (parsed.action === 'open') return await this.handleOpen(interaction);
            if (parsed.action === 'claim') return await this.handleClaim(interaction, parsed.ticketId);
            if (parsed.action === 'close') return await this.handleAskClose(interaction, parsed.ticketId);
            if (parsed.action === 'closeConfirm') return await this.handleConfirmClose(interaction, parsed.ticketId);
        } catch (err) {
            this.logger.error(`${interaction.customId}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
            const content = '❌ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content, embeds: [], components: [] }).catch(() => {});
            } else {
                await interaction.reply({ content, flags: ephemeral }).catch(() => {});
            }
        }
    }

    @OnDiscord(Events.ChannelDelete)
    async onChannelDelete(channel: Channel): Promise<void> {
        if (channel.type !== ChannelType.GuildText) return;
        await this.tickets.markChannelDeleted(channel.id);
    }

    private isStaff(member: GuildMember, config: TicketConfigDto): boolean {
        return (
            member.permissions.has(PermissionFlagsBits.Administrator) ||
            config.staffRoleIds.some((roleId) => member.roles.cache.has(roleId))
        );
    }

    private async loadOpenTicket(
        interaction: ButtonInteraction<'cached'>,
        ticketId: number,
    ): Promise<{ ticket: Ticket; config: TicketConfigDto } | null> {
        const [ticket, config] = await Promise.all([
            this.tickets.findTicket(interaction.guildId, ticketId),
            this.tickets.getConfig(interaction.guildId),
        ]);
        if (!ticket || ticket.status !== 'OPEN' || ticket.channelId !== interaction.channelId) {
            await interaction.reply({ content: '❌ ห้อง Ticket นี้ถูกปิดไปแล้ว', flags: ephemeral });
            return null;
        }
        return { ticket, config };
    }

    private async handleOpen(interaction: ButtonInteraction<'cached'>): Promise<void> {
        const { guild, user } = interaction;
        const lockKey = `${guild.id}:${user.id}`;
        if (this.opening.has(lockKey)) {
            await interaction.reply({ content: '⏳ กำลังเปิดห้อง Ticket ให้อยู่ กรุณารอสักครู่', flags: ephemeral });
            return;
        }

        this.opening.add(lockKey);
        try {
            const config = await this.tickets.getConfig(guild.id);
            const category = config.categoryId
                ? (guild.channels.cache.get(config.categoryId) ?? (await guild.channels.fetch(config.categoryId).catch(() => null)))
                : null;
            if (!category || category.type !== ChannelType.GuildCategory) {
                await interaction.reply({
                    content: '⚠️ ระบบ Ticket ยังไม่ได้ตั้งค่าหมวดหมู่ (Category) สำหรับสร้างห้อง — กรุณาแจ้งแอดมิน',
                    flags: ephemeral,
                });
                return;
            }

            await interaction.deferReply({ flags: ephemeral });

            const openTickets = await this.tickets.reconcileOpenTickets(guild.id, user.id);
            if (openTickets.length >= config.maxOpenPerUser) {
                const links = openTickets.map((entry) => `<#${entry.channel.id}>`).join(', ');
                await interaction.editReply(
                    `📌 คุณเปิด Ticket อยู่ครบจำนวนสูงสุดแล้ว (${openTickets.length}/${config.maxOpenPerUser}): ${links}\nกรุณาปิดห้องเดิมก่อนเปิดใหม่`,
                );
                return;
            }

            const ticket = await this.tickets.createTicket(guild.id, user.id);
            const me = guild.members.me ?? (await guild.members.fetchMe());
            const overwrites: OverwriteResolvable[] = [
                { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
                { id: user.id, type: OverwriteType.Member, allow: MEMBER_ALLOW },
                { id: me.id, type: OverwriteType.Member, allow: BOT_ALLOW },
                ...config.staffRoleIds
                    .filter((roleId) => guild.roles.cache.has(roleId))
                    .map((roleId): OverwriteResolvable => ({ id: roleId, type: OverwriteType.Role, allow: MEMBER_ALLOW })),
            ];

            let channel;
            try {
                channel = await guild.channels.create({
                    name: ticketChannelName(ticket.ticketNumber, user.username),
                    type: ChannelType.GuildText,
                    parent: category.id,
                    topic: `Ticket #${formatTicketNumber(ticket.ticketNumber)} โดย ${user.globalName || user.username} (${user.id})`,
                    permissionOverwrites: overwrites,
                    reason: `Ticket #${formatTicketNumber(ticket.ticketNumber)} เปิดโดย ${user.username}`,
                });
            } catch (err) {
                await this.prisma.ticket.delete({ where: { id: ticket.id } }).catch(() => {});
                this.logger.warn(`สร้างห้อง Ticket (${guild.id}) ไม่สำเร็จ: ${(err as Error).message}`);
                await interaction.editReply('❌ บอทไม่สามารถสร้างห้องได้ — กรุณาแจ้งแอดมินให้ตรวจสิทธิ์ จัดการห้อง / จัดการยศ ของบอท');
                return;
            }

            const updated = await this.prisma.ticket.update({
                where: { id: ticket.id },
                data: { channelId: channel.id },
            });

            await channel.send(ticketWelcomeMessage(updated, config.panelColor));
            await interaction.editReply(`✅ เปิด Ticket #${formatTicketNumber(ticket.ticketNumber)} ให้แล้ว: <#${channel.id}>`);
        } finally {
            this.opening.delete(lockKey);
        }
    }

    private async handleClaim(interaction: ButtonInteraction<'cached'>, ticketId: number): Promise<void> {
        const loaded = await this.loadOpenTicket(interaction, ticketId);
        if (!loaded) return;
        const { ticket, config } = loaded;

        if (!this.isStaff(interaction.member, config)) {
            await interaction.reply({ content: '❌ เฉพาะทีมงาน (Staff Role) เท่านั้นที่สามารถกดรับเรื่องได้', flags: ephemeral });
            return;
        }

        if (ticket.claimedById) {
            await interaction.reply({ content: `ℹ️ Ticket นี้ถูกรับเรื่องไปแล้วโดย <@${ticket.claimedById}>`, flags: ephemeral });
            return;
        }

        const updated = await this.prisma.ticket.update({
            where: { id: ticket.id },
            data: { claimedById: interaction.user.id },
        });

        await interaction.update(ticketWelcomeMessage(updated, config.panelColor));
        await interaction.followUp({ content: `🙋 <@${interaction.user.id}> รับเรื่อง Ticket นี้แล้ว` }).catch(() => {});
    }

    private async handleAskClose(interaction: ButtonInteraction<'cached'>, ticketId: number): Promise<void> {
        const loaded = await this.loadOpenTicket(interaction, ticketId);
        if (!loaded) return;
        const { ticket, config } = loaded;

        if (ticket.openerId !== interaction.user.id && !this.isStaff(interaction.member, config)) {
            await interaction.reply({ content: '❌ เฉพาะผู้เปิด Ticket หรือทีมงานเท่านั้นที่สามารถปิดห้องได้', flags: ephemeral });
            return;
        }

        await interaction.reply({
            ...ticketCloseConfirmMessage(ticket.id, ticket.ticketNumber),
            flags: ephemeral,
        });
    }

    private async handleConfirmClose(interaction: ButtonInteraction<'cached'>, ticketId: number): Promise<void> {
        const loaded = await this.loadOpenTicket(interaction, ticketId);
        if (!loaded) return;
        const { ticket, config } = loaded;

        if (ticket.openerId !== interaction.user.id && !this.isStaff(interaction.member, config)) {
            await interaction.reply({ content: '❌ เฉพาะผู้เปิด Ticket หรือทีมงานเท่านั้นที่สามารถปิดห้องได้', flags: ephemeral });
            return;
        }

        if (this.closing.has(ticketId)) {
            await interaction.reply({ content: '⏳ กำลังบันทึก Transcript และปิดห้อง Ticket นี้อยู่', flags: ephemeral });
            return;
        }

        this.closing.add(ticketId);
        try {
            await interaction.update({ content: '🔒 กำลังบันทึก Transcript และปิดห้อง Ticket...', components: [] });
            await this.tickets.closeTicket(
                interaction.guildId,
                ticketId,
                interaction.user.id,
                `ปิด Ticket #${formatTicketNumber(ticket.ticketNumber)} โดย ${interaction.user.username}`,
            );
        } finally {
            this.closing.delete(ticketId);
        }
    }
}
