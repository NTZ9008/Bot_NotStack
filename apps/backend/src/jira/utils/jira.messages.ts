import { JIRA_LIMITS, type JiraIssueTypeOption, type JiraPanelAppearance } from '@notstack/shared';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    EmbedBuilder,
    escapeMarkdown,
    FileUploadBuilder,
    LabelBuilder,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    type MessageCreateOptions,
} from 'discord.js';

type MessagePayload = Pick<MessageCreateOptions, 'content' | 'embeds' | 'components' | 'allowedMentions' | 'files'>;

// ==========================================
// 🆔 customId ของปุ่ม / เมนู / pop-up — ขึ้นต้นด้วย jira: ทั้งหมด (ตัวจัดการอื่นไม่สนใจ)
// ==========================================
export const JIRA_IDS = {
    open: 'jira:open',
    form: (ticketId: number) => `jira:form:${ticketId}`,
    modal: (ticketId: number) => `jira:modal:${ticketId}`,
    close: (ticketId: number) => `jira:close:${ticketId}`,
    closeConfirm: (ticketId: number) => `jira:close-yes:${ticketId}`,
    typeField: 'type',
    titleField: 'title',
    descriptionField: 'description',
    imagesField: 'images',
} as const;

export type JiraCustomId = { action: 'open' } | { action: 'form' | 'modal' | 'close' | 'closeConfirm'; ticketId: number };

export function parseJiraCustomId(customId: string): JiraCustomId | null {
    if (customId === JIRA_IDS.open) return { action: 'open' };
    const match = /^jira:(form|modal|close|close-yes):(\d+)$/.exec(customId);
    if (!match) return null;
    const ticketId = Number(match[2]);
    if (!Number.isSafeInteger(ticketId)) return null;
    return { action: match[1] === 'close-yes' ? 'closeConfirm' : (match[1] as 'form' | 'modal' | 'close'), ticketId };
}

const color = (hex: string) => parseInt(hex.slice(1), 16);
const JIRA_BLUE = '#2684FF';
const SUCCESS_GREEN = '#36B37E';
const WARNING_ORANGE = '#FFAB00';

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

const closeButton = (ticketId: number) =>
    new ButtonBuilder().setCustomId(JIRA_IDS.close(ticketId)).setStyle(ButtonStyle.Secondary).setEmoji('🔒').setLabel('ปิดห้อง');

// ข้อความแรกในห้องส่วนตัว: ปุ่มเปิด pop-up (ประเภท + หัวข้อ + รายละเอียด + รูป ในหน้าเดียว)
export function ticketWelcomeMessage(ticketId: number, userId: string, maxImages = 0): MessagePayload {
    return {
        content: `<@${userId}>`,
        allowedMentions: { users: [userId] },
        embeds: [
            new EmbedBuilder()
                .setColor(color(JIRA_BLUE))
                .setTitle('🎫 เปิด Jira card ใหม่')
                .setDescription(
                    [
                        '1. กดปุ่ม **📝 กรอก card** ด้านล่าง',
                        maxImages > 0
                            ? `2. เลือก **ประเภท** กรอก **หัวข้อ** และ **รายละเอียด** (แนบรูปได้สูงสุด ${maxImages} รูป ถ้าต้องการ) แล้วกดส่ง`
                            : '2. เลือก **ประเภท** กรอก **หัวข้อ** และ **รายละเอียด** แล้วกดส่ง',
                        '3. บอทจะสร้าง card ใน Jira แล้วส่งลิงก์ให้ในห้องนี้',
                    ].join('\n'),
                )
                .setFooter({ text: 'ห้องนี้เห็นเฉพาะคุณและทีมงาน — กด "ปิดห้อง" เมื่อเสร็จแล้ว' }),
        ],
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(JIRA_IDS.form(ticketId)).setStyle(ButtonStyle.Primary).setEmoji('📝').setLabel('กรอก card'),
                closeButton(ticketId),
            ),
        ],
    };
}

// เมื่อสร้าง card แล้ว ข้อความแรกเหลือแค่ปุ่มปิดห้อง (กรอก card ซ้ำไม่ได้)
export function ticketDoneComponents(ticketId: number) {
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton(ticketId))];
}

