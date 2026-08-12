const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const os = require('os'); // เรียกใช้ module os เพื่อดึงค่าระบบ

const BOT_VERSION = "3.1.0";

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('แสดงข้อมูลของบอทและสถานะเซิร์ฟเวอร์'),

  async execute(interaction) {
    const { client } = interaction;

    // --- 1. คำนวณข้อมูล Discord ---
    const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    const totalGuilds = client.guilds.cache.size;

    // --- 2. คำนวณ Uptime ---
    const uptime = process.uptime();
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);
    const uptimeSeconds = Math.floor(uptime % 60);

    // --- 3. คำนวณ System Info (ส่วนที่เพิ่มใหม่) ---
    // คำนวณ RAM (แปลงจาก Byte เป็น MB)
    const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0); // แรมทั้งหมด
    const freeMem = (os.freemem() / 1024 / 1024).toFixed(0);   // แรมที่ว่าง
    const usedMem = (totalMem - freeMem).toFixed(0);           // แรมที่ใช้ไป
    const memPercentage = Math.floor((usedMem / totalMem) * 100); // เปอร์เซ็นต์การใช้แรม

    // ดึงข้อมูล CPU
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown CPU'; // ชื่อรุ่น CPU
    const cpuCores = cpus.length; // จำนวน Core

    // ดึงข้อมูล OS
    const platform = os.type(); // เช่น Linux, Windows_NT
    const arch = os.arch();     // เช่น x64, arm64

    // --- 4. สร้าง Embed ---
    const embed = new EmbedBuilder()
      .setTitle('🤖 ข้อมูลและสถานะของบอท')
      .setColor(0x00AE86)
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        // แถวที่ 1: ข้อมูลทั่วไป
        { name: '🏷️ BotName', value: client.user.tag, inline: true },
        { name: '🛠️ Version', value: BOT_VERSION, inline: true },
        { name: '⏱️ Startup', value: `${uptimeHours} ชม. ${uptimeMinutes} น. ${uptimeSeconds} วินาที`, inline: true },
        
        // แถวที่ 2: สถิติ Discord
        { name: '🏘️ เซิร์ฟเวอร์', value: `${totalGuilds} Guilds`, inline: true },
        { name: '👥 ผู้ใช้งาน', value: `${totalUsers} Users`, inline: true },
        { name: '🟢 ปิง (Ping)', value: `${client.ws.ping} ms`, inline: true },

        // แถวที่ 3: ข้อมูลเครื่อง Server (สไตล์ Neofetch)
        { 
            name: '🖥️ Server Specs (Arlifzs\'s Server)', 
            value: `\`\`\`yml
OS:    ${platform} (${arch})
CPU:   ${cpuModel}
Cores: ${cpuCores} Core(s)
RAM:   ${usedMem}MB / ${totalMem}MB (${memPercentage}%)
Node:  ${process.version}
\`\`\``, 
            inline: false 
        }
      )
      .setFooter({ text: 'พัฒนาด้วย AT Tech | รันบน Oracle Cloud Always Free' });

    await interaction.reply({ embeds: [embed], ephemeral: false });
  }
};