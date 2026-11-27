import { HEX_COLOR_RE, TICKET_LIMITS, formatTicketNumber, trimChar, type TicketConfigDto } from '@notstack/shared';
import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    escapeMarkdown,
    type MessageCreateOptions,
} from 'discord.js';

export type TicketMessagePayload = Pick<MessageCreateOptions, 'content' | 'embeds' | 'components' | 'allowedMentions' | 'files'>;

export const TICKET_IDS = {
    open: 'ticket:open',
    claim: (ticketId: number) => `ticket:claim:${ticketId}`,
    close: (ticketId: number) => `ticket:close:${ticketId}`,
    closeConfirm: (ticketId: number) => `ticket:close-confirm:${ticketId}`,
} as const;

export type TicketCustomId = { action: 'open' } | { action: 'claim' | 'close' | 'closeConfirm'; ticketId: number };

export function parseTicketCustomId(customId: string): TicketCustomId | null {
    if (customId === TICKET_IDS.open) return { action: 'open' };
    const match = /^ticket:(claim|close|close-confirm):(\d+)$/.exec(customId);
    if (!match) return null;
    const ticketId = Number(match[2]);
    if (!Number.isSafeInteger(ticketId) || ticketId <= 0) return null;
    const action = match[1] === 'close-confirm' ? 'closeConfirm' : (match[1] as 'claim' | 'close');
    return { action, ticketId };
}

function parseColor(hex: string, fallback = TICKET_LIMITS.defaultPanelColor): number {
    const safe = HEX_COLOR_RE.test(hex) ? hex : fallback;
    return Number.parseInt(safe.slice(1), 16);
}

export function ticketChannelName(ticketNumber: number, username: string): string {
    const num = formatTicketNumber(ticketNumber);
    const slug = trimChar(username.toLowerCase().replace(/[^a-z0-9]+/g, '-'), '-').slice(0, 32);
    return slug ? `ticket-${num}-${slug}` : `ticket-${num}`;
}

export function ticketPanelMessage(
    config: Pick<TicketConfigDto, 'panelTitle' | 'panelDescription' | 'panelColor'>,
): TicketMessagePayload {
    const embed = new EmbedBuilder().setColor(parseColor(config.panelColor)).setTitle(config.panelTitle || null);
    if (config.panelDescription) embed.setDescription(config.panelDescription);
    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(TICKET_IDS.open).setStyle(ButtonStyle.Primary).setEmoji('🎫').setLabel('เปิด Ticket'),
            ),
        ],
    };
}

export interface WelcomeTicketView {
    id: number;
    ticketNumber: number;
    openerId: string;
    claimedById: string | null;
    subject: string | null;
}

export function ticketWelcomeMessage(ticket: WelcomeTicketView, panelColor: string = TICKET_LIMITS.defaultPanelColor): TicketMessagePayload {
    const num = formatTicketNumber(ticket.ticketNumber);
    const embed = new EmbedBuilder()
        .setColor(parseColor(panelColor))
        .setTitle(`🎫 Ticket #${num}`)
        .setDescription('กรุณาอธิบายปัญหาหรือรายละเอียดที่ต้องการติดต่อทีมงานในห้องนี้ ทีมงานจะเข้ามาดูแลโดยเร็วที่สุด')
        .addFields(
            { name: 'ผู้เปิด', value: `<@${ticket.openerId}>`, inline: true },
            { name: 'สถานะ', value: ticket.claimedById ? '🧑‍💻 รับเรื่องแล้ว' : '🟢 รอทีมงานรับเรื่อง', inline: true },
            { name: 'ผู้รับเรื่อง', value: ticket.claimedById ? `<@${ticket.claimedById}>` : '—', inline: true },
        )
        .setFooter({ text: 'ทีมงานกด "รับเรื่อง (Claim)" หรือกด "ปิด Ticket (Close)" เพื่อบันทึก Transcript และปิดห้อง' })
        .setTimestamp();

    if (ticket.subject) {
        embed.addFields({ name: 'หัวข้อ', value: escapeMarkdown(ticket.subject).slice(0, 1024) });
    }

    return {
        content: `<@${ticket.openerId}>`,
        allowedMentions: { users: [ticket.openerId] },
        embeds: [embed],
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(TICKET_IDS.claim(ticket.id))
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🙋')
                    .setLabel(ticket.claimedById ? 'รับเรื่องแล้ว' : 'รับเรื่อง (Claim)')
                    .setDisabled(Boolean(ticket.claimedById)),
                new ButtonBuilder().setCustomId(TICKET_IDS.close(ticket.id)).setStyle(ButtonStyle.Danger).setEmoji('🔒').setLabel('ปิด Ticket (Close)'),
            ),
        ],
    };
}

