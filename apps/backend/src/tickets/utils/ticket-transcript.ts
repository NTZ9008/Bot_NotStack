import { formatTicketNumber } from '@notstack/shared';

export interface TranscriptAttachmentLike {
    name?: string | null;
    url: string;
}

export interface TranscriptEmbedLike {
    title?: string | null;
    description?: string | null;
    url?: string | null;
}

export interface TranscriptMessageLike {
    id: string;
    createdTimestamp: number;
    content: string;
    author: {
        id: string;
        username: string;
        globalName?: string | null;
        bot?: boolean;
    };
    attachments: Iterable<TranscriptAttachmentLike> | Map<string, TranscriptAttachmentLike>;
    embeds: readonly TranscriptEmbedLike[];
}

export interface FetchableMessagesChannel<T extends TranscriptMessageLike = TranscriptMessageLike> {
    messages: {
        fetch(options: { limit: number; before?: string }): Promise<Map<string, T>>;
    };
}

export interface TranscriptMetadata {
    guildName: string;
    ticketNumber: number;
    openerId: string;
    openerName: string;
    claimedById: string | null;
    claimedByName: string | null;
    closedById: string;
    closedByName: string;
    subject: string | null;
    createdAt: Date;
    closedAt: Date;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function sanitizeHttpUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
        return null;
    }
}

function attachmentList(raw: TranscriptMessageLike['attachments']): TranscriptAttachmentLike[] {
    return raw instanceof Map ? [...raw.values()] : [...raw];
}

