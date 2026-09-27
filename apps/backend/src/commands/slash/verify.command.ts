import { Injectable } from '@nestjs/common';
import {
    ActionRowBuilder,
    MessageFlags,
    ModalBuilder,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle,
    type ChatInputCommandInteraction,
    type GuildMember,
} from 'discord.js';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { ComponentInteraction, SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';

const ephemeral = MessageFlags.Ephemeral;
const VERIFY_PASSWORD = 'notstack123';

// ==========================================
// /verify — เลือกรุ่นจากเมนู → กรอกรหัสผ่านใน pop-up → ได้ยศของรุ่นนั้น
// ==========================================
@SlashCommand()
@Injectable()
export class VerifyCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder().setName('verify').setDescription('เริ่มกระบวนการยืนยันตัวตนเพื่อเข้าเซิร์ฟเวอร์');
    // คำสั่งเฉพาะของเซิร์ฟเวอร์หลัก — ลงทะเบียนแบบ guild command ที่เซิร์ฟเวอร์หลักที่เดียว
    static readonly homeGuildOnly = true;

    async execute(interaction: ChatInputCommandInteraction) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('verify_select_role')
            .setPlaceholder('🔍 คลิกลูกศรเพื่อเลือกรุ่นของคุณ')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('รุ่น DST04').setValue('DST04').setDescription('สำหรับนักศึกษารุ่นที่ 4').setEmoji('🎓'),
                new StringSelectMenuOptionBuilder().setLabel('รุ่น DST05').setValue('DST05').setDescription('สำหรับนักศึกษารุ่นที่ 5').setEmoji('🎓'),
            );
        await interaction.reply({
            content: '👋 **ยินดีต้อนรับสู่ระบบยืนยันตัวตน!**\nโปรดเลือกรุ่นของคุณจากเมนูด้านล่างนี้ครับ:',
            components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)],
            flags: ephemeral,
        });
    }

    async handleComponent(interaction: ComponentInteraction) {
        // ด่านที่ 1: เลือกรุ่นจากเมนู → เด้ง pop-up ถามรหัสผ่าน (ฝังชื่อรุ่นไว้ใน customId)
        if (interaction.isStringSelectMenu() && interaction.customId === 'verify_select_role') {
            const selectedRole = interaction.values[0];
            const modal = new ModalBuilder().setCustomId(`verify_modal_${selectedRole}`).setTitle(`ยืนยันรหัสผ่านสำหรับรุ่น ${selectedRole}`);
            const passwordInput = new TextInputBuilder()
                .setCustomId('password_input')
                .setLabel(`🔑 รหัสผ่านของรุ่น ${selectedRole} คืออะไร?`)
                .setPlaceholder('พิมพ์รหัสผ่านที่นี่...')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(passwordInput));
            await interaction.showModal(modal);
            return;
        }

        // ด่านที่ 2: กรอกรหัสผ่านใน pop-up แล้วกดส่ง
        if (interaction.isModalSubmit() && interaction.customId.startsWith('verify_modal_')) {
            const roleName = interaction.customId.replace('verify_modal_', '');
            const password = interaction.fields.getTextInputValue('password_input');
            const member = interaction.member as GuildMember | null;

            if (password !== VERIFY_PASSWORD) {
                return interaction.reply({ content: '❌ **รหัสผ่านไม่ถูกต้อง** กรุณาลองใหม่อีกครั้ง', flags: ephemeral });
            }
            const role = interaction.guild?.roles.cache.find((r) => r.name === roleName);
            if (!role || !member) {
                return interaction.reply({ content: `❌ ระบบขัดข้อง: แอดมินยังไม่ได้สร้าง Role ชื่อ **"${roleName}"** ไว้ในเซิร์ฟเวอร์`, flags: ephemeral });
            }
            // ป้องกันการขอยศซ้ำ
            if (member.roles.cache.has(role.id)) {
                return interaction.reply({ content: `✅ คุณมียศ **${roleName}** อยู่แล้วครับ ไม่ต้องยืนยันซ้ำ`, flags: ephemeral });
            }
            try {
                await member.roles.add(role);
                await interaction.reply({ content: `🎉 **ยืนยันตัวตนสำเร็จ!** คุณได้รับยศ **${roleName}** เรียบร้อยแล้ว ยินดีต้อนรับครับ!`, flags: ephemeral });
            } catch {
                await interaction.reply({ content: '❌ บอทไม่มีสิทธิ์ให้ยศ (โปรดเช็คว่ายศของบอทอยู่สูงกว่ายศที่จะให้ไหม)', flags: ephemeral });
            }
        }
    }
}