export function ticketCloseConfirmMessage(ticketId: number, ticketNumber: number): Pick<MessageCreateOptions, 'content' | 'components'> {
    const num = formatTicketNumber(ticketNumber);
    return {
        content: `ยืนยันการปิด **Ticket #${num}**?\nระบบจะบันทึกประวัติการสนทนาเป็นไฟล์ Transcript และลบห้องนี้ถาวร`,
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(TICKET_IDS.closeConfirm(ticketId))
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
                    .setLabel('ยืนยันปิด Ticket'),
            ),
        ],
    };
}

export interface TicketTranscriptSummary {
    ticketNumber: number;
    openerId: string;
    claimedById: string | null;
    closedById: string;
    subject: string | null;
    createdAt: Date;
    closedAt: Date;
    messageCount: number;
}

export interface TranscriptAttachmentFile {
    name: string;
    data: Buffer;
}

function buildClosedEmbed(summary: TicketTranscriptSummary, title: string, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(parseColor('#5865F2'))
        .setTitle(title)
        .addFields(
            { name: 'ผู้เปิด', value: `<@${summary.openerId}>`, inline: true },
            { name: 'ผู้รับเรื่อง', value: summary.claimedById ? `<@${summary.claimedById}>` : '—', inline: true },
            { name: 'ผู้ปิด', value: `<@${summary.closedById}>`, inline: true },
            { name: 'จำนวนข้อความ', value: `${summary.messageCount} ข้อความ`, inline: true },
            { name: 'เวลาเปิด', value: `<t:${Math.floor(summary.createdAt.getTime() / 1000)}:f>`, inline: true },
            { name: 'เวลาปิด', value: `<t:${Math.floor(summary.closedAt.getTime() / 1000)}:f>`, inline: true },
        )
        .setTimestamp(summary.closedAt);

    if (description) embed.setDescription(description);
    if (summary.subject) embed.addFields({ name: 'หัวข้อ', value: escapeMarkdown(summary.subject).slice(0, 1024) });
    return embed;
}

export function ticketClosedLogMessage(summary: TicketTranscriptSummary, files: TranscriptAttachmentFile[]): TicketMessagePayload {
    const num = formatTicketNumber(summary.ticketNumber);
    return {
        embeds: [buildClosedEmbed(summary, `🔒 Ticket #${num} ถูกปิดแล้ว`)],
        files: files.map((file) => new AttachmentBuilder(file.data, { name: file.name })),
        allowedMentions: { parse: [] },
    };
}

export function ticketClosedDmMessage(
    guildName: string,
    summary: TicketTranscriptSummary,
    files: TranscriptAttachmentFile[],
): TicketMessagePayload {
    const num = formatTicketNumber(summary.ticketNumber);
    return {
        embeds: [
            buildClosedEmbed(
                summary,
                `📄 Transcript — Ticket #${num}`,
                `Ticket ของคุณในเซิร์ฟเวอร์ **${escapeMarkdown(guildName)}** ถูกปิดเรียบร้อยแล้ว พร้อมไฟล์ประวัติการสนทนาแนบด้านล่าง`,
            ),
        ],
        files: files.map((file) => new AttachmentBuilder(file.data, { name: file.name })),
        allowedMentions: { parse: [] },
    };
}