// pop-up เดียวจบ: ประเภท (dropdown) + หัวข้อ + รายละเอียด + รูป (ถ้าเปิด) — Discord ให้ใส่ได้ 5 ช่อง ใช้ไม่เกิน 4
export function issueModal(ticketId: number, issueTypes: JiraIssueTypeOption[], maxImages = 0): ModalBuilder {
    const types = issueTypes.slice(0, JIRA_LIMITS.maxIssueTypes);
    const modal = new ModalBuilder()
        .setCustomId(JIRA_IDS.modal(ticketId))
        .setTitle('เปิด Jira card')
        .addLabelComponents(
            new LabelBuilder().setLabel('ประเภท card').setStringSelectMenuComponent(
                new StringSelectMenuBuilder()
                    .setCustomId(JIRA_IDS.typeField)
                    .setPlaceholder('เลือกประเภท card ..')
                    .setRequired(true)
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(
                        types.map((type) => ({
                            label: type.name.slice(0, 100),
                            value: type.id,
                            ...(type.emoji ? { emoji: type.emoji } : {}),
                            // มีประเภทเดียว = เลือกไว้ให้เลย
                            ...(types.length === 1 ? { default: true } : {}),
                        })),
                    ),
            ),
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
    if (maxImages > 0) {
        const max = Math.min(maxImages, JIRA_LIMITS.maxImages);
        modal.addLabelComponents(
            new LabelBuilder()
                .setLabel('รูปภาพ (ไม่บังคับ)')
                .setDescription(`แนบได้สูงสุด ${max} รูป · รูปละไม่เกิน ${Math.round(JIRA_LIMITS.maxImageBytes / 1024 / 1024)}MB — แนบเข้า card ใน Jira`)
                .setFileUploadComponent(
                    // file_types ยังไม่มี setter ใน builder — ใส่ผ่าน constructor (Discord ให้เลือกได้เฉพาะรูป บอทตรวจซ้ำอีกชั้น)
                    new FileUploadBuilder({ file_types: ['image'] }).setCustomId(JIRA_IDS.imagesField).setRequired(false).setMinValues(0).setMaxValues(max),
                ),
        );
    }
    return modal;
}

export interface CardInfo {
    issueKey: string;
    issueUrl: string;
    issueType: string;
    title: string;
    userId: string;
    // จำนวนรูปที่แนบเข้า Jira สำเร็จ
    imageCount: number;
}

export interface CardImages {
    // รูปที่แนบเข้า Jira สำเร็จ — ส่งเข้าห้องด้วยให้เห็นว่าแนบอะไรไป
    files: { name: string; data: Buffer }[];
    // รูปที่แนบไม่สำเร็จ พร้อมเหตุผล
    failed: string[];
}

const linkButton = (url: string) => new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel('เปิดใน Jira').setEmoji('🔗');

// ส่งในห้องส่วนตัวหลังสร้าง card สำเร็จ
// autoCloseAt = เวลาที่ห้องจะถูกปิดอัตโนมัติ (null = ไม่ปิดเอง)
export function cardCreatedMessage(
    card: CardInfo,
    description: string,
    images: CardImages = { files: [], failed: [] },
    autoCloseAt: Date | null = null,
): MessagePayload {
    const embed = new EmbedBuilder()
        .setColor(color(images.failed.length ? WARNING_ORANGE : SUCCESS_GREEN))
        .setAuthor({ name: `✅ สร้าง card แล้ว · ${card.issueKey}` })
        .setTitle(card.title.slice(0, 256))
        .setURL(card.issueUrl)
        .setDescription(description.slice(0, 1000) + (description.length > 1000 ? '…' : ''))
        .addFields({ name: 'ประเภท', value: card.issueType, inline: true }, { name: 'ลิงก์', value: card.issueUrl, inline: true });
    if (images.files.length) {
        embed.addFields({ name: 'รูปแนบ', value: `📎 ${images.files.length} รูป`, inline: true });
        embed.setImage(`attachment://${images.files[0]!.name}`);
    }
    if (images.failed.length) {
        embed.addFields({
            name: '⚠️ แนบรูปไม่สำเร็จ',
            value: images.failed
                .map((line) => `• ${escapeMarkdown(line)}`)
                .join('\n')
                .slice(0, 1024),
        });
    }
    return {
        // <t:…:R> = Discord แสดงเวลานับถอยหลังเองฝั่งผู้ใช้ ("in 15 seconds")
        content: autoCloseAt ? `🔒 ห้องนี้จะปิดอัตโนมัติ <t:${Math.ceil(autoCloseAt.getTime() / 1000)}:R> — เปิดลิงก์ card เก็บไว้ก่อนห้องปิด` : '',
        embeds: [embed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton(card.issueUrl))],
        files: images.files.map((file) => new AttachmentBuilder(file.data, { name: file.name })),
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
    if (card.imageCount) embed.addFields({ name: 'รูปแนบ', value: `📎 ${card.imageCount} รูป`, inline: true });
    if (channelId) embed.addFields({ name: 'ห้อง', value: `<#${channelId}>`, inline: true });
    return {
        embeds: [embed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton(card.issueUrl))],
        allowedMentions: { parse: [] },
    };
}
