import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ModalBuilder,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
    type ChatInputCommandInteraction,
    type GuildMember,
} from 'discord.js';
import { thaiTimestamp } from '../../common/utils/parse.util';
import { AttemptLimiter, passwordMatches } from '../../common/utils/role-password';
import type { Env } from '../../config/env.validation';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { ComponentInteraction, SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';
import { LogFilesService } from '../../log-files/log-files.service';

const ephemeral = MessageFlags.Ephemeral;

// ==========================================
// /addroles — ยศพิเศษที่ต้องใช้รหัสผ่าน (กดซ้ำ = เอายศออก) + บันทึกทุกครั้งที่มีคนลองกรอกรหัส
// รหัสผ่านอยู่ใน .env (VIP_ROLE_PASSWORD) — ไม่ตั้ง = ปิดการรับยศพิเศษ
// ==========================================
const VIP_ROLE = 'บัตร vip';

// ใส่รหัสผิดครบ 5 ครั้งใน 15 นาที → ต้องรอ
const MAX_FAILURES = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

@SlashCommand()
@Injectable()
export class AddRolesCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder().setName('addroles').setDescription('เลือกรุ่นหรือยศพิเศษที่ต้องการ (ต้องใช้รหัสผ่าน)');
    // คำสั่งเฉพาะของเซิร์ฟเวอร์หลัก — ลงทะเบียนแบบ guild command ที่เซิร์ฟเวอร์หลักที่เดียว
    static readonly homeGuildOnly = true;

    private readonly logger = new Logger('AddRoles');
    // ชื่อยศ → รหัสผ่าน
    private readonly specialRoles = new Map<string, string>();
    private readonly attempts = new AttemptLimiter(MAX_FAILURES, LOCK_WINDOW_MS);

    constructor(
        private readonly logFiles: LogFilesService,
        config: ConfigService<Env, true>,
    ) {
        const vipPassword = config.get('VIP_ROLE_PASSWORD', { infer: true });
        if (vipPassword) this.specialRoles.set(VIP_ROLE, vipPassword);
        else this.logger.warn('ยังไม่ได้ตั้ง VIP_ROLE_PASSWORD — /addroles จะยังใช้ไม่ได้');
    }

    private logAttempt(interaction: ComponentInteraction, roleName: string, status: 'SUCCESS' | 'FAIL'): void {
        this.logFiles.appendSpecialRole(
            `[${thaiTimestamp()}] User:${interaction.user.tag} (${interaction.user.id}) Role:${roleName} Status:${status}\n`,
        );
    }

    async execute(interaction: ChatInputCommandInteraction) {
        if (!this.specialRoles.size) {
            return interaction.reply({ content: '⚠️ ระบบรับยศพิเศษยังไม่เปิดใช้งาน กรุณาติดต่อแอดมิน', flags: ephemeral });
        }
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`role-btn-${VIP_ROLE}`).setLabel(`รับยศ ${VIP_ROLE}`).setEmoji('💎').setStyle(ButtonStyle.Danger),
        );
        await interaction.reply({
            content: '🎭 **ระบบจัดการยศพิเศษ**\nโปรดกดปุ่มด้านล่างนี้ และกรอกรหัสผ่านเพื่อรับยศครับ:',
            components: [row],
            flags: ephemeral, // ให้เห็นเฉพาะคนกด
        });
    }

    async handleComponent(interaction: ComponentInteraction) {
        // ด่านที่ 1: กดปุ่มเลือกยศ → เด้ง pop-up ถามรหัสผ่าน
        if (interaction.isButton() && interaction.customId.startsWith('role-btn-')) {
            const roleName = interaction.customId.slice('role-btn-'.length);
            if (!this.specialRoles.has(roleName)) return;
            const role = interaction.guild?.roles.cache.find((r) => r.name === roleName);
            if (!role) return interaction.reply({ content: `❌ ระบบขัดข้อง: ไม่พบยศชื่อ **${roleName}** ในเซิร์ฟเวอร์`, flags: ephemeral });

            const modal = new ModalBuilder().setCustomId(`role-password-${roleName}`).setTitle(`🔒 ยืนยันรหัสผ่านสำหรับยศ ${roleName}`);
            const passwordInput = new TextInputBuilder()
                .setCustomId('password')
                .setLabel('🔑 กรุณาใส่รหัสผ่านเพื่อรับยศนี้')
                .setPlaceholder('พิมพ์รหัสผ่านที่นี่...')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(100)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(passwordInput));
            return interaction.showModal(modal);
        }

        // ด่านที่ 2: กรอกรหัสผ่านใน pop-up
        if (interaction.isModalSubmit() && interaction.customId.startsWith('role-password-')) {
            const roleName = interaction.customId.slice('role-password-'.length);
            const expected = this.specialRoles.get(roleName);
            if (!expected) return;
            const blockedUntil = this.attempts.blockedUntil(interaction.user.id);
            if (blockedUntil) {
                return interaction.reply({ content: `⏳ ใส่รหัสผิดหลายครั้งเกินไป ลองใหม่ได้ <t:${Math.ceil(blockedUntil / 1000)}:R>`, flags: ephemeral });
            }
            const password = interaction.fields.getTextInputValue('password');
            const role = interaction.guild?.roles.cache.find((r) => r.name === roleName);
            const member = interaction.member as GuildMember | null;
            if (!role || !member) return interaction.reply({ content: `❌ ระบบขัดข้อง: ไม่พบยศชื่อ **${roleName}** ในเซิร์ฟเวอร์`, flags: ephemeral });

            if (!passwordMatches(password, expected)) {
                this.attempts.fail(interaction.user.id);
                this.logAttempt(interaction, roleName, 'FAIL');
                return interaction.reply({ content: '❌ **รหัสผ่านไม่ถูกต้อง!** ไม่สามารถรับยศ VIP ได้', flags: ephemeral });
            }
            this.attempts.reset(interaction.user.id);
            this.logAttempt(interaction, roleName, 'SUCCESS');

            if (member.roles.cache.has(role.id)) {
                await member.roles.remove(role);
                return interaction.reply({ content: `🗑️ ระบบได้ **ดึงยศ** **${roleName}** ออกจากคุณแล้วครับ`, flags: ephemeral });
            }
            await member.roles.add(role);
            return interaction.reply({ content: `🎉 **สำเร็จ!** รหัสผ่านถูกต้อง คุณได้รับยศ **${roleName}** เรียบร้อยแล้ว`, flags: ephemeral });
        }
    }
}
