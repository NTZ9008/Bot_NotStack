import {
    HEX_COLOR_RE,
    REACTION_ROLE_BUTTON_STYLES,
    REACTION_ROLE_DEFAULT_COLOR,
    REACTION_ROLE_LIMITS,
    type ReactionRoleButtonStyle,
    type ReactionRoleMode,
} from '@notstack/shared';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    type MessageCreateOptions,
} from 'discord.js';

export type PanelPayload = Pick<MessageCreateOptions, 'embeds' | 'components' | 'allowedMentions'>;

export interface ReactionRoleMessagePanel {
    id: number;
    title: string;
    description: string;
    embedColor: string;
    mode: ReactionRoleMode | string;
    allowMultiple: boolean;
}

export interface ReactionRoleMessageItem {
    id: number;
    roleId: string;
    label: string;
    emoji: string | null;
    buttonStyle: ReactionRoleButtonStyle | string;
}

// ==========================================
// 🆔 customId สำหรับแผงรับยศแบบใหม่ (rr:btn:<panelId>:<itemId> และ rr:sel:<panelId>)
// แยกจาก ReactionRolesListener เดิมของ Home Server โดยสมบูรณ์
// ==========================================
export const RR_IDS = {
    button: (panelId: number, itemId: number) => `rr:btn:${panelId}:${itemId}`,
    select: (panelId: number) => `rr:sel:${panelId}`,
} as const;

export type ReactionRoleCustomId =
    | { kind: 'button'; panelId: number; itemId: number }
    | { kind: 'select'; panelId: number };

export function parseReactionRoleCustomId(customId: string): ReactionRoleCustomId | null {
    const btn = /^rr:btn:(\d+):(\d+)$/.exec(customId);
    if (btn) {
        const panelId = Number(btn[1]);
        const itemId = Number(btn[2]);
        if (Number.isSafeInteger(panelId) && panelId > 0 && Number.isSafeInteger(itemId) && itemId > 0) {
            return { kind: 'button', panelId, itemId };
        }
        return null;
    }

    const sel = /^rr:sel:(\d+)$/.exec(customId);
    if (sel) {
        const panelId = Number(sel[1]);
        if (Number.isSafeInteger(panelId) && panelId > 0) {
            return { kind: 'select', panelId };
        }
    }

    return null;
}

const BUTTON_STYLE_MAP: Record<ReactionRoleButtonStyle, ButtonStyle> = {
    PRIMARY: ButtonStyle.Primary,
    SECONDARY: ButtonStyle.Secondary,
    SUCCESS: ButtonStyle.Success,
    DANGER: ButtonStyle.Danger,
};

const parseColorInt = (hex: string): number => {
    const safe = HEX_COLOR_RE.test(hex) ? hex : REACTION_ROLE_DEFAULT_COLOR;
    return Number.parseInt(safe.slice(1), 16);
};

export function buildReactionRolePanelPayload(panel: ReactionRoleMessagePanel, items: ReactionRoleMessageItem[]): PanelPayload {
    const embed = new EmbedBuilder()
        .setColor(parseColorInt(panel.embedColor))
        .setTitle(panel.title.slice(0, 256))
        .setFooter({
            text: panel.allowMultiple ? 'เลือกได้หลายยศ • กดซ้ำเพื่อถอดยศ' : 'เลือกได้ครั้งละ 1 ยศ • กดซ้ำเพื่อถอดยศ',
        });

    if (panel.description.trim()) {
        embed.setDescription(panel.description.slice(0, 4096));
    }

    const capped = items.slice(0, REACTION_ROLE_LIMITS.maxItemsPerPanel);

    if (panel.mode === 'SELECT') {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(RR_IDS.select(panel.id))
            .setPlaceholder(panel.allowMultiple ? 'เลือกยศที่ต้องการรับหรือถอด...' : 'เลือกยศที่ต้องการรับ (1 ยศ)...')
            .setMinValues(0)
            .setMaxValues(panel.allowMultiple ? Math.max(1, capped.length) : 1)
            .addOptions(
                capped.map((item) => ({
                    label: item.label.slice(0, 100),
                    value: String(item.id),
                    ...(item.emoji ? { emoji: item.emoji } : {}),
                })),
            );

        return {
            embeds: [embed],
            components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
            allowedMentions: { parse: [] },
        };
    }

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < capped.length; i += 5) {
        const chunk = capped.slice(i, i + 5);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            chunk.map((item) => {
                const styleKey = REACTION_ROLE_BUTTON_STYLES.includes(item.buttonStyle as ReactionRoleButtonStyle)
                    ? (item.buttonStyle as ReactionRoleButtonStyle)
                    : 'PRIMARY';
                const btn = new ButtonBuilder()
                    .setCustomId(RR_IDS.button(panel.id, item.id))
                    .setStyle(BUTTON_STYLE_MAP[styleKey])
                    .setLabel(item.label.slice(0, 80));
                if (item.emoji) btn.setEmoji(item.emoji);
                return btn;
            }),
        );
        rows.push(row);
    }

    return {
        embeds: [embed],
        components: rows,
        allowedMentions: { parse: [] },
    };
}
