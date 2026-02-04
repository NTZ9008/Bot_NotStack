const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("random")
    .setDescription("สุ่มจากวงล้อแบบข้อความ (ไม่แสดงชื่อคนโหวต)")
    .addStringOption(option =>
      option
        .setName("items")
        .setDescription("พิมพ์สิ่งที่ต้องการสุ่ม คั่นด้วยจุลภาค เช่น A,B,C")
        .setRequired(true)
    ),

  async execute(interaction) {
    const itemsInput = interaction.options.getString("items");
    const items = itemsInput.split(",").map(i => i.trim()).filter(Boolean);

    if (items.length < 2) {
      return interaction.reply({
        content: "⚠️ ต้องมีอย่างน้อย 2 ตัวเลือก เช่น `/random items: A,B,C`",
        ephemeral: true,
      });
    }

    await interaction.reply("🎡 กำลังหมุนวงล้อ...");

    await new Promise(res => setTimeout(res, 2500));

    const winner = items[Math.floor(Math.random() * items.length)];

    await interaction.editReply(`🎯 ผลลัพธ์คือ... **${winner}!** 🎉`);
  },
};
