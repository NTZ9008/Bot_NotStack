import { Injectable, Logger } from '@nestjs/common';
import {
    allowedMemberStyle,
    applyMemberStyle,
    HEX_COLOR_RE,
    RANK_COLOR_PRESETS,
    RANK_LAYOUT_LABELS,
    RANK_LAYOUTS,
    type RankCardTheme,
    type RankLayout,
    type RankMemberStyle,
} from '@notstack/shared';
import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ModalBuilder,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    type ChatInputCommandInteraction,
    type GuildMember,
    type InteractionEditReplyOptions,
    type User,
} from 'discord.js';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { ComponentInteraction, SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';
import { RankCardService } from '../../rank/rank-card.service';
import { RankCardStore } from '../../rank/rank-card.store';
import { WelcomeStore } from '../../welcome/welcome.store';

const ephemeral = MessageFlags.Ephemeral;
const ID = {
    layout: 'rankcard:layout',
    accent: 'rankcard:accent',
    background: 'rankcard:background',
    custom: 'rankcard:custom',
    reset: 'rankcard:reset',
    modal: 'rankcard:modal',
} as const;
const CUSTOM = 'custom';
const THEME_BG = 'theme';

// "#abc123" / "abc123" → "#abc123", ว่าง → null, ผิดรูปแบบ → undefined
function parseHex(value: string): string | null | undefined {
    const text = value.trim();
    if (!text) return null;
    const hex = text.startsWith('#') ? text : `#${text}`;
    return HEX_COLOR_RE.test(hex) ? hex.toLowerCase() : undefined;
}

// ==========================================
// /rankcard — แต่งการ์ด /rank ของตัวเองใน Discord (แผงเห็นคนเดียว: เลือกแล้วบันทึกทันที พร้อมรูปตัวอย่าง)
// เลือกได้เท่าที่แอดมินเปิดให้ในหน้า Levels → ธีมการ์ด (แบบการ์ด / สี / รูปพื้นหลังที่อนุญาต)
// ==========================================
@SlashCommand()
@Injectable()
export class RankCardCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder().setName('rankcard').setDescription('แต่งการ์ด /rank ของคุณ (แบบการ์ด / สี / พื้นหลัง)');

    private readonly logger = new Logger('RankCard');

    constructor(
        private readonly cards: RankCardService,
        private readonly store: RankCardStore,
        private readonly assets: WelcomeStore,
    ) {}

    private async panel(guildId: string, user: User, member: GuildMember | null): Promise<InteractionEditReplyOptions> {
        const theme = await this.store.theme(guildId);
        const saved = allowedMemberStyle(theme, await this.store.memberStyle(guildId, user.id));
        const style = applyMemberStyle(theme, saved);
        const { image } = await this.cards.renderRank(guildId, user, member, style);
        const rules = theme.members;
        const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

        if (rules.layout) {
            rows.push(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(ID.layout)
                        .setPlaceholder('แบบการ์ด')
                        .addOptions(RANK_LAYOUTS.map((layout) => ({ label: RANK_LAYOUT_LABELS[layout], value: layout, default: layout === style.layout }))),
                ),
            );
        }
        if (rules.colors) {
            const preset = RANK_COLOR_PRESETS.find((color) => color.value === style.accentColor);
            rows.push(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(ID.accent)
                        .setPlaceholder(`สีหลัก: ${style.accentColor.toUpperCase()}`)
                        .addOptions([
                            ...RANK_COLOR_PRESETS.map((color) => ({ label: `สีหลัก: ${color.name}`, description: color.value.toUpperCase(), value: color.value, default: color === preset })),
                            { label: 'ตั้งสีเอง…', description: 'พิมพ์รหัสสี #RRGGBB ของสีหลัก / ตัวอักษร / พื้นหลัง', value: CUSTOM },
                        ]),
                ),
            );
        }
        const backgrounds = await this.backgroundOptions(guildId, theme);
        if (backgrounds.length) {
            const current = style.background.type === 'image' && saved.background ? `asset:${style.background.imageId}` : THEME_BG;
            rows.push(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(ID.background)
                        .setPlaceholder('รูปพื้นหลัง')
                        .addOptions(
                            [{ label: 'พื้นหลังของเซิร์ฟเวอร์ / สีที่ตั้งเอง', value: THEME_BG }, ...backgrounds].map((option) => ({ ...option, default: option.value === current })),
                        ),
                ),
            );
        }
        const buttons = new ActionRowBuilder<ButtonBuilder>();
        if (rules.colors) buttons.addComponents(new ButtonBuilder().setCustomId(ID.custom).setLabel('ตั้งสีเอง').setEmoji('🎨').setStyle(ButtonStyle.Primary));
        buttons.addComponents(
            new ButtonBuilder()
                .setCustomId(ID.reset)
                .setLabel('ใช้ธีมของเซิร์ฟเวอร์')
                .setEmoji('↩️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!Object.keys(saved).length),
        );
        rows.push(buttons);

        return {
            content: '🎨 **แต่งการ์ด /rank ของคุณ** — เลือกจากเมนูด้านล่าง เปลี่ยนแล้วบันทึกทันที (แต่งละเอียดกว่านี้ได้ที่หน้า Levels → การ์ดของฉัน ใน Dashboard)',
            files: [new AttachmentBuilder(image, { name: 'rank-preview.png' })],
            attachments: [],
            components: rows,
        };
    }

    // รูปพื้นหลังที่แอดมินเปิดให้สมาชิกเลือก (ชื่อจากคลังรูป — รูปที่ถูกลบไปแล้วไม่แสดง)
    private async backgroundOptions(guildId: string, theme: RankCardTheme): Promise<{ label: string; value: string }[]> {
        if (!theme.members.backgrounds || !theme.members.backgroundIds.length) return [];
        const allowed = new Set(theme.members.backgroundIds);
        return (await this.assets.listAssets(guildId))
            .filter((asset) => allowed.has(asset.id))
            .slice(0, 24)
            .map((asset) => ({ label: asset.name.slice(0, 100), value: `asset:${asset.id}` }));
    }

    private colorModal(style: { accentColor: string; textColor: string; background: { color: string; color2: string } }): ModalBuilder {
        const input = (id: string, label: string, value: string, placeholder: string) =>
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7).setPlaceholder(placeholder).setValue(value),
            );
        return new ModalBuilder()
            .setCustomId(ID.modal)
            .setTitle('ตั้งสีการ์ดเอง (#RRGGBB)')
            .addComponents(
                input('accent', 'สีหลัก (หลอด XP / เลเวล / ขอบรูป)', style.accentColor, '#818CF8'),
                input('text', 'สีตัวอักษร', style.textColor, '#FFFFFF'),
                input('bg1', 'สีพื้นหลัง (เว้นว่าง = ใช้ของเซิร์ฟเวอร์)', '', style.background.color.toUpperCase()),
                input('bg2', 'สีพื้นหลังที่สอง (ไล่สี — ไม่บังคับ)', '', style.background.color2.toUpperCase()),
            );
    }

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.inCachedGuild()) return interaction.reply({ content: 'ใช้คำสั่งนี้ได้ในเซิร์ฟเวอร์เท่านั้น', flags: ephemeral });
        const theme = await this.store.theme(interaction.guildId);
        if (!theme.members.enabled) return interaction.reply({ content: '🔒 แอดมินของเซิร์ฟเวอร์นี้ปิดการแต่งการ์ดเอง — ทุกคนใช้ธีมของเซิร์ฟเวอร์', flags: ephemeral });
        await interaction.deferReply({ flags: ephemeral });
        try {
            return interaction.editReply(await this.panel(interaction.guildId, interaction.user, interaction.member));
        } catch (err) {
            this.logger.error(`/rankcard: ${err instanceof Error ? err.stack : String(err)}`);
            return interaction.editReply({ content: '❌ เปิดหน้าแต่งการ์ดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
        }
    }

    async handleComponent(interaction: ComponentInteraction) {
        if (!interaction.customId.startsWith('rankcard:') || !interaction.inCachedGuild()) return;
        const { guildId, user } = interaction;
        const theme = await this.store.theme(guildId);
        if (!theme.members.enabled) return interaction.reply({ content: '🔒 แอดมินปิดการแต่งการ์ดเองไปแล้ว', flags: ephemeral });
        const current: RankMemberStyle = (await this.store.memberStyle(guildId, user.id)) ?? {};
        const style = applyMemberStyle(theme, current);
        let next: RankMemberStyle | null = { ...current };

        if (interaction.isStringSelectMenu()) {
            const value = interaction.values[0] ?? '';
            if (interaction.customId === ID.layout && (RANK_LAYOUTS as readonly string[]).includes(value)) next.layout = value as RankLayout;
            else if (interaction.customId === ID.accent) {
                if (value === CUSTOM) return interaction.showModal(this.colorModal(style));
                if (HEX_COLOR_RE.test(value)) next.accentColor = value;
            } else if (interaction.customId === ID.background) {
                const imageId = value.startsWith('asset:') ? Number(value.slice('asset:'.length)) : null;
                if (imageId) next.background = { type: 'image', color: style.background.color, color2: style.background.color2, imageId };
                else delete next.background;
            } else return;
        } else if (interaction.isButton()) {
            if (interaction.customId === ID.custom) return interaction.showModal(this.colorModal(style));
            if (interaction.customId !== ID.reset) return;
            next = null;
        } else if (interaction.isModalSubmit() && interaction.customId === ID.modal) {
            const values = Object.fromEntries(['accent', 'text', 'bg1', 'bg2'].map((id) => [id, parseHex(interaction.fields.getTextInputValue(id))]));
            if (Object.values(values).includes(undefined)) {
                return interaction.reply({ content: '❌ รหัสสีต้องเป็นแบบ #RRGGBB เช่น `#818CF8`', flags: ephemeral });
            }
            if (values.accent) next.accentColor = values.accent;
            if (values.text) next.textColor = values.text;
            if (values.bg1) next.background = { type: values.bg2 ? 'gradient' : 'color', color: values.bg1, color2: values.bg2 ?? values.bg1, imageId: null };
        } else return;

        if (interaction.isModalSubmit() && !interaction.isFromMessage()) return;
        await interaction.deferUpdate();
        try {
            if (next) await this.store.saveMemberStyle(guildId, user.id, next);
            else await this.store.deleteMemberStyle(guildId, user.id);
            await interaction.editReply(await this.panel(guildId, user, interaction.member));
        } catch (err) {
            this.logger.error(`/rankcard ${interaction.customId}: ${err instanceof Error ? err.stack : String(err)}`);
            await interaction.followUp({ content: '❌ บันทึกการ์ดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', flags: ephemeral }).catch(() => {});
        }
    }
}
