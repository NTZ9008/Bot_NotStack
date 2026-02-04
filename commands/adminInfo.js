const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admininfo')
    .setDescription('คำสั่งใช้เพื่อดูข้อมูลของแอดมิน'),
  
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📌 Admin Info')
      .setDescription(`นี่คือข้อมูลของผู้สร้าง`)
      .setThumbnail("https://drive.google.com/file/d/1VGBJGA4pjOxvZnsJP6zZW9-0lJ-yAsVy/view?usp=sharing")
      .addFields(
        { name: '👤 Name', value: 'Arlif Thongrakjan', inline: true },
        { name: '🎓 Education', value: 'Faculty of ICT, Mahidol University', inline: true },
        { name: '💻 Interests', value: 'Technology, Android Custom ROMs, TikTok Creator' },
        { name: '🗓️ Birth-Date', value: '24-March-2006', inline: true},
        { name: '🔵 Color', value: 'Blue', inline: true },
        { name: '🌐 Contacts', value: 'IG: arlifzs2006 Tel: 0826313749' },
      )
      .setFooter({ text: `Requested by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
