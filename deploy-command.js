const { REST, Routes } = require('discord.js');
const { clientId, guildId } = require('./config.json'); // สร้างไฟล์ config.json แยก
const fs = require('fs');

const dotenv = require('dotenv'); // import doteenv
dotenv.config(); //โหลดค่าจาก.env
const token = process.env.TOKEN; // ดึง token จาก .env
if (!token) {
  console.error("❌ ไม่พบ TOKEN ใน .env");
  process.exit(1);
}

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('⏳ กำลังลงทะเบียน Slash Commands...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('✅ ลงทะเบียนคำสั่งเสร็จแล้ว!');
  } catch (error) {
    console.error(error);
  }
})();

