const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gethelp')
    .setDescription('commandList'),
  
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📌 Help Me!')
      .setDescription(`Bot Commands`)
      .addFields(
        { name: '/addrole', value: 'เลือก role ที่จะเพิ่มหรือลบ' },
        { name: '/admininfo', value: 'admininfo command' },
        { name: '/botinfo', value: '🤖 ข้อมูลของบอท' },
        { name: '/ping', value: 'ทดสอบการตอบสนองของบอท' },
        { name: '/userinfo', value: 'userinfo command' },
        { name: '/gethelp', value: 'List of Command' },
        { name: '/serverinfo', value: 'serverinfo command'},
      )
      .setFooter({ text: `Requested by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
