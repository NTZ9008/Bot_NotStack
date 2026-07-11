const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
    .setDescription("เลือกรุ่นหรือยศพิเศษที่ต้องการ (ต้องใช้รหัสผ่าน)"),
    
  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("role-btn-บัตร vip")
        .setLabel("รับยศ บัตร vip")
        .setEmoji("💎")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      content: "🎭 **ระบบจัดการยศพิเศษ**\nโปรดกดปุ่มด้านล่างนี้ และกรอกรหัสผ่านเพื่อรับยศครับ:",
      components: [row],
      ephemeral: true // ให้เห็นเฉพาะคนกด
    });
  },

  async componentHandler(interaction) {
    // --- ด่านที่ 1: เมื่อผู้ใช้กดปุ่มเลือกยศ ---
    if (interaction.isButton() && interaction.customId.startsWith("role-btn-")) {
      const roleName = interaction.customId.replace("role-btn-", "");
      const role = interaction.guild.roles.cache.find(r => r.name === roleName);

      if (!role) {
        return interaction.reply({ content: `❌ ระบบขัดข้อง: ไม่พบยศชื่อ **${roleName}** ในเซิร์ฟเวอร์`, ephemeral: true });
      }

      if (specialRoles[roleName]) {
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
        return interaction.showModal(modal);
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

      if (specialRoles[roleName] !== password) {
        logSpecialRole(interaction, roleName, "FAIL");
        return interaction.reply({ content: "❌ **รหัสผ่านไม่ถูกต้อง!** ไม่สามารถรับยศ VIP ได้", ephemeral: true });
      }

      logSpecialRole(interaction, roleName, "SUCCESS");

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
