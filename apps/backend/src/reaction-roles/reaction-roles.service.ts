import { Injectable, Logger } from '@nestjs/common';
import {
    REACTION_ROLE_BUTTON_STYLES,
    REACTION_ROLE_DEFAULT_COLOR,
    REACTION_ROLE_LIMITS,
    REACTION_ROLE_MODES,
    type CreateReactionRoleItemInput,
    type CreateReactionRolePanelInput,
    type PublishReactionRolePanelResponse,
    type ReactionRoleButtonStyle,
    type ReactionRoleItemDto,
    type ReactionRoleMode,
    type ReactionRolePanelDto,
    type ReactionRolePanelsResponse,
    type UpdateReactionRoleItemInput,
    type UpdateReactionRolePanelInput,
} from '@notstack/shared';
import { PermissionFlagsBits, type Message, type SendableChannels } from 'discord.js';
import { badRequest, notFound } from '../common/exceptions/api.exception';
import { DiscordService } from '../discord/discord.service';
import type { ReactionRoleItem, ReactionRolePanel } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildReactionRolePanelPayload } from './utils/reaction-roles.messages';

type PanelWithItems = ReactionRolePanel & { items: ReactionRoleItem[] };

const normalizeMode = (value: string): ReactionRoleMode =>
    REACTION_ROLE_MODES.includes(value as ReactionRoleMode) ? (value as ReactionRoleMode) : 'BUTTON';

const normalizeButtonStyle = (value: string): ReactionRoleButtonStyle =>
    REACTION_ROLE_BUTTON_STYLES.includes(value as ReactionRoleButtonStyle) ? (value as ReactionRoleButtonStyle) : 'PRIMARY';

// ==========================================
// 🎭 REACTION ROLES SERVICE — CRUD แผงรับยศ + ตัวเลือกยศ + Publish/Sync เข้า Discord
// ==========================================
@Injectable()
export class ReactionRolesService {
    private readonly logger = new Logger('ReactionRoles');

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    private toItemDto(row: ReactionRoleItem): ReactionRoleItemDto {
        return {
            id: row.id,
            panelId: row.panelId,
            roleId: row.roleId,
            label: row.label,
            emoji: row.emoji,
            buttonStyle: normalizeButtonStyle(row.buttonStyle),
            sortOrder: row.sortOrder,
        };
    }

