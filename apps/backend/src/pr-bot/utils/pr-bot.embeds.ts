import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    escapeMarkdown,
    type APIEmbed,
    type APIEmbedField,
    type MessageCreateOptions,
} from 'discord.js';
import { truncateMarkdown } from './github-markdown';
import { reviewDecision, reviewersBy, type CheckState, type PrActivity, type PrSnapshot, type ReviewState } from './pr-activity';

type PrMessage = Pick<MessageCreateOptions, 'embeds' | 'components'>;

const FIELD_LIMIT = 1024; // ความยาวสูงสุดของ value ใน embed field ของ Discord
const DESCRIPTION_LIMIT = 4096;
const MESSAGE_EMBED_LIMIT = 6000; // ตัวอักษรรวมทุก embed ในข้อความเดียว
const MAX_CHECK_LINES = 15;
const BAR_WIDTH = 10;

const CHECK_ICON: Record<CheckState, string> = { passed: '✅', failed: '❌', running: '🟡', queued: '⏳', skipped: '⚪' };
const CHECK_ORDER: CheckState[] = ['failed', 'running', 'queued', 'passed', 'skipped'];
const BAR_ORDER: CheckState[] = ['passed', 'skipped', 'running', 'queued', 'failed'];
const BAR_BLOCK: Record<CheckState, string> = { passed: '🟩', skipped: '⬜', running: '🟨', queued: '🟨', failed: '🟥' };
const REVIEW_ICON: Record<Exclude<ReviewState, 'dismissed'>, string> = { approved: '✅', changes_requested: '🔴', commented: '💬' };

const names = (list: string[]): string => list.map((name) => `**${escapeMarkdown(name)}**`).join(', ');
const code = (text: string): string => `\`${text.replace(/`/g, "'")}\``;
const relativeTime = (iso: string): string => {
    const seconds = Math.floor(Date.parse(iso) / 1000);
    return seconds > 0 ? ` · <t:${seconds}:R>` : '';
};

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

// หนึ่งบรรทัดต่อคน: ผล review ล่าสุด หรือ ⏳ ถ้ายังรอคนนั้นอยู่
function reviewField(activity: PrActivity): APIEmbedField {
    const people = new Map<string, string>();
    for (const state of ['approved', 'changes_requested', 'commented'] as const) {
        for (const login of reviewersBy(activity, state)) people.set(login, REVIEW_ICON[state]);
    }
    for (const login of activity.requested) {
        if (!people.has(login) || people.get(login) === REVIEW_ICON.commented) people.set(login, '⏳');
    }
    if (!people.size) return { name: '👀 Reviews', value: 'No reviewers yet', inline: true };
    const approved = reviewersBy(activity, 'approved').length;
    const lines = [...people].map(([login, icon]) => `${icon} ${escapeMarkdown(login)}`);
    return { name: `👀 Reviews · ${approved}/${people.size} approved`, value: fitLines(lines), inline: true };
}

// แถบสีตามสัดส่วน (เขียว = ผ่าน, แดง = ไม่ผ่าน, เหลือง = กำลังรัน) — ไม่เกิน 10 ช่อง
function progressBar(states: CheckState[]): string {
    const sorted = [...states].sort((a, b) => BAR_ORDER.indexOf(a) - BAR_ORDER.indexOf(b));
    const width = Math.min(sorted.length, BAR_WIDTH);
    return Array.from({ length: width }, (_, i) => BAR_BLOCK[sorted[Math.floor(((i + 0.5) * sorted.length) / width)]!]).join('');
}

// แสดงแค่ว่าแต่ละ check ผ่าน/ไม่ผ่าน ไม่ลงรายละเอียด — ชื่อ field บอกจำนวนที่ผ่าน เช่น 5/10
function checksField(activity: PrActivity): APIEmbedField | null {
    const checks = Object.values(activity.checks).sort((a, b) => CHECK_ORDER.indexOf(a.state) - CHECK_ORDER.indexOf(b.state) || a.name.localeCompare(b.name));
    if (!checks.length) return null;
    const passed = checks.filter((check) => check.state === 'passed').length;
    const lines = checks.slice(0, MAX_CHECK_LINES).map((check) => `${CHECK_ICON[check.state]} ${escapeMarkdown(check.name)}`);
    if (checks.length > MAX_CHECK_LINES) lines.push(`…and ${checks.length - MAX_CHECK_LINES} more`);
    return {
        name: `🧪 Checks · ${passed}/${checks.length} passed`,
        // เว้นบรรทัดระหว่างแถบสีกับรายชื่อ ให้อ่านแยกกันง่าย
        value: fitLines([progressBar(checks.map((check) => check.state)), '', ...lines]),
        inline: true,
    };
}

