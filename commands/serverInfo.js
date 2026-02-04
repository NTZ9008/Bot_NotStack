const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('คำสั่งใช้เพื่อดูข้อมูลserver'),
  
  async execute(interaction) {
    const { name, memberCount, ownerId } = interaction.guild;
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('Server Info')
      .setDescription(`นี่คือข้อมูลของServer`)
      .setThumbnail("https://drive.google.com/file/d/1L8UPkN2FBAkcnC1-v5k9X4s9VOn6DUxK/view?usp=sharing")
      .addFields(
        { name: '🛜 Name', value: `${name}`, inline: true },
        { name: '🗓️ Created on', value: '16-08-2024', inline: true },
        { name: '💻 objective', value: 'Tutoring - Chatting - Playing Games - Asking Questions' },
        { name: '👤 creator', value: 'Arlif Thongrakjan', inline: true},
        { name: '👥 total number of members', value: `${memberCount}`, inline: true},
      )
      .setFooter({ text: `Requested by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
