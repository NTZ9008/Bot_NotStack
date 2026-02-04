const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("สร้างโพลแบบไม่แสดงชื่อผู้โหวต")
    .addStringOption(option =>
      option.setName("question").setDescription("คำถามสำหรับโพล").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("choices").setDescription("ตัวเลือกคั่นด้วยจุลภาค เช่น A,B,C").setRequired(true)
    ),

  async execute(interaction) {
    const question = interaction.options.getString("question");
    const choices = interaction.options
      .getString("choices")
      .split(",")
      .map(c => c.trim())
      .filter(Boolean);

    if (choices.length < 2 || choices.length > 5) {
      return interaction.reply({
        content: "❌ ต้องมีอย่างน้อย 2 ตัวเลือก และไม่เกิน 5 ตัวเลือก",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${question}`)
      .setDescription(choices.map((c, i) => `**${i + 1}.** ${c}`).join("\n"))
      .setColor(0x00bfff)
      .setFooter({ text: `สร้างโดย ${interaction.user.username}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      choices.map((c, i) =>
        new ButtonBuilder()
          .setCustomId(`poll_${i}`)
          .setLabel(`${i + 1}`)
          .setStyle(ButtonStyle.Primary)
      )
    );

    await interaction.reply({ embeds: [embed], components: [row] });

    // เก็บผลโหวตไว้ใน memory (แค่ชั่วคราว)
    const votes = Array(choices.length).fill(0);

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.customId.startsWith("poll_"),
      time: 60000, // 60 วินาที
    });

    collector.on("collect", async i => {
      const index = parseInt(i.customId.split("_")[1]);
      votes[index]++;
      await i.reply({ content: `✅ คุณโหวต "${choices[index]}" แล้ว`, ephemeral: true });
    });

    collector.on("end", async () => {
      const results = choices
        .map((c, i) => `**${c}** — ${votes[i]} โหวต`)
        .join("\n");
      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setTitle(`📊 ผลโหวต: ${question}`)
            .setDescription(results)
            .setColor(0x00ff7f),
        ],
      });
    });
  },
};
