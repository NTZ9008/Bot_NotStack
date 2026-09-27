import { Injectable } from '@nestjs/common';
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
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { ComponentInteraction, SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';
import { LogFilesService } from '../../log-files/log-files.service';

const ephemeral = MessageFlags.Ephemeral;

// ==========================================
// /addroles — ยศพิเศษที่ต้องใช้รหัสผ่าน (กดซ้ำ = เอายศออก) + บันทึกทุกครั้งที่มีคนลองกรอกรหัส
// ==========================================
const SPECIAL_ROLES: Record<string, string> = {
    'บัตร vip': 'notstackvip',
};

@SlashCommand()
@Injectable()
export class AddRolesCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder().setName('addroles').setDescription('เลือกรุ่นหรือยศพิเศษที่ต้องการ (ต้องใช้รหัสผ่าน)');
    // คำสั่งเฉพาะของเซิร์ฟเวอร์หลัก — ลงทะเบียนแบบ guild command ที่เซิร์ฟเวอร์หลักที่เดียว
    static readonly homeGuildOnly = true;

    constructor(private readonly logFiles: LogFilesService) {}

    private logAttempt(interaction: ComponentInteraction, roleName: string, status: 'SUCCESS' | 'FAIL'): void {
        this.logFiles.appendSpecialRole(
            `[${thaiTimestamp()}] User:${interaction.user.tag} (${interaction.user.id}) Role:${roleName} Status:${status}\n`,
        );
    }

    async execute(interaction: ChatInputCommandInteraction) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('role-btn-บัตร vip').setLabel('รับยศ บัตร vip').setEmoji('💎').setStyle(ButtonStyle.Danger),
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
            const roleName = interaction.customId.replace('role-btn-', '');
            const role = interaction.guild?.roles.cache.find((r) => r.name === roleName);
            if (!role) return interaction.reply({ content: `❌ ระบบขัดข้อง: ไม่พบยศชื่อ **${roleName}** ในเซิร์ฟเวอร์`, flags: ephemeral });
            if (!SPECIAL_ROLES[roleName]) return;

            const modal = new ModalBuilder().setCustomId(`role-password-${roleName}`).setTitle(`🔒 ยืนยันรหัสผ่านสำหรับยศ ${roleName}`);
            const passwordInput = new TextInputBuilder()
                .setCustomId('password')
                .setLabel('🔑 กรุณาใส่รหัสผ่านเพื่อรับยศนี้')
                .setPlaceholder('พิมพ์รหัสผ่านที่นี่...')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(passwordInput));
            return interaction.showModal(modal);
        }

        // ด่านที่ 2: กรอกรหัสผ่านใน pop-up
        if (interaction.isModalSubmit() && interaction.customId.startsWith('role-password-')) {
            const roleName = interaction.customId.replace('role-password-', '');
            const password = interaction.fields.getTextInputValue('password');
            const role = interaction.guild?.roles.cache.find((r) => r.name === roleName);
            const member = interaction.member as GuildMember | null;
            if (!role || !member) return interaction.reply({ content: `❌ ระบบขัดข้อง: ไม่พบยศชื่อ **${roleName}** ในเซิร์ฟเวอร์`, flags: ephemeral });

            if (SPECIAL_ROLES[roleName] !== password) {
                this.logAttempt(interaction, roleName, 'FAIL');
                return interaction.reply({ content: '❌ **รหัสผ่านไม่ถูกต้อง!** ไม่สามารถรับยศ VIP ได้', flags: ephemeral });
            }
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
