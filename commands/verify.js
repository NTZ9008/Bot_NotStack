const { SlashCommandBuilder } = require('discord.js');

const allowedSections = ['dst04', 'dst05']; // รุ่นที่อนุญาต
const correctPassword = 'notstack123'; // รหัสผ่าน

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('ยืนยันตัวตนเพื่อเข้าร่วมเซิร์ฟเวอร์')
    .addStringOption(option =>
      option.setName('password')
        .setDescription('กรอกรหัสผ่าน')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('rolen')
        .setDescription('เลือกรหัสชั้นรุ่น')
        .setRequired(true)
        .addChoices(
          { name: 'DST04', value: 'dst04' },
          { name: 'DST05', value: 'dst05' }
        )
    ),

  async execute(interaction) {
    const password = interaction.options.getString('password');
    const rolen = interaction.options.getString('rolen');

    const member = interaction.member;

    if (password !== correctPassword) {
      return interaction.reply({ content: '❌ รหัสผ่านไม่ถูกต้อง', ephemeral: true });
    }

    if (!allowedSections.includes(rolen)) {
      return interaction.reply({ content: '❌ รุ่นที่คุณเลือกไม่ถูกต้องหรือไม่มีสิทธิ์', ephemeral: true });
    }

    const roleName = rolen.toUpperCase();
    const role = interaction.guild.roles.cache.find(r => r.name === roleName);

    if (!role) {
      return interaction.reply({ content: `❌ ไม่พบ Role ชื่อ "${roleName}" ในเซิร์ฟเวอร์`, ephemeral: true });
    }

    try {
      await member.roles.add(role);
      await interaction.reply({ content: `✅ ยืนยันสำเร็จ! คุณได้รับ Role "${roleName}" แล้ว`, ephemeral: true });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ เกิดข้อผิดพลาดขณะให้ Role', ephemeral: true });
    }
  }
};
