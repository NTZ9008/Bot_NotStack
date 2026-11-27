import { tr } from '../lib/i18n';
import type { GuildChannel } from '@notstack/shared';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// Radix Select ไม่รับค่าว่าง — ใช้ค่านี้แทน "ไม่เลือกห้อง"
const NONE = '__none__';

/**
 * เลือกห้องจากรายชื่อห้องในเซิร์ฟเวอร์ จัดกลุ่มตามหมวดหมู่ของ Discord
 * ห้องที่ตั้งไว้แต่หาไม่เจอแล้ว (ถูกลบ / บอทมองไม่เห็น) ยังคงค่าไว้ ไม่ให้หายไปเงียบๆ
 */
export function ChannelSelect({
    channels,
    value,
    onChange,
    placeholder = tr('common.selectAChannel'),
    noneLabel,
    showCategories = false,
    className,
    id,
    disabled,
    'aria-label': ariaLabel,
}: {
    channels: GuildChannel[];
    value: string;
    onChange: (channelId: string) => void;
    placeholder?: string;
    // แสดงตัวเลือก "ไม่เลือก" (ค่าเป็น '')
    noneLabel?: string;
    // ให้เลือกหมวดหมู่ได้ด้วย (ignore list)
    showCategories?: boolean;
    className?: string;
    id?: string;
    disabled?: boolean;
    'aria-label'?: string;
}) {
    const byCategory = new Map<string, GuildChannel[]>();
    for (const channel of channels) {
        if (channel.isCategory && !showCategories) continue;
        const key = channel.isCategory ? tr('common.category') : channel.category;
        byCategory.set(key, [...(byCategory.get(key) ?? []), channel]);
    }
    const missing = value && !channels.some((channel) => channel.id === value);

    return (
        <Select value={value || (noneLabel ? NONE : '')} onValueChange={(next) => onChange(next === NONE ? '' : next)} disabled={disabled}>
            <SelectTrigger id={id} aria-label={ariaLabel} className={cn('w-full', className)}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
                {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
                {[...byCategory.entries()].map(([category, list]) => (
                    <SelectGroup key={category}>
                        <SelectLabel>{category}</SelectLabel>
                        {list.map((channel) => (
                            <SelectItem key={channel.id} value={channel.id}>
                                {channel.isCategory ? tr('common.wholeCategory', { 0: channel.name }) : `#${channel.name}`}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                ))}
                {missing && (
                    <SelectItem value={value}>
                        ID: {value} {tr('common.channelNotFound')}
                    </SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}

export function channelLabel(channels: GuildChannel[], channelId: string): string | null {
    if (!channelId) return null;
    const channel = channels.find((ch) => ch.id === channelId);
    if (!channel) return `ID: ${channelId}`;
    return channel.isCategory ? `📂 ${channel.name}` : `#${channel.name}`;
}
