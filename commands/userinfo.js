const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("แสดงข้อมูลของผู้ใช้")
    .addUserOption(option =>
      option
        .setName("target")
        .setDescription("เลือกผู้ใช้ (ถ้าไม่ใส่จะแสดงของตัวเอง)")
        .setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("target") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id);

    const embed = new EmbedBuilder()
      .setColor("#00b0f4")
      .setThumbnail(user.displayAvatarURL({ size: 1024 }))
      .setTitle(`ข้อมูลผู้ใช้: ${user.tag}`)
      .addFields(
        { name: "🆔 User ID", value: user.id, inline: true },
        { name: "📅 สร้างบัญชี", value: `<t:${Math.floor(user.createdTimestamp/1000)}:F>`, inline: true },
        { name: "📥 เข้าร่วมเซิร์ฟเวอร์", value: `<t:${Math.floor(member.joinedTimestamp/1000)}:F>`, inline: false },
        { name: "🎭 Roles", value: member.roles.cache
            .filter(r => r.id !== interaction.guild.id)
            .map(r => r.toString())
            .join(", ") || "ไม่มี", inline: false }
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