function formatBangkokTimestamp(input: Date | number): string {
    const date = input instanceof Date ? input : new Date(input);
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function compareMessagesChronological(a: Pick<TranscriptMessageLike, 'id' | 'createdTimestamp'>, b: Pick<TranscriptMessageLike, 'id' | 'createdTimestamp'>): number {
    if (a.createdTimestamp !== b.createdTimestamp) return a.createdTimestamp - b.createdTimestamp;
    try {
        const aId = BigInt(a.id);
        const bId = BigInt(b.id);
        return aId < bId ? -1 : aId > bId ? 1 : 0;
    } catch {
        return a.id.localeCompare(b.id);
    }
}

export async function fetchAllChannelMessages<T extends TranscriptMessageLike>(
    channel: FetchableMessagesChannel<T>,
    maxPages = 50,
): Promise<T[]> {
    const byId = new Map<string, T>();
    let before: string | undefined;

    for (let page = 0; page < maxPages; page++) {
        const batch = await channel.messages.fetch(before ? { limit: 100, before } : { limit: 100 });
        if (!batch || batch.size === 0) break;

        let oldest: T | null = null;
        for (const msg of batch.values()) {
            byId.set(msg.id, msg);
            if (!oldest || compareMessagesChronological(msg, oldest) < 0) {
                oldest = msg;
            }
        }

        if (batch.size < 100 || !oldest || oldest.id === before) break;
        before = oldest.id;
    }

    return [...byId.values()].sort(compareMessagesChronological);
}

export function buildTranscriptMarkdown(meta: TranscriptMetadata, messages: readonly TranscriptMessageLike[]): string {
    const num = formatTicketNumber(meta.ticketNumber);
    const lines: string[] = [
        `# Transcript — Ticket #${num}`,
        '',
        `- **เซิร์ฟเวอร์:** ${meta.guildName}`,
        `- **ผู้เปิด Ticket:** ${meta.openerName} (${meta.openerId})`,
        `- **ผู้รับเรื่อง (Claim):** ${meta.claimedById ? `${meta.claimedByName ?? meta.claimedById} (${meta.claimedById})` : '—'}`,
        `- **ผู้ปิด Ticket:** ${meta.closedByName} (${meta.closedById})`,
        ...(meta.subject ? [`- **หัวข้อ:** ${meta.subject}`] : []),
        `- **เวลาเปิด:** ${formatBangkokTimestamp(meta.createdAt)} (UTC+7)`,
        `- **เวลาปิด:** ${formatBangkokTimestamp(meta.closedAt)} (UTC+7)`,
        `- **จำนวนข้อความทั้งหมด:** ${messages.length}`,
        '',
        '---',
        '',
    ];

    if (messages.length === 0) {
        lines.push('_ไม่มีข้อความในห้อง Ticket นี้_');
        return lines.join('\n');
    }

    for (const msg of messages) {
        const displayName = msg.author.globalName || msg.author.username || msg.author.id;
        const botTag = msg.author.bot ? ' [BOT]' : '';
        lines.push(`### [${formatBangkokTimestamp(msg.createdTimestamp)}] ${displayName} (${msg.author.id})${botTag}`);

        if (msg.content.trim()) {
            lines.push(msg.content);
        }

        const attachments = attachmentList(msg.attachments);
        for (const att of attachments) {
            lines.push(`- 📎 [${att.name || 'attachment'}](${att.url})`);
        }

        for (const embed of msg.embeds) {
            const parts = [embed.title, embed.description].filter((part): part is string => Boolean(part && part.trim()));
            if (parts.length > 0) {
                lines.push(`> **[Embed]** ${parts.join(' — ').replace(/\r?\n/g, ' ')}`);
            }
        }

        if (!msg.content.trim() && attachments.length === 0 && msg.embeds.length === 0) {
            lines.push('_(ข้อความระบบ / ไม่มีเนื้อหา)_');
        }
        lines.push('');
    }

    return lines.join('\n');
}

function wrapHtmlDocument(title: string, headerRows: [string, string][], bodyHtml: string): string {
    const metaItems = headerRows
        .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
        .join('');

    return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font-family: "Inter", "Noto Sans Thai", system-ui, -apple-system, sans-serif; background: #1e1f22; color: #dbdee1; line-height: 1.55; }
  .wrap { max-width: 920px; margin: 0 auto; padding: 28px 20px 48px; }
  .header { background: #2b2d31; border: 1px solid #3f4147; border-left: 4px solid #5865f2; border-radius: 10px; padding: 20px; margin-bottom: 24px; }
  .header h1 { margin: 0 0 14px; font-size: 20px; color: #ffffff; }
  .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px 18px; margin: 0; }
  .meta dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #949ba4; }
  .meta dd { margin: 2px 0 0; font-size: 13px; color: #f2f3f5; word-break: break-word; }
  .messages { display: flex; flex-direction: column; gap: 12px; }
  .msg { background: #2b2d31; border: 1px solid #383a40; border-radius: 8px; padding: 12px 14px; }
  .msg-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 6px; }
  .author { font-weight: 600; color: #ffffff; }
  .bot { font-size: 10px; font-weight: 700; background: #5865f2; color: #ffffff; border-radius: 4px; padding: 1px 5px; }
  .uid { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; color: #949ba4; }
  .time { font-size: 12px; color: #949ba4; margin-left: auto; }
  .content { white-space: pre-wrap; word-break: break-word; font-size: 14px; }
  .attachments { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; }
  .att { display: inline-block; background: #1e1f22; border: 1px solid #3f4147; border-radius: 6px; padding: 4px 10px; font-size: 12px; color: #00a8fc; text-decoration: none; }
  .att:hover { text-decoration: underline; }
  .embed { margin-top: 8px; background: #1e1f22; border-left: 3px solid #5865f2; border-radius: 4px; padding: 8px 10px; font-size: 13px; }
  .embed-title { font-weight: 600; color: #ffffff; margin-bottom: 2px; }
  .empty { text-align: center; color: #949ba4; padding: 32px; background: #2b2d31; border-radius: 8px; }
  pre.markdown { background: #2b2d31; border: 1px solid #383a40; border-radius: 8px; padding: 16px; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; }
</style>
</head>
<body>
  <div class="wrap">
    <section class="header">
      <h1>${escapeHtml(title)}</h1>
      <dl class="meta">${metaItems}</dl>
    </section>
    ${bodyHtml}
  </div>
</body>
</html>`;
}

export function buildTranscriptHtml(meta: TranscriptMetadata, messages: readonly TranscriptMessageLike[]): string {
    const num = formatTicketNumber(meta.ticketNumber);
    const title = `Transcript — Ticket #${num}`;
    const headerRows: [string, string][] = [
        ['เซิร์ฟเวอร์', meta.guildName],
        ['ผู้เปิด Ticket', `${meta.openerName} (${meta.openerId})`],
        ['ผู้รับเรื่อง', meta.claimedById ? `${meta.claimedByName ?? meta.claimedById} (${meta.claimedById})` : '—'],
        ['ผู้ปิด Ticket', `${meta.closedByName} (${meta.closedById})`],
        ...(meta.subject ? [['หัวข้อ', meta.subject] as [string, string]] : []),
        ['เวลาเปิด', `${formatBangkokTimestamp(meta.createdAt)} (UTC+7)`],
        ['เวลาปิด', `${formatBangkokTimestamp(meta.closedAt)} (UTC+7)`],
        ['จำนวนข้อความ', `${messages.length} ข้อความ`],
    ];

    if (messages.length === 0) {
        return wrapHtmlDocument(title, headerRows, '<div class="empty">ไม่มีข้อความในห้อง Ticket นี้</div>');
    }

    const cards = messages
        .map((msg) => {
            const displayName = msg.author.globalName || msg.author.username || msg.author.id;
            const botBadge = msg.author.bot ? '<span class="bot">BOT</span>' : '';
            const contentHtml = msg.content.trim() ? `<div class="content">${escapeHtml(msg.content)}</div>` : '';

            const attachments = attachmentList(msg.attachments)
                .map((att) => {
                    const safeUrl = sanitizeHttpUrl(att.url);
                    const label = `📎 ${att.name || 'attachment'}`;
                    return safeUrl
                        ? `<a class="att" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
                        : `<span class="att">${escapeHtml(label)}</span>`;
                })
                .join('');
            const attachmentsHtml = attachments ? `<div class="attachments">${attachments}</div>` : '';

            const embedsHtml = msg.embeds
                .map((embed) => {
                    if (!embed.title && !embed.description) return '';
                    const embedTitle = embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : '';
                    const embedDesc = embed.description ? `<div class="content">${escapeHtml(embed.description)}</div>` : '';
                    return `<div class="embed">${embedTitle}${embedDesc}</div>`;
                })
                .join('');

            return `<article class="msg">
  <div class="msg-head">
    <span class="author">${escapeHtml(displayName)}</span>
    ${botBadge}
    <span class="uid">${escapeHtml(msg.author.id)}</span>
    <span class="time">${escapeHtml(formatBangkokTimestamp(msg.createdTimestamp))}</span>
  </div>
  ${contentHtml || attachmentsHtml || embedsHtml ? `${contentHtml}${attachmentsHtml}${embedsHtml}` : '<div class="uid">(ข้อความระบบ)</div>'}
</article>`;
        })
        .join('\n');

    return wrapHtmlDocument(title, headerRows, `<section class="messages">\n${cards}\n</section>`);
}

export function renderTranscriptHtmlFromMarkdown(
    meta: Pick<TranscriptMetadata, 'guildName' | 'ticketNumber' | 'openerId' | 'openerName' | 'claimedById' | 'claimedByName' | 'closedById' | 'closedByName' | 'subject' | 'createdAt' | 'closedAt'>,
    markdown: string,
): string {
    const num = formatTicketNumber(meta.ticketNumber);
    const title = `Transcript — Ticket #${num}`;
    const headerRows: [string, string][] = [
        ['เซิร์ฟเวอร์', meta.guildName],
        ['ผู้เปิด Ticket', `${meta.openerName} (${meta.openerId})`],
        ['ผู้รับเรื่อง', meta.claimedById ? `${meta.claimedByName ?? meta.claimedById} (${meta.claimedById})` : '—'],
        ['ผู้ปิด Ticket', `${meta.closedByName} (${meta.closedById})`],
        ...(meta.subject ? [['หัวข้อ', meta.subject] as [string, string]] : []),
        ['เวลาเปิด', `${formatBangkokTimestamp(meta.createdAt)} (UTC+7)`],
        ['เวลาปิด', `${formatBangkokTimestamp(meta.closedAt)} (UTC+7)`],
    ];
    return wrapHtmlDocument(title, headerRows, `<pre class="markdown">${escapeHtml(markdown)}</pre>`);
}
