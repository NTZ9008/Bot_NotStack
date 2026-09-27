import type { GuildChannel, GuildRole, PreviewEmbed, WeatherOptions } from '@notstack/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { weatherApi } from '@/api/weather';
import { DiscordMessage } from '@/components/discord-message';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useGuildId } from '@/hooks/use-guild';
import { apiUrl, errorMessage } from '@/lib/api';
import { escapeHtml, renderDiscordMarkdown } from '@/lib/discord-markdown';
import { cn } from '@/lib/utils';

const PREVIEW_DELAY = 400;
const timeLabel = (value: string | number) => new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

// Markdown ของ Discord + แท็กยศ / ห้อง ที่พิมพ์ไว้เอง แสดงเป็นชื่อแบบใน Discord
function markdown(text: string, roles: GuildRole[], channels: GuildChannel[]): string {
    const mention = (label: string) => `<span class="dc-mention">${escapeHtml(label)}</span>`;
    return renderDiscordMarkdown(text)
        .replace(/&lt;@&amp;(\d+)&gt;/g, (_, id: string) => mention(`@${roles.find((r) => r.id === id)?.name ?? 'ยศ'}`))
        .replace(/&lt;#(\d+)&gt;/g, (_, id: string) => mention(`#${channels.find((ch) => ch.id === id)?.name ?? 'ห้อง'}`))
        .replace(/&lt;@!?(\d+)&gt;/g, () => mention('@ผู้ใช้'));
}

// รูปที่อ้างเป็น attachment://ชื่อไฟล์ → data URL หรือ path ของ API จาก server
const resolveFile = (files: Record<string, string>, url: string | undefined) => {
    const file = url ? files[url.replace('attachment://', '')] : undefined;
    return file && !file.startsWith('data:') ? apiUrl(file) : file;
};

// embed 1 อันแบบที่ Discord แสดง (ช่องข้อมูลแถวละ 3 หรือ 2 เมื่อมีรูปมุมขวาบน)
function EmbedView({ embed, files, roles, channels }: { embed: PreviewEmbed; files: Record<string, string>; roles: GuildRole[]; channels: GuildChannel[] }) {
    const image = resolveFile(files, embed.image?.url);
    const footer = [embed.footer?.text, embed.timestamp ? `วันนี้ เวลา ${timeLabel(embed.timestamp)}` : ''].filter(Boolean).join(' • ');
    return (
        <div className="max-w-[520px] overflow-hidden rounded border-l-4 bg-[#2b2d31] p-3 pr-4" style={{ borderLeftColor: `#${(embed.color ?? 0).toString(16).padStart(6, '0')}` }}>
            {embed.thumbnail?.url && <img src={embed.thumbnail.url} alt="" className="float-right mb-2 ml-4 size-20 rounded object-contain" />}
            {embed.title &&
                (embed.url ? (
                    <a href={embed.url} target="_blank" rel="noopener noreferrer" className="block font-semibold text-[#00a8fc] hover:underline">
                        {embed.title}
                    </a>
                ) : (
                    <p className="font-semibold text-white">{embed.title}</p>
                ))}
            {embed.description && <div className="discord-md mt-1 text-sm" dangerouslySetInnerHTML={{ __html: markdown(embed.description, roles, channels) }} />}
            {embed.fields?.length ? (
                <div className={cn('mt-2 grid gap-x-3 gap-y-2', embed.thumbnail ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
                    {embed.fields.map((field, i) => (
                        <div key={i} className="min-w-0 text-sm leading-snug break-words">
                            <div className="font-semibold text-[#f2f3f5]" dangerouslySetInnerHTML={{ __html: markdown(field.name, roles, channels) }} />
                            <div className="discord-md text-[#dbdee1]" dangerouslySetInnerHTML={{ __html: markdown(field.value, roles, channels) }} />
                        </div>
                    ))}
                </div>
            ) : null}
            {image && <img src={image} alt="" className="clear-both mt-3 w-full rounded" />}
            {footer && <p className="clear-both mt-2 text-xs text-[#949ba4]">{footer}</p>}
        </div>
    );
}

/**
 * ตัวอย่างรายงานใน Discord — server สร้างด้วยโค้ดเดียวกับตอนส่งจริง (ข้อมูลอากาศจริง cache 10 นาที)
 * เวลา / วัน / ห้อง ไม่มีผลกับหน้าตารายงาน จึงไม่ขอตัวอย่างใหม่เมื่อแก้ค่าพวกนั้น
 */
export function WeatherPreview({
    content,
    options,
    roles,
    channels,
    enabled,
}: {
    content: string;
    options: WeatherOptions;
    roles: GuildRole[];
    channels: GuildChannel[];
    enabled: boolean;
}) {
    const guildId = useGuildId();
    const { schedule: _schedule, ...look } = options;
    const payload = useDebouncedValue({ content, look }, PREVIEW_DELAY);
    const preview = useQuery({
        queryKey: ['guild', guildId, 'weather', 'preview', payload],
        queryFn: ({ signal }) => weatherApi.preview(guildId, { content: payload.content, options: { ...payload.look, schedule: options.schedule } }, signal),
        placeholderData: keepPreviousData,
        staleTime: 60 * 1000,
        retry: false,
        enabled,
    });
    const data = preview.data;

    return (
        <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
                ตัวอย่างใน Discord — ใช้ข้อมูลอากาศจริงของสถานที่ที่เลือก {data && `(ข้อมูล ณ ${timeLabel(data.fetchedAt)} น.)`}
            </p>
            <DiscordMessage>
                <div className={cn('space-y-1 transition-opacity', preview.isFetching && 'opacity-60')}>
                    {data?.content && <div className="discord-md" dangerouslySetInnerHTML={{ __html: markdown(data.content, roles, channels) }} />}
                    {data?.embeds.map((embed, i) => <EmbedView key={i} embed={embed} files={data.files} roles={roles} channels={channels} />)}
                    {!data && preview.isFetching && (
                        <p className="flex items-center gap-2 text-sm text-[#949ba4]">
                            <Loader2 className="size-4 animate-spin" /> กำลังโหลดข้อมูลอากาศ...
                        </p>
                    )}
                    {preview.error && <p className="text-sm text-red-400">สร้างตัวอย่างไม่สำเร็จ: {errorMessage(preview.error)}</p>}
                    {data?.warnings.length ? (
                        <p className="flex items-start gap-1.5 text-sm text-amber-300">
                            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {data.warnings.join(' · ')}
                        </p>
                    ) : null}
                </div>
            </DiscordMessage>
        </div>
    );
}
