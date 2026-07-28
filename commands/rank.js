const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getAllLevels } = require('../db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('ดูข้อมูล Level และ Rank ของคุณหรือสมาชิกคนอื่น')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('สมาชิกที่คุณต้องการดู (เว้นว่างไว้เพื่อดูของตัวเอง)')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('leaderboard')
                .setDescription('ดูตารางจัดอันดับ (Top 10 ของเซิร์ฟเวอร์)')
                .setRequired(false)
        ),
    async execute(interaction) {
        const target = interaction.options.getUser('target') || interaction.user;
        
        // ถ้าเป็นบอทจะไม่มี Level
        if (target.bot) {
            return interaction.reply({ content: "🤖 บอทไม่มีเลเวลนะคร้าบ!", flags: 64 });
        }
        let levelsData = {};

        try {
            const rows = await getAllLevels();
            rows.forEach(r => {
                levelsData[r.userId] = { xp: r.xp, level: r.level };
            });
            
            const showLeaderboard = interaction.options.getBoolean('leaderboard');

                // ถ้าเลือกดู Leaderboard (ลำดับรวม)
                if (showLeaderboard) {
                    const sortedUsers = Object.keys(levelsData)
                        .sort((a, b) => levelsData[b].xp - levelsData[a].xp)
                        .slice(0, 10); // เอาแค่ Top 10

                    if (sortedUsers.length === 0) {
                        return interaction.reply({ content: "📉 ยังไม่มีใครมี XP ในเซิร์ฟเวอร์เลยครับ", flags: 64 });
                    }

                    const embed = new EmbedBuilder()
                        .setColor(0xFFD700) // สีทอง
                        .setTitle('🏆 Leaderboard (Top 10)')
                        .setDescription('ตารางจัดอันดับนักคุยประจำเซิร์ฟเวอร์!')
                        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                        .setTimestamp();

                    let leaderboardText = '';
                    for (let i = 0; i < sortedUsers.length; i++) {
                        const userId = sortedUsers[i];
                        const userStats = levelsData[userId];
                        // ใช้ <@id> เพื่อแท็กผู้ใช้ (หรือโชว์เป็นชื่อ) 
                        // แต่เพื่อไม่ให้แท็กรบกวน เราจะใช้ชื่อดึงจากแคช หรือแสดงแบบแท็กก็ได้ (Discord จะไม่ปิงถ้าอยู่ใน embed description ส่วนใหญ่)
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`#${i + 1}\``;
                        leaderboardText += `${medal} <@${userId}> — **Lvl ${userStats.level}** (${userStats.xp} XP)\n`;
                    }

                    embed.setDescription(leaderboardText);
                    embed.setFooter({ text: 'พิมพ์แชทหรือเข้าห้องเสียงบ่อยๆ เพื่อไต่อันดับนะ!' });

                    return interaction.reply({ embeds: [embed] });
                }
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: "❌ ไม่สามารถโหลดข้อมูล Level ได้ในขณะนี้", flags: 64 });
        }

        // ============================================
        // ถ้าดูรายบุคคล (เหมือนเดิม)
        // ============================================
        // ลบ const target ออกเพราะประกาศไปแล้วด้านบน

        const userData = levelsData[target.id];

        if (!userData) {
            return interaction.reply({ content: `🤷‍♂️ ${target.username} ยังไม่มีประวัติการแชทเลยครับ พิมพ์อะไรสักหน่อยเพื่อให้ได้ XP สิ!`, flags: 64 });
        }

        const currentXp = userData.xp;
        const currentLevel = userData.level;
        const nextLevelXp = 100 * Math.pow(currentLevel + 1, 2);

        // คำนวณ Rank (เรียงลำดับ XP ของทุกคน)
        const sortedUsers = Object.keys(levelsData).sort((a, b) => levelsData[b].xp - levelsData[a].xp);
        const rankIndex = sortedUsers.indexOf(target.id) + 1;

        // คำนวณเปอร์เซ็นต์หลอด XP แบบง่ายๆ
        // ฐานของเลเวลปัจจุบันคือ XP ที่ใช้ในการอัปเลเวลที่แล้ว (ยกเว้น เลเวล 0 คือ 0)
        const prevLevelXp = currentLevel === 0 ? 0 : 100 * Math.pow(currentLevel, 2);
        const xpNeededForNext = nextLevelXp - prevLevelXp;
        const xpProgress = currentXp - prevLevelXp;
        
        const percent = Math.max(0, Math.min(100, Math.floor((xpProgress / xpNeededForNext) * 100)));
        const progressBarLength = 15;
        const filledBarLength = Math.floor((percent / 100) * progressBarLength);
        const emptyBarLength = progressBarLength - filledBarLength;
        const progressBar = '🟩'.repeat(filledBarLength) + '⬛'.repeat(emptyBarLength);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL({ dynamic: true }) })
            .setTitle('🏆 สถิติ Level & XP')
            .addFields(
                { name: '🥇 ลำดับ (Rank)', value: `#${rankIndex}`, inline: true },
                { name: '📈 เลเวล (Level)', value: `${currentLevel}`, inline: true },
                { name: '✨ ประสบการณ์ (XP)', value: `${currentXp} XP`, inline: true },
                { name: `ความคืบหน้า (${percent}%)`, value: `${progressBar} [${currentXp}/${nextLevelXp}]` }
            )
            .setFooter({ text: 'พิมพ์แชทบ่อยๆ เพื่อให้ Level ขึ้นนะ!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
