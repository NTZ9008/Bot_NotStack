import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type MessageCreateOptions } from 'discord.js';
import type { GithubPullRequest, GithubRepository } from '../interfaces/github.interface';

type PrMessage = Pick<MessageCreateOptions, 'embeds' | 'components'>;

// PR ถูกเปิด → embed สีเขียว + ปุ่ม Open PR / Latest Commit
export function prOpenedPayload(pr: GithubPullRequest, repo: GithubRepository): PrMessage {
    const embed = new EmbedBuilder()
        .setTitle('🚀 New Pull Request')
        .setURL(pr.html_url)
        .setDescription(`**${pr.title}**`)
        .setColor(0x57f287)
        .setThumbnail(pr.user?.avatar_url ?? null)
        .addFields(
            { name: '👤 Author', value: pr.user?.login ?? 'unknown', inline: true },
            { name: '🌿 Branch', value: pr.head?.ref ?? 'unknown', inline: true },
            { name: '📂 Repository', value: repo.full_name, inline: true },
        )
        .setTimestamp(pr.created_at ? new Date(pr.created_at) : new Date());

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('🔍 Open PR').setStyle(ButtonStyle.Link).setURL(pr.html_url),
        new ButtonBuilder().setLabel('📄 Latest Commit').setStyle(ButtonStyle.Link).setURL(`${repo.html_url}/commit/${pr.head?.sha ?? ''}`),
    );

    return { embeds: [embed.toJSON()], components: [row.toJSON()] };
}

// pr.merged === true → Merged (ม่วง), false → Closed (แดง)
export function prClosedPayload(pr: GithubPullRequest, repo: GithubRepository): PrMessage {
    const merged = Boolean(pr.merged);
    const embed = new EmbedBuilder()
        .setTitle(merged ? '🟣 Pull Request Merged' : '🔴 Pull Request Closed')
        .setURL(pr.html_url)
        .setDescription(`**${pr.title}**`)
        .setColor(merged ? 0x8957e5 : 0xed4245)
        .addFields(
            { name: '👤 Author', value: pr.user?.login ?? 'unknown', inline: true },
            { name: '🌿 Branch', value: pr.head?.ref ?? 'unknown', inline: true },
            { name: '📂 Repository', value: repo.full_name, inline: true },
        )
        .setTimestamp(pr.closed_at ? new Date(pr.closed_at) : new Date());

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('🔍 View PR').setStyle(ButtonStyle.Link).setURL(pr.html_url),
    );

    return { embeds: [embed.toJSON()], components: [row.toJSON()] };
}
