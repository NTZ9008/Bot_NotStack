// ==========================================
// ⌨️ ลงทะเบียนคำสั่ง / กับ Discord
//   pnpm discord:deploy-commands   (ต้อง build backend ก่อน)
// - คำสั่งทั่วไป → global command (ใช้ได้ทุกเซิร์ฟเวอร์ที่เชิญบอท — Discord อาจใช้เวลาสักพักกว่าจะขึ้นครบ)
// - คำสั่งเฉพาะ NotStack (/verify /addroles /setuproles /admininfo) → guild command ของเซิร์ฟเวอร์หลักเท่านั้น
//   (แทนที่ guild command เดิมทั้งหมดของเซิร์ฟเวอร์หลัก → คำสั่งทั่วไปจะไม่ขึ้นซ้ำ 2 อัน)
// อ่าน TOKEN / DISCORD_CLIENT_ID / DISCORD_GUILD_ID จาก .env — ไม่ต้องต่อฐานข้อมูล
// ==========================================
import 'reflect-metadata';
import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { COMMANDS } from '../commands/commands.constants';
import { DEFAULT_CLIENT_ID, DEFAULT_GUILD_ID } from '../config/env.validation';
import { ENV_FILES } from '../config/paths';

dotenv.config({ path: ENV_FILES, quiet: true });

async function main(): Promise<void> {
    const token = process.env.TOKEN;
    if (!token) throw new Error('❌ ไม่พบ TOKEN ใน .env');
    const clientId = process.env.DISCORD_CLIENT_ID || DEFAULT_CLIENT_ID;
    const guildId = process.env.DISCORD_GUILD_ID || DEFAULT_GUILD_ID;
    const rest = new REST({ version: '10' }).setToken(token);

    const global = COMMANDS.filter((command) => !('homeGuildOnly' in command && command.homeGuildOnly)).map((command) => command.data.toJSON());
    const home = COMMANDS.filter((command) => 'homeGuildOnly' in command && command.homeGuildOnly).map((command) => command.data.toJSON());

    console.log(`⏳ กำลังลงทะเบียนคำสั่งทั่วไป ${global.length} คำสั่ง (ทุกเซิร์ฟเวอร์)...`);
    await rest.put(Routes.applicationCommands(clientId), { body: global });
    console.log(`⏳ กำลังลงทะเบียนคำสั่งเฉพาะเซิร์ฟเวอร์หลัก ${home.length} คำสั่ง (${guildId})...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: home });
    console.log('✅ ลงทะเบียนคำสั่งเสร็จแล้ว!');
}

main().catch((err: Error) => {
    console.error(err.message);
    process.exitCode = 1;
});
