const fs = require("fs");
const path = require("path");

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {
    // ✅ จัดการ Slash command
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(err);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: "⚠️ มีปัญหาตอนรันคำสั่ง" });
        } else {
          await interaction.reply({ content: "⚠️ มีปัญหาตอนรันคำสั่ง", flags: 64 });
        }
      }
    }

    // ✅ จัดการ component (ปุ่ม / select menu / modal)
    if (interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
      // หาคำสั่งที่มี componentHandler
      const commandFiles = fs.readdirSync(path.join(__dirname, "../commands")).filter(file => file.endsWith(".js"));
      for (const file of commandFiles) {
        const command = require(`../commands/${file}`);
        if (typeof command.componentHandler === "function") {
          try {
            await command.componentHandler(interaction, client);
          } catch (err) {
            console.error(err);
            if (!interaction.replied) {
              await interaction.reply({ content: "⚠️ มีปัญหาตอนรัน interaction", flags: 64 });
            }
          }
        }
      }
    }
  }
};
