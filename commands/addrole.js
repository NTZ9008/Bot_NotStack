const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType
} = require("discord.js");

const specialRoles = {
  "บัตร vip": "notstackvip",
};

// --- ระบบบันทึก Log สำหรับ VIP ---
const logDir = path.join(__dirname, "logs", "special");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function logSpecialRole(interaction, roleName, status) {
  const now = new Date();
  const dateFile = now.toISOString().split("T")[0];
  const logFile = path.join(logDir, `${dateFile}_specialrole.txt`);

  const logLine =
    `[${now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}] ` +
    `User:${interaction.user.tag} (${interaction.user.id}) ` +
    `Role:${roleName} Status:${status}\n`;

  fs.appendFile(logFile, logLine, (err) => {
    if (err) console.error("Error writing special log:", err);
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("addroles")
    .setDescription("เลือกรุ่นหรือยศพิเศษที่ต้องการ (เพิ่ม/ลบ)"),

  // 1. ทำงานเมื่อพิมพ์คำสั่ง /addroles
  async execute(interaction) {
    // สร้างเมนู Dropdown สวยๆ พร้อม Emoji และคำอธิบาย
    const menu = new StringSelectMenuBuilder()
      .setCustomId("role-select")
      .setPlaceholder("🔍 คลิกลูกศรเพื่อเลือกยศที่ต้องการ...")
      .addOptions([
        new StringSelectMenuOptionBuilder()
          .setLabel("DST04")
          .setValue("DST04")
          .setDescription("รับหรือลบยศ รุ่นที่ 4")
          .setEmoji("🎓"),
        new StringSelectMenuOptionBuilder()
          .setLabel("DST05")
          .setValue("DST05")
          .setDescription("รับหรือลบยศ รุ่นที่ 5")
          .setEmoji("🎓"),
        new StringSelectMenuOptionBuilder()
          .setLabel("คนหน้าตาดีประจำซีซั่น")
          .setValue("คนหน้าตาดีประจำซีซั่น")
          .setDescription("ยศคนหน้าตาดี (รับได้ทุกคน)")
          .setEmoji("✨"),
        new StringSelectMenuOptionBuilder()
          .setLabel("บัตร vip")
          .setValue("บัตร vip")
          .setDescription("ยศพิเศษ (จำเป็นต้องมีรหัสผ่าน)")
          .setEmoji("💎"),
      ]);

    await interaction.reply({
      content: "🎭 **ระบบจัดการยศ (Role Manager)**\nโปรดเลือกยศที่คุณต้องการ **เพิ่ม** หรือ **เอาออก** จากเมนูด้านล่างนี้ครับ:",
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true // ให้เห็นเฉพาะคนกด (เหมือน flags: 64)
    });
  },

  // 2. ทำงานเมื่อโต้ตอบกับปุ่มหรือ Pop-up
  async componentHandler(interaction) {
    
    // --- ด่านที่ 1: เมื่อผู้ใช้กดเลือกเมนู ---
    if (interaction.isStringSelectMenu() && interaction.customId === "role-select") {
      const roleName = interaction.values[0];
      const role = interaction.guild.roles.cache.find(r => r.name === roleName);

      if (!role) {
        return interaction.reply({ content: `❌ ระบบขัดข้อง: ไม่พบยศชื่อ **${roleName}** ในเซิร์ฟเวอร์`, ephemeral: true });
      }

      // ตรวจสอบว่าเป็นยศที่ต้องใช้รหัสผ่านไหม (VIP)
      if (specialRoles[roleName]) {
        // สร้าง Pop-up ให้กรอกรหัส
        const modal = new ModalBuilder()
          .setCustomId(`role-password-${roleName}`)
          .setTitle(`🔒 ยืนยันรหัสผ่านสำหรับยศ ${roleName}`);

        const passwordInput = new TextInputBuilder()
          .setCustomId("password")
          .setLabel("🔑 กรุณาใส่รหัสผ่านเพื่อรับยศนี้")
          .setPlaceholder("พิมพ์รหัสผ่านที่นี่...")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(passwordInput));
        return interaction.showModal(modal); // เด้ง Pop-up
      }

      // ถ้ายศปกติ (ไม่ต้องใช้รหัส) ให้สลับยศ (Toggle) ทันที
      if (interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role);
        return interaction.reply({ content: `🗑️ ระบบได้ **ดึงยศ** **${roleName}** ออกจากคุณแล้วครับ`, ephemeral: true });
      } else {
        await interaction.member.roles.add(role);
        return interaction.reply({ content: `✅ **สำเร็จ!** คุณได้รับยศ **${roleName}** เรียบร้อยแล้ว`, ephemeral: true });
      }
    }

    // --- ด่านที่ 2: เมื่อผู้ใช้กรอกรหัสผ่านใน Pop-up ---
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith("role-password-")) {
      const roleName = interaction.customId.replace("role-password-", "");
      const password = interaction.fields.getTextInputValue("password");
      const role = interaction.guild.roles.cache.find(r => r.name === roleName);

      if (!role) {
        return interaction.reply({ content: `❌ ระบบขัดข้อง: ไม่พบยศชื่อ **${roleName}** ในเซิร์ฟเวอร์`, ephemeral: true });
      }

      // ตรวจสอบรหัสผ่าน
      if (specialRoles[roleName] !== password) {
        logSpecialRole(interaction, roleName, "FAIL"); // บันทึก Log คนใส่ผิด
        return interaction.reply({ content: "❌ **รหัสผ่านไม่ถูกต้อง!** ไม่สามารถรับยศ VIP ได้", ephemeral: true });
      }

      logSpecialRole(interaction, roleName, "SUCCESS"); // บันทึก Log คนใส่ถูก

      // สลับยศ VIP (Toggle)
      if (interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role);
        return interaction.reply({ content: `🗑️ ระบบได้ **ดึงยศ** **${roleName}** ออกจากคุณแล้วครับ`, ephemeral: true });
      } else {
        await interaction.member.roles.add(role);
        return interaction.reply({ content: `🎉 **สำเร็จ!** รหัสผ่านถูกต้อง คุณได้รับยศ **${roleName}** เรียบร้อยแล้ว`, ephemeral: true });
      }
    }
  }
};