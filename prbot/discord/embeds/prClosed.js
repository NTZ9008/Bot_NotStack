const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// pr.merged === true → Merged (ม่วง), false → Closed (แดง)
function prClosedPayload(pr, repo) {
    const merged = Boolean(pr.merged);

    const embed = new EmbedBuilder()
        .setTitle(merged ? '🟣 Pull Request Merged' : '🔴 Pull Request Closed')
        .setURL(pr.html_url)
        .setDescription(`**${pr.title}**`)
        .setColor(merged ? 0x8957E5 : 0xED4245)
        .addFields(
            { name: '👤 Author', value: pr.user?.login ?? 'unknown', inline: true },
            { name: '🌿 Branch', value: pr.head?.ref ?? 'unknown', inline: true },
            { name: '📂 Repository', value: repo.full_name, inline: true },
        )
        .setTimestamp(pr.closed_at ? new Date(pr.closed_at) : new Date());

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('🔍 View PR')
            .setStyle(ButtonStyle.Link)
            .setURL(pr.html_url),
    );

    return { embeds: [embed.toJSON()], components: [row.toJSON()] };
}

module.exports = prClosedPayload;
