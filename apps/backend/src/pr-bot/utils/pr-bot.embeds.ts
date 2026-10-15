import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown, type APIEmbedField, type MessageCreateOptions } from 'discord.js';
import { reviewDecision, reviewersBy, type CheckState, type PrActivity, type PrSnapshot } from './pr-activity';

type PrMessage = Pick<MessageCreateOptions, 'embeds' | 'components'>;

const FIELD_LIMIT = 1024; // ความยาวสูงสุดของ value ใน embed field ของ Discord
const MAX_CHECK_LINES = 15;

const CHECK_ICON: Record<CheckState, string> = { passed: '✅', failed: '❌', running: '🟡', queued: '⏳', skipped: '⚪' };
const CHECK_ORDER: CheckState[] = ['failed', 'running', 'queued', 'passed', 'skipped'];
const CHECK_LABEL: Record<CheckState, string> = { failed: 'failed', running: 'running', queued: 'queued', passed: 'passed', skipped: 'skipped' };

const names = (list: string[]): string => list.map((name) => escapeMarkdown(name)).join(', ');

// ตัดบรรทัดท้ายออกจนพอดี 1024 ตัวอักษร แล้วบอกว่าเหลืออีกกี่บรรทัด
function fitLines(lines: string[], limit = FIELD_LIMIT): string {
    const out: string[] = [];
    for (const [index, line] of lines.entries()) {
        const rest = lines.length - index;
        const candidate = [...out, line].join('\n');
        const reserve = rest > 1 ? `\n…and ${rest - 1} more`.length : 0;
        if (candidate.length + reserve > limit) {
            out.push(`…and ${rest} more`);
            break;
        }
        out.push(line);
    }
    return out.join('\n');
}

// บรรทัดหลักใต้ชื่อ PR — ตอบคำถาม "มีคน approve หรือยัง" ได้ทันที
function reviewHeadline(activity: PrActivity): string {
    const decision = reviewDecision(activity);
    if (decision === 'changes_requested') return `🔴 **Changes requested** by ${names(reviewersBy(activity, 'changes_requested'))}`;
    if (decision === 'approved') return `✅ **Approved** by ${names(reviewersBy(activity, 'approved'))}`;
    return activity.requested.length ? `⏳ **Waiting for review** from ${names(activity.requested)}` : '⏳ **Waiting for review**';
}

function reviewField(activity: PrActivity): APIEmbedField {
    const lines = [
        ['✅ Approved', reviewersBy(activity, 'approved')],
        ['🔴 Changes requested', reviewersBy(activity, 'changes_requested')],
        ['💬 Commented', reviewersBy(activity, 'commented')],
        ['⏳ Waiting', activity.requested],
    ].flatMap(([label, list]) => (list.length ? [`${label as string}: ${names(list as string[])}`] : []));
    return { name: '👀 Reviews', value: fitLines(lines.length ? lines : ['No reviews yet']) };
}

// แสดงแค่ว่าแต่ละ check ผ่าน/ไม่ผ่าน ไม่ลงรายละเอียด
function checksField(activity: PrActivity): APIEmbedField | null {
    const checks = Object.values(activity.checks).sort((a, b) => CHECK_ORDER.indexOf(a.state) - CHECK_ORDER.indexOf(b.state) || a.name.localeCompare(b.name));
    if (!checks.length) return null;
    const summary = CHECK_ORDER.flatMap((state) => {
        const count = checks.filter((check) => check.state === state).length;
        return count ? [`${CHECK_ICON[state]} ${count} ${CHECK_LABEL[state]}`] : [];
    }).join(' · ');
    const lines = checks.slice(0, MAX_CHECK_LINES).map((check) => `${CHECK_ICON[check.state]} ${escapeMarkdown(check.name)}`);
    if (checks.length > MAX_CHECK_LINES) lines.push(`…and ${checks.length - MAX_CHECK_LINES} more`);
    return { name: '🧪 Checks', value: fitLines([summary, ...lines]) };
}

function commentsField(activity: PrActivity): APIEmbedField | null {
    const total = activity.commentIds.length;
    if (!total) return null;
    const lines = activity.comments.map((comment) => {
        const body = comment.body ? escapeMarkdown(comment.body) : '_(no text)_';
        return `[**${escapeMarkdown(comment.author)}**](${comment.url}): ${body}`;
    });
    return { name: `💬 Comments (${total})`, value: fitLines(lines.length ? lines : ['—']) };
}

const TITLE = { open: '🚀 New Pull Request', merged: '🟣 Pull Request Merged', closed: '🔴 Pull Request Closed' } as const;
const CLOSED_COLOR = { merged: 0x8957e5, closed: 0xed4245 } as const;
// สีของ PR ที่ยังเปิดอยู่บอกผล review: เขียว = approve แล้ว, ส้ม = ถูกขอแก้, เหลือง = รอ review
const DECISION_COLOR = { approved: 0x57f287, changes_requested: 0xe67e22, pending: 0xfee75c } as const;
const DRAFT_COLOR = 0x99aab5;

// embed เดียวใช้ทุกสถานะ — แก้ข้อความเดิมทุกครั้งที่มี review / check / comment / merge / close
export function prPayload(pr: PrSnapshot, activity: PrActivity): PrMessage {
    const open = pr.state === 'open';
    const color = pr.state === 'open' ? (pr.draft ? DRAFT_COLOR : DECISION_COLOR[reviewDecision(activity)]) : CLOSED_COLOR[pr.state];
    const headline = open && pr.draft ? `📝 **Draft**\n${reviewHeadline(activity)}` : reviewHeadline(activity);
    const fields = [
        { name: '👤 Author', value: escapeMarkdown(pr.author), inline: true },
        { name: '🌿 Branch', value: escapeMarkdown(pr.branch), inline: true },
        { name: '📂 Repository', value: pr.repoFullName, inline: true },
        reviewField(activity),
        checksField(activity),
        commentsField(activity),
    ].filter((field): field is APIEmbedField => field !== null);

    const time = open ? pr.createdAt : pr.closedAt;
    const embed = new EmbedBuilder()
        .setTitle(TITLE[pr.state])
        .setURL(pr.url)
        .setDescription(`**${escapeMarkdown(pr.title)}**\n\n${headline}`)
        .setColor(color)
        .addFields(fields)
        .setTimestamp(time ? new Date(time) : new Date());
    if (open) embed.setThumbnail(pr.avatarUrl);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel(open ? '🔍 Open PR' : '🔍 View PR')
            .setStyle(ButtonStyle.Link)
            .setURL(pr.url),
    );
    if (open) row.addComponents(new ButtonBuilder().setLabel('📄 Latest Commit').setStyle(ButtonStyle.Link).setURL(`${pr.repoUrl}/commit/${pr.headSha}`));

    return { embeds: [embed.toJSON()], components: [row.toJSON()] };
}
