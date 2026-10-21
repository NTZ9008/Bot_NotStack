import { Injectable } from '@nestjs/common';
import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { REACTION_ROLES, REACTION_ROLES_TITLE } from '../../chat/reaction-roles.constants';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';

const ephemeral = MessageFlags.Ephemeral;

// ==========================================
// /setuproles — ส่งข้อความรับยศทั่วไปแบบ Reaction (ตัวจัดการ reaction อยู่ใน chat/listeners/reaction-roles.listener.ts)
// ==========================================
@SlashCommand()
@Injectable()
export class SetupRolesCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder().setName('setuproles').setDescription('ตั้งค่าข้อความรับยศทั่วไป');
    // คำสั่งเฉพาะของเซิร์ฟเวอร์หลัก — ลงทะเบียนแบบ guild command ที่เซิร์ฟเวอร์หลักที่เดียว
    static readonly homeGuildOnly = true;

    async execute(interaction: ChatInputCommandInteraction) {
        // ป้องกัน Timeout: ให้บอทตอบกลับแบบกำลังโหลดไปก่อน
        await interaction.reply({ content: '⏳ กำลังสร้างข้อความรับยศและใส่ Reaction... กรุณารอสักครู่', flags: ephemeral });
        if (!interaction.channel?.isSendable()) return interaction.editReply({ content: '❌ ส่งข้อความในห้องนี้ไม่ได้' });

        const embed = new EmbedBuilder()
            .setTitle(REACTION_ROLES_TITLE)
            .setDescription(
                'โปรดกด Reaction ที่ด้านล่างเพื่อรับ หรือ เอาออก ยศที่คุณต้องการ:\n\n' +
                    '4️⃣ **DST04** - รุ่นที่ 4\n' +
                    '5️⃣ **DST05** - รุ่นที่ 5\n' +
                    '6️⃣ **DST06** - รุ่นที่ 6\n' +
                    '✨ **คนหน้าตาดีประจำซีซั่น** - ยศคนหน้าตาดี (รับได้ทุกคน)',
            )
            .setColor('#2b2d31')
            .setFooter({ text: 'สำหรับยศพิเศษ (บัตร VIP) กรุณาใช้คำสั่ง /addroles แทนครับ' });

        const message = await interaction.channel.send({ embeds: [embed] });
        // บอทกด Reaction ไว้เป็นปุ่มให้คนมากดตาม
        for (const emoji of Object.keys(REACTION_ROLES)) await message.react(emoji);
        await interaction.editReply({ content: '✅ สร้างข้อความสำหรับรับยศทั่วไปสำเร็จแล้วครับ! (ใช้ Reaction)' });
    }
}
