import { Injectable, Logger, Optional } from '@nestjs/common';
import { PLUGIN_BOT_DISABLED_MESSAGE } from '@notstack/shared';
import {
    Events,
    MessageFlags,
    PermissionFlagsBits,
    type ButtonInteraction,
    type Guild,
    type GuildMember,
    type Interaction,
    type Role,
    type StringSelectMenuInteraction,
} from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import type { ReactionRoleItem, ReactionRolePanel } from '../../generated/prisma/client';
import { PluginsService } from '../../plugins/plugins.service';
import { PrismaService } from '../../prisma/prisma.service';
import { parseReactionRoleCustomId } from '../utils/reaction-roles.messages';

type PanelWithItems = ReactionRolePanel & { items: ReactionRoleItem[] };
type RoleCheckResult = { ok: true; role: Role } | { ok: false; message: string };

const EPHEMERAL = MessageFlags.Ephemeral;

// ==========================================
// 🎭 REACTION ROLE INTERACTION LISTENER (Per-Guild Plugin)
// จัดการเฉพาะ customId prefix `rr:btn:<panelId>:<itemId>` และ `rr:sel:<panelId>`
// แยกอิสระจาก ReactionRolesListener เดิมของ Home Server
// ==========================================
@Injectable()
export class ReactionRoleInteractionListener {
    private readonly logger = new Logger('ReactionRoles');
    private readonly processing = new Set<string>();

    constructor(
        private readonly prisma: PrismaService,
        @Optional() private readonly plugins?: PluginsService,
    ) {}

