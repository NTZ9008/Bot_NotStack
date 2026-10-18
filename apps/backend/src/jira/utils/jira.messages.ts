import { JIRA_LIMITS, type JiraIssueTypeOption, type JiraPanelAppearance } from '@notstack/shared';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    escapeMarkdown,
    LabelBuilder,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    type MessageCreateOptions,
} from 'discord.js';

type MessagePayload = Pick<MessageCreateOptions, 'content' | 'embeds' | 'components' | 'allowedMentions'>;

// ==========================================
// 🆔 customId ของปุ่ม / เมนู / pop-up — ขึ้นต้นด้วย jira: ทั้งหมด (ตัวจัดการอื่นไม่สนใจ)
// ==========================================
export const JIRA_IDS = {
    open: 'jira:open',
    type: (ticketId: number) => `jira:type:${ticketId}`,
    modal: (ticketId: number, issueTypeId: string) => `jira:modal:${ticketId}:${issueTypeId}`,
    close: (ticketId: number) => `jira:close:${ticketId}`,
    closeConfirm: (ticketId: number) => `jira:close-yes:${ticketId}`,
    titleField: 'title',
    descriptionField: 'description',
} as const;

export type JiraCustomId =
    | { action: 'open' }
    | { action: 'type' | 'close' | 'closeConfirm'; ticketId: number }
    | { action: 'modal'; ticketId: number; issueTypeId: string };

export function parseJiraCustomId(customId: string): JiraCustomId | null {
    if (customId === JIRA_IDS.open) return { action: 'open' };
    const match = /^jira:(type|close|close-yes|modal):(\d+)(?::(\d+))?$/.exec(customId);
    if (!match) return null;
    const ticketId = Number(match[2]);
    if (!Number.isSafeInteger(ticketId)) return null;
    if (match[1] === 'modal') return match[3] ? { action: 'modal', ticketId, issueTypeId: match[3] } : null;
    if (match[3]) return null;
    return { action: match[1] === 'close-yes' ? 'closeConfirm' : (match[1] as 'type' | 'close'), ticketId };
}

const color = (hex: string) => parseInt(hex.slice(1), 16);
const JIRA_BLUE = '#2684FF';
const SUCCESS_GREEN = '#36B37E';

// ชื่อห้อง: jira-<ชื่อผู้ใช้>-<เลข ticket> (ชื่อที่เป็นภาษาไทย/อีโมจิล้วนจะเหลือแค่ jira-<เลข>)
export function ticketChannelName(userName: string, ticketId: number): string {
    const slug = userName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    return slug ? `jira-${slug}-${ticketId}` : `jira-${ticketId}`;
}

// ข้อความแผงในห้อง panel (ปุ่มเดียว: เปิด card)
export function panelMessage(panel: JiraPanelAppearance): MessagePayload {
    const embed = new EmbedBuilder().setColor(color(panel.color)).setTitle(panel.title || null);
    if (panel.description) embed.setDescription(panel.description);
    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(JIRA_IDS.open).setStyle(ButtonStyle.Primary).setEmoji('🎫').setLabel(panel.buttonLabel),
            ),
        ],
    };
}

const typeLabel = (type: Pick<JiraIssueTypeOption, 'name' | 'emoji'>) => (type.emoji ? `${type.emoji} ${type.name}` : type.name);

const closeButton = (ticketId: number) => new ButtonBuilder().setCustomId(JIRA_IDS.close(ticketId)).setStyle(ButtonStyle.Secondary).setEmoji('🔒').setLabel('ปิดห้อง');

