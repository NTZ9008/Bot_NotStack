const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setuproles")
    .setDescription("ตั้งค่าข้อความรับยศทั่วไป"),
    
  async execute(interaction) {
    // ⏳ ป้องกัน Timeout: ให้บอทตอบกลับแบบกำลังโหลดไปก่อน
    await interaction.reply({ content: "⏳ กำลังสร้างข้อความรับยศและใส่ Reaction... กรุณารอสักครู่", ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle("🎭 ระบบเลือกรับยศทั่วไป (Reaction Roles)")
      .setDescription("โปรดกด Reaction ที่ด้านล่างเพื่อรับ หรือ เอาออก ยศที่คุณต้องการ:\n\n" +
                      "4️⃣ **DST04** - รุ่นที่ 4\n" +
                      "5️⃣ **DST05** - รุ่นที่ 5\n" +
                      "6️⃣ **DST06** - รุ่นที่ 6\n" +
                      "✨ **คนหน้าตาดีประจำซีซั่น** - ยศคนหน้าตาดี (รับได้ทุกคน)")
      .setColor("#2b2d31")
      .setFooter({ text: "สำหรับยศพิเศษ (บัตร VIP) กรุณาใช้คำสั่ง /addroles แทนครับ" });

    // ส่งข้อความไปที่แชแนลที่พิมพ์คำสั่ง
    const message = await interaction.channel.send({
      embeds: [embed]
    });

    // บอทกด Reaction ไว้เป็นปุ่มให้คนมากดตาม
    await message.react("4️⃣");
    await message.react("5️⃣");
    await message.react("6️⃣");
    await message.react("✨");

    // แก้ไขข้อความตอบกลับเดิมเมื่อทำเสร็จ
    await interaction.editReply({ content: "✅ สร้างข้อความสำหรับรับยศทั่วไปสำเร็จแล้วครับ! (ใช้ Reaction)" });
  }
};
