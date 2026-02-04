const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("ทดสอบการตอบสนองของบอท"),

  async execute(interaction) {

    await interaction.reply("Pinging...");
    const sent = await interaction.fetchReply();

    const roundTrip = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);

    await interaction.editReply(`⏱️ Round-trip: ${roundTrip} ms\n💓 API: ${apiLatency} ms`);
  },
};
