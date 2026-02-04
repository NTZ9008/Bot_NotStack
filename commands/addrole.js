const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType
} = require("discord.js");

const specialRoles = {
  "บัตร vip": "notstackvip",
};

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
    .setDescription("เลือก role ที่จะเพิ่มหรือลบ"),

  async execute(interaction) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("role-select")
      .setPlaceholder("เลือก role ที่ต้องการ...")
      .addOptions([
        { label: "DST04", value: "DST04" },
        { label: "DST05", value: "DST05" },
        { label: "คนหน้าตาดีประจำซีซั่น", value: "คนหน้าตาดีประจำซีซั่น" },
        { label: "บัตร vip", value: "บัตร vip" },
      ]);

    await interaction.reply({
      content: "เลือก role ที่ต้องการเพิ่ม/ลบ:",
      components: [new ActionRowBuilder().addComponents(menu)],
      flags: 64
    });
  },

  async componentHandler(interaction) {
    if (interaction.isStringSelectMenu() && interaction.customId === "role-select") {
      const roleName = interaction.values[0];
      const role = interaction.guild.roles.cache.find(r => r.name === roleName);

      if (!role) {
        return interaction.reply({ content: `❌ ไม่พบ role ชื่อ **${roleName}**`, flags: 64 });
      }

      if (specialRoles[roleName]) {
        const modal = new ModalBuilder()
          .setCustomId(`role-password-${roleName}`)
          .setTitle(`🔒 ยืนยัน role: ${roleName}`);

        const passwordInput = new TextInputBuilder()
          .setCustomId("password")
          .setLabel("กรุณาใส่ password")
          .setStyle(TextInputStyle.Short);

        modal.addComponents(new ActionRowBuilder().addComponents(passwordInput));
        return interaction.showModal(modal);
      }

      if (interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role);
        return interaction.reply({ content: `🗑️ เอา role **${roleName}** ออกแล้ว`, flags: 64 });
      } else {
        await interaction.member.roles.add(role);
        return interaction.reply({ content: `✅ เพิ่ม role **${roleName}** ให้แล้ว`, flags: 64 });
      }
    }

    if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith("role-password-")) {
      const roleName = interaction.customId.replace("role-password-", "");
      const password = interaction.fields.getTextInputValue("password");
      const role = interaction.guild.roles.cache.find(r => r.name === roleName);

      if (!role) {
        return interaction.reply({ content: "❌ role นี้ไม่มีอยู่", flags: 64 });
      }

      if (specialRoles[roleName] !== password) {
        logSpecialRole(interaction, roleName, "FAIL");
        return interaction.reply({ content: "🔑 password ไม่ถูกต้อง!", flags: 64 });
      }

      logSpecialRole(interaction, roleName, "SUCCESS");

      if (interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role);
        return interaction.reply({ content: `🗑️ เอา role **${roleName}** ออกแล้ว`, flags: 64 });
      } else {
        await interaction.member.roles.add(role);
        return interaction.reply({ content: `✅ เพิ่ม role **${roleName}** ให้แล้ว`, flags: 64 });
      }
    }
  }
};