// ข้อความแรกในห้องส่วนตัว: เลือกประเภท card (เลือกแล้วเด้ง pop-up ให้กรอก title / description)
export function ticketWelcomeMessage(ticketId: number, userId: string, issueTypes: JiraIssueTypeOption[]): MessagePayload {
    const select = new StringSelectMenuBuilder()
        .setCustomId(JIRA_IDS.type(ticketId))
        .setPlaceholder('เลือกประเภท card ..')
        .addOptions(
            issueTypes.slice(0, JIRA_LIMITS.maxIssueTypes).map((type) => ({
                label: type.name.slice(0, 100),
                value: type.id,
                ...(type.emoji ? { emoji: type.emoji } : {}),
            })),
        );
    return {
        content: `<@${userId}>`,
        allowedMentions: { users: [userId] },
        embeds: [
            new EmbedBuilder()
                .setColor(color(JIRA_BLUE))
                .setTitle('🎫 เปิด Jira card ใหม่')
                .setDescription(
                    ['1. เลือก **ประเภท card** จากเมนูด้านล่าง', '2. กรอก **หัวข้อ** และ **รายละเอียด** ใน pop-up แล้วกดส่ง', '3. บอทจะสร้าง card ใน Jira แล้วส่งลิงก์ให้ในห้องนี้'].join('\n'),
                )
                .setFooter({ text: 'ห้องนี้เห็นเฉพาะคุณและทีมงาน — กด "ปิดห้อง" เมื่อเสร็จแล้ว' }),
        ],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton(ticketId))],
    };
}

// เมื่อสร้าง card แล้ว ข้อความแรกเหลือแค่ปุ่มปิดห้อง (เลือกประเภทซ้ำไม่ได้)
export function ticketDoneComponents(ticketId: number) {
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton(ticketId))];
}

export function issueModal(ticketId: number, type: JiraIssueTypeOption): ModalBuilder {
    return new ModalBuilder()
        .setCustomId(JIRA_IDS.modal(ticketId, type.id))
        .setTitle(`Jira card: ${type.name}`.slice(0, 45))
        .addLabelComponents(
            new LabelBuilder()
                .setLabel('หัวข้อ (Title)')
                .setTextInputComponent(
                    new TextInputBuilder()
                        .setCustomId(JIRA_IDS.titleField)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(JIRA_LIMITS.maxTitleLength)
                        .setPlaceholder('สรุปสั้นๆ ว่า card นี้เกี่ยวกับอะไร'),
                ),
            new LabelBuilder()
                .setLabel('รายละเอียด (Description)')
                .setTextInputComponent(
                    new TextInputBuilder()
                        .setCustomId(JIRA_IDS.descriptionField)
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(JIRA_LIMITS.maxDescriptionLength)
                        .setPlaceholder('อธิบายรายละเอียด ขั้นตอน หรือสิ่งที่ต้องการ'),
                ),
        );
}

export interface CardInfo {
    issueKey: string;
    issueUrl: string;
    issueType: string;
    title: string;
    userId: string;
}

const linkButton = (url: string) => new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel('เปิดใน Jira').setEmoji('🔗');

// ส่งในห้องส่วนตัวหลังสร้าง card สำเร็จ
export function cardCreatedMessage(card: CardInfo, description: string): MessagePayload {
    return {
        embeds: [
            new EmbedBuilder()
                .setColor(color(SUCCESS_GREEN))
                .setAuthor({ name: `✅ สร้าง card แล้ว · ${card.issueKey}` })
                .setTitle(card.title.slice(0, 256))
                .setURL(card.issueUrl)
                .setDescription(description.slice(0, 1000) + (description.length > 1000 ? '…' : ''))
                .addFields({ name: 'ประเภท', value: card.issueType, inline: true }, { name: 'ลิงก์', value: card.issueUrl, inline: true }),
        ],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton(card.issueUrl))],
    };
}

// ส่งในห้อง log: ใครเปิด card อะไร + ลิงก์ (ไม่แท็กใคร)
export function cardLogMessage(card: CardInfo, channelId: string | null): MessagePayload {
    const embed = new EmbedBuilder()
        .setColor(color(JIRA_BLUE))
        .setAuthor({ name: `🎫 Jira card ใหม่ · ${card.issueKey}` })
        .setTitle(card.title.slice(0, 256))
        .setURL(card.issueUrl)
        .addFields({ name: 'ผู้เปิด', value: `<@${card.userId}>`, inline: true }, { name: 'ประเภท', value: escapeMarkdown(card.issueType), inline: true })
        .setTimestamp(new Date());
    if (channelId) embed.addFields({ name: 'ห้อง', value: `<#${channelId}>`, inline: true });
    return {
        embeds: [embed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton(card.issueUrl))],
        allowedMentions: { parse: [] },
    };
}