    private toPanelDto(row: PanelWithItems): ReactionRolePanelDto {
        const sorted = [...row.items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
        return {
            id: row.id,
            guildId: row.guildId,
            channelId: row.channelId,
            messageId: row.messageId,
            title: row.title,
            description: row.description,
            embedColor: row.embedColor,
            mode: normalizeMode(row.mode),
            allowMultiple: row.allowMultiple,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            items: sorted.map((item) => this.toItemDto(item)),
        };
    }

    private async assertValidChannel(guildId: string, channelId: string): Promise<void> {
        if (!this.discord.ready) return;
        const channel = await this.discord.fetchGuildChannel(guildId, channelId);
        if (!channel?.isSendable()) {
            throw badRequest('ไม่พบห้องนี้ในเซิร์ฟเวอร์ หรือบอทไม่สามารถส่งข้อความในห้องนี้ได้');
        }
    }

    private async requirePanel(guildId: string, panelId: number): Promise<PanelWithItems> {
        const row = await this.prisma.reactionRolePanel.findFirst({
            where: { id: panelId, guildId },
            include: { items: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
        });
        if (!row) throw notFound('ไม่พบแผงรับยศนี้');
        return row;
    }

    async permissionWarnings(guildId: string, panels: ReactionRolePanelDto[]): Promise<string[]> {
        const guild = this.discord.guild(guildId);
        const me = guild?.members.me;
        if (!guild || !me) return [];

        const warnings: string[] = [];
        const hasAnyItems = panels.some((p) => p.items.length > 0);
        if (hasAnyItems && !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            warnings.push('บอทไม่มีสิทธิ์ "จัดการยศ (Manage Roles)" จึงไม่สามารถแจกหรือถอนยศได้');
        }

        const checkedRoles = new Set<string>();
        for (const panel of panels) {
            for (const item of panel.items) {
                if (checkedRoles.has(item.roleId)) continue;
                checkedRoles.add(item.roleId);
                const role = guild.roles.cache.get(item.roleId);
                if (!role) {
                    warnings.push(`ไม่พบยศ ID ${item.roleId} ในเซิร์ฟเวอร์แล้ว (แผง "${panel.title}")`);
                } else if (role.managed) {
                    warnings.push(`ยศ "@${role.name}" เป็นยศของบอท/integration — บอทไม่สามารถแจกหรือถอนยศนี้ได้`);
                } else if (role.position >= me.roles.highest.position) {
                    warnings.push(`ยศ "@${role.name}" อยู่สูงกว่าหรือเท่ากับยศของบอท — กรุณาลากยศของบอทขึ้นไปไว้เหนือยศนี้ใน Server Settings → Roles`);
                }
            }
        }
        return warnings;
    }

    async list(guildId: string): Promise<ReactionRolePanelsResponse> {
        const rows = await this.prisma.reactionRolePanel.findMany({
            where: { guildId },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            include: { items: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
        });
        const panels = rows.map((row) => this.toPanelDto(row));
        return {
            panels,
            warnings: await this.permissionWarnings(guildId, panels),
        };
    }

    async detail(guildId: string, panelId: number): Promise<ReactionRolePanelDto> {
        const row = await this.requirePanel(guildId, panelId);
        return this.toPanelDto(row);
    }

    async createPanel(guildId: string, input: CreateReactionRolePanelInput): Promise<ReactionRolePanelDto> {
        const count = await this.prisma.reactionRolePanel.count({ where: { guildId } });
        if (count >= REACTION_ROLE_LIMITS.maxPanelsPerGuild) {
            throw badRequest(`สร้างแผงรับยศได้สูงสุด ${REACTION_ROLE_LIMITS.maxPanelsPerGuild} แผงต่อเซิร์ฟเวอร์`);
        }

        await this.assertValidChannel(guildId, input.channelId);

        const itemsData = (input.items ?? []).map((item, idx) => ({
            roleId: item.roleId.trim(),
            label: item.label.trim(),
            emoji: item.emoji ? item.emoji.trim() : null,
            buttonStyle: item.buttonStyle ?? 'PRIMARY',
            sortOrder: item.sortOrder ?? idx,
        }));

        const created = await this.prisma.reactionRolePanel.create({
            data: {
                guildId,
                channelId: input.channelId.trim(),
                title: input.title.trim(),
                description: (input.description ?? '').trim(),
                embedColor: (input.embedColor ?? REACTION_ROLE_DEFAULT_COLOR).toLowerCase(),
                mode: input.mode ?? 'BUTTON',
                allowMultiple: input.allowMultiple ?? true,
                ...(itemsData.length ? { items: { create: itemsData } } : {}),
            },
            include: { items: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
        });

        return this.toPanelDto(created);
    }

    async updatePanel(guildId: string, panelId: number, input: UpdateReactionRolePanelInput): Promise<ReactionRolePanelDto> {
        const current = await this.requirePanel(guildId, panelId);
        if (input.channelId !== undefined) {
            await this.assertValidChannel(guildId, input.channelId);
        }

        const nextChannelId = input.channelId !== undefined ? input.channelId.trim() : current.channelId;
        const channelChanged = nextChannelId !== current.channelId;

        const updated = await this.prisma.$transaction(async (tx) => {
            if (input.items !== undefined) {
                const existingByRole = new Map(current.items.map((item) => [item.roleId, item]));
                const incomingRoles = new Set(input.items.map((item) => item.roleId.trim()));

                const toDeleteIds = current.items.filter((item) => !incomingRoles.has(item.roleId)).map((item) => item.id);
                if (toDeleteIds.length > 0) {
                    await tx.reactionRoleItem.deleteMany({ where: { id: { in: toDeleteIds } } });
                }

                for (let idx = 0; idx < input.items.length; idx++) {
                    const item = input.items[idx]!;
                    const roleId = item.roleId.trim();
                    const payload = {
                        roleId,
                        label: item.label.trim(),
                        emoji: item.emoji ? item.emoji.trim() : null,
                        buttonStyle: item.buttonStyle ?? 'PRIMARY',
                        sortOrder: item.sortOrder ?? idx,
                    };
                    const existing = existingByRole.get(roleId);
                    if (existing) {
                        await tx.reactionRoleItem.update({ where: { id: existing.id }, data: payload });
                    } else {
                        await tx.reactionRoleItem.create({ data: { panelId: current.id, ...payload } });
                    }
                }
            }

            return tx.reactionRolePanel.update({
                where: { id: current.id },
                data: {
                    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
                    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
                    ...(input.channelId !== undefined ? { channelId: nextChannelId } : {}),
                    ...(channelChanged ? { messageId: null } : {}),
                    ...(input.embedColor !== undefined ? { embedColor: input.embedColor.toLowerCase() } : {}),
                    ...(input.mode !== undefined ? { mode: input.mode } : {}),
                    ...(input.allowMultiple !== undefined ? { allowMultiple: input.allowMultiple } : {}),
                },
                include: { items: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
            });
        });

        return this.toPanelDto(updated);
    }

    async removePanel(guildId: string, panelId: number): Promise<void> {
        await this.requirePanel(guildId, panelId);
        await this.prisma.reactionRolePanel.delete({ where: { id: panelId } });
    }

    async addItem(guildId: string, panelId: number, input: CreateReactionRoleItemInput): Promise<ReactionRoleItemDto> {
        const panel = await this.requirePanel(guildId, panelId);
        if (panel.items.length >= REACTION_ROLE_LIMITS.maxItemsPerPanel) {
            throw badRequest(`เพิ่มตัวเลือกยศได้สูงสุด ${REACTION_ROLE_LIMITS.maxItemsPerPanel} รายการต่อแผง`);
        }

        const roleId = input.roleId.trim();
        if (panel.items.some((item) => item.roleId === roleId)) {
            throw badRequest('มียศนี้ในแผงรับยศอยู่แล้ว');
        }

        const maxSort = panel.items.reduce((max, item) => Math.max(max, item.sortOrder), -1);
        const created = await this.prisma.reactionRoleItem.create({
            data: {
                panelId: panel.id,
                roleId,
                label: input.label.trim(),
                emoji: input.emoji ? input.emoji.trim() : null,
                buttonStyle: input.buttonStyle ?? 'PRIMARY',
                sortOrder: input.sortOrder ?? maxSort + 1,
            },
        });
        return this.toItemDto(created);
    }

    async updateItem(guildId: string, panelId: number, itemId: number, input: UpdateReactionRoleItemInput): Promise<ReactionRoleItemDto> {
        const panel = await this.requirePanel(guildId, panelId);
        const existing = panel.items.find((item) => item.id === itemId);
        if (!existing) throw notFound('ไม่พบรายการยศนี้ในแผง');

        if (input.roleId !== undefined) {
            const nextRoleId = input.roleId.trim();
            if (panel.items.some((item) => item.id !== itemId && item.roleId === nextRoleId)) {
                throw badRequest('มียศนี้ในแผงรับยศอยู่แล้ว');
            }
        }

        const updated = await this.prisma.reactionRoleItem.update({
            where: { id: existing.id },
            data: {
                ...(input.roleId !== undefined ? { roleId: input.roleId.trim() } : {}),
                ...(input.label !== undefined ? { label: input.label.trim() } : {}),
                ...(input.emoji !== undefined ? { emoji: input.emoji ? input.emoji.trim() : null } : {}),
                ...(input.buttonStyle !== undefined ? { buttonStyle: input.buttonStyle } : {}),
                ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
            },
        });
        return this.toItemDto(updated);
    }

    async removeItem(guildId: string, panelId: number, itemId: number): Promise<void> {
        const panel = await this.requirePanel(guildId, panelId);
        const existing = panel.items.find((item) => item.id === itemId);
        if (!existing) throw notFound('ไม่พบรายการยศนี้ในแผง');
        await this.prisma.reactionRoleItem.delete({ where: { id: existing.id } });
    }

    // ส่งแผงเข้าห้อง Discord — ถ้ามี messageId เดิมและยังแก้ไขได้ให้ Edit ข้อความเดิม (อ้างอิงแพตเทิร์น JiraService.sendPanel)
    async publishPanel(guildId: string, panelId: number): Promise<PublishReactionRolePanelResponse> {
        this.discord.requireReady();
        const panel = await this.requirePanel(guildId, panelId);
        if (panel.items.length === 0) {
            throw badRequest('ต้องเพิ่มยศในแผงอย่างน้อย 1 รายการก่อนส่งเข้า Discord');
        }
        if (panel.items.length > REACTION_ROLE_LIMITS.maxItemsPerPanel) {
            throw badRequest(`ส่งได้สูงสุด ${REACTION_ROLE_LIMITS.maxItemsPerPanel} ตัวเลือกต่อแผง`);
        }

        const channel = await this.discord.fetchGuildChannel(guildId, panel.channelId);
        if (!channel || !channel.isSendable()) {
            throw badRequest('ไม่พบห้องที่เลือก หรือบอทไม่สามารถส่งข้อความในห้องนี้ได้');
        }

        const channelName = 'name' in channel ? String(channel.name) : panel.channelId;
        const payload = buildReactionRolePanelPayload(panel, panel.items);

        let existingMessage: Message | null = null;
        if (panel.messageId && 'messages' in channel) {
            existingMessage = await channel.messages.fetch(panel.messageId).catch(() => null);
        }

        try {
            if (existingMessage?.editable) {
                await existingMessage.edit(payload);
                const dto = this.toPanelDto(panel);
                return {
                    panel: dto,
                    channelName,
                    edited: true,
                    warnings: await this.permissionWarnings(guildId, [dto]),
                };
            }

            const sent = await (channel as SendableChannels).send(payload);
            const updated = await this.prisma.reactionRolePanel.update({
                where: { id: panel.id },
                data: { messageId: sent.id },
                include: { items: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
            });
            const dto = this.toPanelDto(updated);
            return {
                panel: dto,
                channelName,
                edited: false,
                warnings: await this.permissionWarnings(guildId, [dto]),
            };
        } catch (err) {
            this.logger.warn(`ส่งแผง Reaction Roles #${panel.id} (${guildId}) ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
            throw badRequest(`ส่งข้อความเข้า #${channelName} ไม่ได้ — ตรวจสิทธิ์ ส่งข้อความ / ฝังลิงก์ และ Emoji ที่ใช้ในห้องนี้`);
        }
    }
}
