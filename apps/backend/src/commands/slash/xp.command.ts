import { Injectable } from '@nestjs/common';
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';
import { LevelsService } from '../../levels/levels.service';

const ephemeral = MessageFlags.Ephemeral;
const SHOWN = 10;

// ที่มาของ XP แต่ละแบบ (ค่า source ในตาราง xp_history)
const SOURCE_LABELS: Record<string, string> = {
    message: '💬 ส่งข้อความ',
    voice: '🔊 ห้องเสียง',
    command: '⌨️ ใช้คำสั่ง',
    'admin.add': '🛠️ แอดมินเพิ่ม XP',
    'admin.subtract': '🛠️ แอดมินลด XP',
    'admin.set': '🛠️ แอดมินกำหนด XP',
    'admin.reset': '🛠️ แอดมินรีเซ็ต XP',
    'admin.delete': '🛠️ แอดมินลบออกจากอันดับ',
    'admin.reset_all': '🛠️ รีเซ็ต XP ทั้งเซิร์ฟเวอร์',
};

// /xp history — ประวัติการได้/เสีย XP ล่าสุด (เห็นคนเดียว) — ดูของคนอื่นได้เฉพาะผู้มีสิทธิ์ Manage Server
@SlashCommand()
@Injectable()
export class XpCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder()
        .setName('xp')
        .setDescription('ข้อมูล XP ของคุณ')
        .addSubcommand((sub) =>
            sub
                .setName('history')
                .setDescription('ประวัติการได้/เสีย XP ล่าสุด')
                .addUserOption((option) => option.setName('member').setDescription('ดูของสมาชิกคนอื่น (เฉพาะผู้มีสิทธิ์ Manage Server)')),
        );

    constructor(private readonly levels: LevelsService) {}

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.inCachedGuild()) return interaction.reply({ content: 'ใช้คำสั่งนี้ได้ในเซิร์ฟเวอร์เท่านั้น', flags: ephemeral });
        const target = interaction.options.getUser('member') ?? interaction.user;
        const isManager = interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild);
        if (target.id !== interaction.user.id && !isManager) {
            return interaction.reply({ content: '🔒 ดูประวัติ XP ของคนอื่นได้เฉพาะผู้มีสิทธิ์ Manage Server', flags: ephemeral });
        }
        if (target.bot) return interaction.reply({ content: '🤖 บอทไม่มี XP นะคร้าบ!', flags: ephemeral });

        await interaction.deferReply({ flags: ephemeral });
        const [history, today] = await Promise.all([this.levels.history(interaction.guildId, { userId: target.id }), this.levels.today(interaction.guildId, target.id)]);
        const lines = history.items.slice(0, SHOWN).map((row) => {
            const when = `<t:${Math.floor(new Date(row.createdAt).getTime() / 1000)}:R>`;
            const delta = `${row.delta >= 0 ? '+' : ''}${row.delta.toLocaleString('en-US')}`;
            const admin = row.source.startsWith('admin.');
            // เหตุผลที่แอดมินพิมพ์ไว้อาจเป็นบันทึกภายใน — สมาชิกทั่วไปเห็นแค่ว่าแอดมินแก้
            const reason = row.reason && (!admin || isManager) ? ` (${row.reason.slice(0, 60)})` : '';
            return `${when} **${delta}** XP · ${SOURCE_LABELS[row.source] ?? row.source}${reason} · รวม ${row.balance.toLocaleString('en-US')}`;
        });
        const member = interaction.options.getMember('member') ?? (target.id === interaction.user.id ? interaction.member : null);
        const cap = today.dailyCap ? ` จากเพดาน ${today.dailyCap.toLocaleString('en-US')} XP/วัน` : '';
        const embed = new EmbedBuilder()
            .setColor(0x818cf8)
            .setAuthor({ name: member?.displayName ?? target.username, iconURL: target.displayAvatarURL() })
            .setTitle('📜 ประวัติ XP ล่าสุด')
            .setDescription(lines.length ? lines.join('\n') : 'ยังไม่มีประวัติ XP (เก็บย้อนหลัง 90 วัน)')
            .setFooter({ text: `วันนี้ได้ ${today.earned.toLocaleString('en-US')} XP${cap} · แสดง ${SHOWN} รายการล่าสุด` });
        return interaction.editReply({ embeds: [embed] });
    }
}
