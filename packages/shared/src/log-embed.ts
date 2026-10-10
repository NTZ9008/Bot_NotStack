import { DEFAULT_LOG_APPEARANCE, type LogAppearance } from './log-appearance';
import { LOG_EVENT_MAP } from './log-manager';

export interface LogEmbedContent {
    title?: string;
    description?: string;
    fields?: ({ name: string; value: string; inline?: boolean } | null)[];
    thumbnail?: string | null;
    footer?: string;
}

export interface FormattedLogEmbed {
    title: string;
    description?: string;
    color: number;
    fields: { name: string; value: string; inline: boolean }[];
    thumbnail?: { url: string };
    footer?: { text: string };
    timestamp?: string;
}

const clip = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);
const plainLabel = (text: string) => text.replace(/^[^\p{L}\p{N}]+/u, '').trim();

/** Shared by Discord delivery and the dashboard preview. Leaves the activity payload intact. */
export function formatLogEmbed(
    eventKey: string,
    payload: LogEmbedContent,
    appearance: LogAppearance = DEFAULT_LOG_APPEARANCE,
    color?: string,
    timestamp = new Date().toISOString(),
): FormattedLogEmbed {
    const meta = LOG_EVENT_MAP.get(eventKey);
    const selectedColor = color && /^#[\da-f]{6}$/i.test(color) ? color : (meta?.color ?? '#5865F2');
    const embed: FormattedLogEmbed = {
        title: clip(payload.title?.trim() || meta?.label || 'บันทึกเหตุการณ์', 256),
        color: Number.parseInt(selectedColor.slice(1), 16),
        fields: [],
    };
    const footer = appearance.footerText.trim();
    // Event-specific footers may contain useful context and must survive custom branding.
    const footerText = [footer, payload.footer].filter(Boolean).join(' • ');
    if (footerText) embed.footer = { text: clip(footerText, 2048) };
    if (appearance.showTimestamp) embed.timestamp = timestamp;
    if (appearance.showThumbnail && payload.thumbnail) embed.thumbnail = { url: payload.thumbnail };
    // Stay below Discord's 6000-character aggregate limit, including very large event payloads.
    let remaining = 5400 - embed.title.length - (embed.footer?.text.length ?? 0);
    if (payload.description?.trim()) {
        embed.description = clip(payload.description.trim(), Math.min(1500, remaining));
        remaining -= embed.description.length;
    }
    const fields = (payload.fields ?? []).filter((f): f is NonNullable<typeof f> => Boolean(f?.value?.trim()));
    const visible = fields.filter((f) => appearance.showIds || !/\bID\b/i.test(plainLabel(f.name)));
    for (const field of visible.slice(0, 25)) {
        const name = clip((appearance.showFieldIcons ? field.name : plainLabel(field.name)) || 'รายละเอียด', 256);
        if (remaining <= name.length + 1) break;
        const limit = Math.min(appearance.maxContentLength, remaining - name.length);
        const value = clip(field.value.trim(), limit);
        embed.fields.push({
            name,
            value,
            inline: appearance.layout === 'compact' && field.inline !== false && value.length <= 100 && !value.includes('\n'),
        });
        remaining -= name.length + value.length;
    }
    const omitted = visible.length - embed.fields.length;
    if (omitted > 0) {
        const notice = `… มีรายละเอียดอีก ${omitted} ช่องที่เกินขนาด embed`;
        embed.description = [embed.description, notice].filter(Boolean).join('\n\n');
    }
    return embed;
}
