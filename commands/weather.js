const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

async function getWeatherEmbed(city, apiKey) {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=th`;
  
  try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.cod !== 200) return null;

      const weather = data.weather[0];
      const main = data.main;
      const wind = data.wind;

      const embed = new EmbedBuilder()
        .setColor("#00A2E8")
        .setTitle(`🌤️ อากาศที่ ${data.name}, ${data.sys.country}`)
        .setDescription(weather.description.replace(/^\w/, c => c.toUpperCase()))
        .addFields(
          { name: "🌡️ อุณหภูมิ", value: `${main.temp} °C`, inline: true },
          { name: "💨 ลม", value: `${wind.speed} m/s`, inline: true },
          { name: "💧 ความชื้น", value: `${main.humidity}%`, inline: true }
        )
        .setThumbnail(`https://openweathermap.org/img/wn/${weather.icon}@2x.png`)
        .setFooter({ text: "ข้อมูลจาก OpenWeatherMap" })
        .setTimestamp();

      return embed;
  } catch (error) {
      console.error("Weather Fetch Error:", error);
      return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("weather")
    .setDescription("ดูสภาพอากาศของเมืองที่ต้องการ")
    .addStringOption(option =>
      option.setName("city").setDescription("ชื่อเมือง").setRequired(true)
    ),
  async execute(interaction) {
    const apiKey = process.env.OPENWEATHER_KEY;
    const city = interaction.options.getString("city");
    await interaction.deferReply();

    const embed = await getWeatherEmbed(city, apiKey);
    if (!embed) return interaction.editReply(`❌ ไม่พบข้อมูลเมือง **${city}**`);
    await interaction.editReply({ embeds: [embed] });
  },
  getWeatherEmbed 
};