    @OnDiscord(Events.InteractionCreate)
    async onInteraction(interaction: Interaction): Promise<void> {
        if (!(interaction.isButton() || interaction.isStringSelectMenu())) return;

        const parsed = parseReactionRoleCustomId(interaction.customId);
        if (!parsed) return;

        if (!interaction.inCachedGuild()) {
            if (interaction.isRepliable()) {
                await interaction.reply({ content: '❌ ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น', flags: EPHEMERAL }).catch(() => {});
            }
            return;
        }

        if (this.plugins && !(await this.plugins.isInstalled(interaction.guildId, 'reaction-roles'))) {
            if (interaction.isRepliable()) {
                await interaction.reply({ content: PLUGIN_BOT_DISABLED_MESSAGE, flags: EPHEMERAL }).catch(() => {});
            }
            return;
        }

        const lockKey = `${interaction.guildId}:${interaction.user.id}`;
        if (this.processing.has(lockKey)) {
            await interaction.reply({ content: '⏳ กำลังปรับยศให้คุณอยู่ กรุณารอสักครู่', flags: EPHEMERAL }).catch(() => {});
            return;
        }

        this.processing.add(lockKey);
        try {
            const panel = await this.prisma.reactionRolePanel.findFirst({
                where: { id: parsed.panelId, guildId: interaction.guildId },
                include: { items: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
            });
            if (!panel) {
                await interaction.reply({ content: '❌ แผงรับยศนี้ไม่มีอยู่ในระบบแล้ว', flags: EPHEMERAL });
                return;
            }

            const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
            if (!me) {
                await interaction.reply({ content: '❌ ไม่สามารถตรวจสอบสิทธิ์ของบอทในเซิร์ฟเวอร์ได้', flags: EPHEMERAL });
                return;
            }
            if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                await interaction.reply({
                    content: '❌ บอทไม่มีสิทธิ์ **จัดการยศ (Manage Roles)** ในเซิร์ฟเวอร์นี้ กรุณาแจ้งผู้ดูแลเซิร์ฟเวอร์',
                    flags: EPHEMERAL,
                });
                return;
            }

            if (parsed.kind === 'button' && interaction.isButton()) {
                await this.handleButton(interaction, panel, me, parsed.itemId);
            } else if (parsed.kind === 'select' && interaction.isStringSelectMenu()) {
                await this.handleSelect(interaction, panel, me);
            }
        } catch (err) {
            this.logger.error(`${interaction.customId}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
            const msg = this.formatRoleError(err);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: msg }).catch(() => {});
            } else {
                await interaction.reply({ content: msg, flags: EPHEMERAL }).catch(() => {});
            }
        } finally {
            this.processing.delete(lockKey);
        }
    }

    private formatRoleError(err: unknown): string {
        const code = (err as { code?: number })?.code;
        if (code === 50013) {
            return '❌ บอทไม่มีสิทธิ์จัดการยศนี้ กรุณาแจ้งผู้ดูแลเซิร์ฟเวอร์ให้ตรวจสอบสิทธิ์ Manage Roles และลำดับยศของบอท';
        }
        return '❌ ไม่สามารถปรับยศได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
    }

    private async resolveAssignableRole(guild: Guild, me: GuildMember, roleId: string): Promise<RoleCheckResult> {
        const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
        if (!role || role.id === guild.id) {
            return { ok: false, message: '❌ ไม่พบยศนี้ในเซิร์ฟเวอร์ (ยศอาจถูกลบไปแล้ว)' };
        }
        if (role.managed) {
            return {
                ok: false,
                message: `❌ ยศ **${role.name}** เป็นยศของบอทหรือระบบภายนอก บอทไม่สามารถมอบหรือถอดยศนี้ได้`,
            };
        }
        if (role.position >= me.roles.highest.position) {
            return {
                ok: false,
                message: `❌ ลำดับยศของบอทอยู่ต่ำกว่าหรือเท่ากับยศ **${role.name}** — กรุณาแจ้งผู้ดูแลเซิร์ฟเวอร์ให้ลากยศของบอทขึ้นไปไว้เหนือยศนี้`,
            };
        }
        return { ok: true, role };
    }

    private async replyEphemeral(interaction: ButtonInteraction<'cached'> | StringSelectMenuInteraction<'cached'>, content: string): Promise<void> {
        await interaction.reply({ content, flags: EPHEMERAL, allowedMentions: { parse: [] } });
    }

    private async handleButton(
        interaction: ButtonInteraction<'cached'>,
        panel: PanelWithItems,
        me: GuildMember,
        itemId: number,
    ): Promise<void> {
        const item = panel.items.find((entry) => entry.id === itemId);
        if (!item) {
            await this.replyEphemeral(interaction, '❌ ตัวเลือกยศนี้ถูกนำออกจากแผงแล้ว');
            return;
        }

        const check = await this.resolveAssignableRole(interaction.guild, me, item.roleId);
        if (!check.ok) {
            await this.replyEphemeral(interaction, check.message);
            return;
        }

        const member = interaction.member;
        const targetRole = check.role;

        if (member.roles.cache.has(targetRole.id)) {
            await member.roles.remove(targetRole, `Reaction Roles (${panel.title})`);
            await this.replyEphemeral(interaction, `➖ ถอดยศ <@&${targetRole.id}> ออกแล้ว`);
            return;
        }

        const removedRoles: Role[] = [];
        if (!panel.allowMultiple) {
            const otherRoleIds = panel.items
                .filter((entry) => entry.roleId !== targetRole.id && member.roles.cache.has(entry.roleId))
                .map((entry) => entry.roleId);

            for (const otherId of otherRoleIds) {
                const otherCheck = await this.resolveAssignableRole(interaction.guild, me, otherId);
                if (!otherCheck.ok) {
                    await this.replyEphemeral(interaction, otherCheck.message);
                    return;
                }
                removedRoles.push(otherCheck.role);
            }

            if (removedRoles.length > 0) {
                await member.roles.remove(removedRoles, `Reaction Roles single-choice (${panel.title})`);
            }
        }

        await member.roles.add(targetRole, `Reaction Roles (${panel.title})`);
        if (removedRoles.length > 0) {
            const removedMentions = removedRoles.map((r) => `<@&${r.id}>`).join(', ');
            await this.replyEphemeral(interaction, `✅ เปลี่ยนเป็นยศ <@&${targetRole.id}> แล้ว (ถอด ${removedMentions} ออก)`);
        } else {
            await this.replyEphemeral(interaction, `✅ มอบยศ <@&${targetRole.id}> ให้คุณแล้ว`);
        }
    }

    private async handleSelect(
        interaction: StringSelectMenuInteraction<'cached'>,
        panel: PanelWithItems,
        me: GuildMember,
    ): Promise<void> {
        const selectedItems = interaction.values
            .map((value) => panel.items.find((entry) => String(entry.id) === value))
            .filter((entry): entry is ReactionRoleItem => entry !== undefined);

        const member = interaction.member;

        if (selectedItems.length === 0) {
            const heldRoles: Role[] = [];
            for (const entry of panel.items) {
                if (!member.roles.cache.has(entry.roleId)) continue;
                const check = await this.resolveAssignableRole(interaction.guild, me, entry.roleId);
                if (!check.ok) {
                    await this.replyEphemeral(interaction, check.message);
                    return;
                }
                heldRoles.push(check.role);
            }
            if (heldRoles.length === 0) {
                await this.replyEphemeral(interaction, 'ℹ️ คุณยังไม่มียศจากแผงนี้');
                return;
            }
            await member.roles.remove(heldRoles, `Reaction Roles cleared (${panel.title})`);
            await this.replyEphemeral(interaction, `➖ ถอดยศ ${heldRoles.map((r) => `<@&${r.id}>`).join(', ')} ออกแล้ว`);
            return;
        }

        if (!panel.allowMultiple) {
            const chosen = selectedItems[0]!;
            const check = await this.resolveAssignableRole(interaction.guild, me, chosen.roleId);
            if (!check.ok) {
                await this.replyEphemeral(interaction, check.message);
                return;
            }
            const targetRole = check.role;
            const otherRoles: Role[] = [];
            for (const entry of panel.items) {
                if (entry.roleId === targetRole.id || !member.roles.cache.has(entry.roleId)) continue;
                const otherCheck = await this.resolveAssignableRole(interaction.guild, me, entry.roleId);
                if (!otherCheck.ok) {
                    await this.replyEphemeral(interaction, otherCheck.message);
                    return;
                }
                otherRoles.push(otherCheck.role);
            }

            if (member.roles.cache.has(targetRole.id) && otherRoles.length === 0) {
                await member.roles.remove(targetRole, `Reaction Roles toggle off (${panel.title})`);
                await this.replyEphemeral(interaction, `➖ ถอดยศ <@&${targetRole.id}> ออกแล้ว`);
                return;
            }

            if (otherRoles.length > 0) {
                await member.roles.remove(otherRoles, `Reaction Roles single-choice (${panel.title})`);
            }
            if (!member.roles.cache.has(targetRole.id)) {
                await member.roles.add(targetRole, `Reaction Roles (${panel.title})`);
            }

            if (otherRoles.length > 0) {
                await this.replyEphemeral(
                    interaction,
                    `✅ เปลี่ยนเป็นยศ <@&${targetRole.id}> แล้ว (ถอด ${otherRoles.map((r) => `<@&${r.id}>`).join(', ')} ออก)`,
                );
            } else {
                await this.replyEphemeral(interaction, `✅ มอบยศ <@&${targetRole.id}> ให้คุณแล้ว`);
            }
            return;
        }

        const resolvedRoles: Role[] = [];
        for (const item of selectedItems) {
            const check = await this.resolveAssignableRole(interaction.guild, me, item.roleId);
            if (!check.ok) {
                await this.replyEphemeral(interaction, check.message);
                return;
            }
            resolvedRoles.push(check.role);
        }

        const toAdd = resolvedRoles.filter((role) => !member.roles.cache.has(role.id));
        const toRemove = resolvedRoles.filter((role) => member.roles.cache.has(role.id));

        if (toRemove.length > 0) {
            await member.roles.remove(toRemove, `Reaction Roles toggle (${panel.title})`);
        }
        if (toAdd.length > 0) {
            await member.roles.add(toAdd, `Reaction Roles (${panel.title})`);
        }

        const lines: string[] = [];
        if (toAdd.length > 0) lines.push(`✅ เพิ่มยศ: ${toAdd.map((r) => `<@&${r.id}>`).join(', ')}`);
        if (toRemove.length > 0) lines.push(`➖ ถอดยศ: ${toRemove.map((r) => `<@&${r.id}>`).join(', ')}`);
        await this.replyEphemeral(interaction, lines.join('\n') || 'ℹ️ ไม่มีการเปลี่ยนแปลงยศ');
    }
}
