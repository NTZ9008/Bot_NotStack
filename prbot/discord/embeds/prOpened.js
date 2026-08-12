const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// pure function: รับข้อมูล PR + repo จาก GitHub webhook → คืน payload สำหรับ Discord REST API
function prOpenedPayload(pr, repo) {
    const embed = new EmbedBuilder()
        .setTitle('🚀 New Pull Request')
        .setURL(pr.html_url)
        .setDescription(`**${pr.title}**`)
        .setColor(0x57F287)
        .setThumbnail(pr.user?.avatar_url ?? null)
        .addFields(
            { name: '👤 Author', value: pr.user?.login ?? 'unknown', inline: true },
            { name: '🌿 Branch', value: pr.head?.ref ?? 'unknown', inline: true },
            { name: '📂 Repository', value: repo.full_name, inline: true },
        )
        .setTimestamp(pr.created_at ? new Date(pr.created_at) : new Date());

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('🔍 Open PR')
            .setStyle(ButtonStyle.Link)
            .setURL(pr.html_url),
        new ButtonBuilder()
            .setLabel('📄 Latest Commit')
            .setStyle(ButtonStyle.Link)
            .setURL(`${repo.html_url}/commit/${pr.head?.sha ?? ''}`),
    );

    return { embeds: [embed.toJSON()], components: [row.toJSON()] };
}

module.exports = prOpenedPayload;