const embedLength = (embed: APIEmbed): number =>
    (embed.title?.length ?? 0) +
    (embed.description?.length ?? 0) +
    (embed.author?.name.length ?? 0) +
    (embed.footer?.text.length ?? 0) +
    (embed.fields ?? []).reduce((sum, field) => sum + field.name.length + field.value.length, 0);

// comment อยู่ใน embed แยกด้านล่าง เพื่อให้ markdown จาก GitHub (code block, list, quote) มีที่แสดงเต็มความกว้าง
function commentsEmbed(pr: PrSnapshot, activity: PrActivity, color: number, budget: number): APIEmbed | null {
    const total = activity.commentIds.length;
    if (!total) return null;
    // เรียงเก่า → ใหม่ อ่านเหมือนบทสนทนา
    const cards = [...activity.comments].reverse().map((comment) => {
        const header = `**[${escapeMarkdown(comment.author)}](${comment.url})**${relativeTime(comment.at)}`;
        return `${header}\n${comment.body || '*(no text)*'}`;
    });
    const more = total > cards.length ? `\n\n[View all ${total} comments on GitHub](${pr.url})` : '';
    const limit = Math.min(DESCRIPTION_LIMIT, budget) - more.length;
    // ไม่พอที่ → ตัด comment เก่าสุดทิ้งก่อน แล้วค่อยตัดความยาวของอันที่เหลือ
    while (cards.length > 1 && cards.join('\n\n').length > limit) cards.shift();
    const description = truncateMarkdown(cards.join('\n\n'), limit) + more;
    return { title: `💬 Comments (${total})`, description, color };
}

const STATUS_LINE = { open: '🚀 New pull request', merged: '🟣 Merged', closed: '🔴 Closed' } as const;
const FOOTER = { open: 'Last updated', merged: 'Merged', closed: 'Closed' } as const;
const CLOSED_COLOR = { merged: 0x8957e5, closed: 0xed4245 } as const;
// สีของ PR ที่ยังเปิดอยู่บอกผล review: เขียว = approve แล้ว, ส้ม = ถูกขอแก้, เหลือง = รอ review
const DECISION_COLOR = { approved: 0x57f287, changes_requested: 0xe67e22, pending: 0xfee75c } as const;
const DRAFT_COLOR = 0x99aab5;

// embed เดียวใช้ทุกสถานะ — แก้ข้อความเดิมทุกครั้งที่มี review / check / comment / merge / close
export function prPayload(pr: PrSnapshot, activity: PrActivity, now = new Date()): PrMessage {
    const open = pr.state === 'open';
    const color = pr.state === 'open' ? (pr.draft ? DRAFT_COLOR : DECISION_COLOR[reviewDecision(activity)]) : CLOSED_COLOR[pr.state];
    const status = open && pr.draft ? '📝 Draft pull request' : STATUS_LINE[pr.state];
    const branch = pr.baseBranch ? `${code(pr.branch)} → ${code(pr.baseBranch)}` : code(pr.branch);
    const fields = [reviewField(activity), checksField(activity)].filter((field): field is APIEmbedField => field !== null);

    // PR ที่ยังเปิดอยู่ แสดงเวลาที่อัปเดตล่าสุด / ปิดแล้ว แสดงเวลาที่ปิด
    const time = open ? now : pr.closedAt ? new Date(pr.closedAt) : now;
    const main = new EmbedBuilder()
        .setAuthor({ name: pr.author, ...(pr.avatarUrl ? { iconURL: pr.avatarUrl } : {}), url: `https://github.com/${encodeURIComponent(pr.author)}` })
        .setTitle(truncateMarkdown(`#${pr.number} ${pr.title}`, 256))
        .setURL(pr.url)
        .setDescription(`${status} · **${escapeMarkdown(pr.repoFullName)}**\n${branch}\n\n${reviewHeadline(activity)}`)
        .setColor(color)
        .addFields(fields)
        .setFooter({ text: FOOTER[pr.state] })
        .setTimestamp(time)
        // รูปโปรไฟล์ใหญ่มุมขวาบน (ไอคอนข้างชื่อด้านบนเล็กเกินไป)
        .setThumbnail(pr.avatarUrl)
        .toJSON();
    const comments = commentsEmbed(pr, activity, color, MESSAGE_EMBED_LIMIT - embedLength(main) - 100);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel(open ? '🔍 Open PR' : '🔍 View PR')
            .setStyle(ButtonStyle.Link)
            .setURL(pr.url),
    );
    if (open) row.addComponents(new ButtonBuilder().setLabel('📄 Latest Commit').setStyle(ButtonStyle.Link).setURL(`${pr.repoUrl}/commit/${pr.headSha}`));

    return { embeds: comments ? [main, comments] : [main], components: [row.toJSON()] };
}
