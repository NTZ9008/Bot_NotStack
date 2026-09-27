import type { GuildSummary } from '@notstack/shared';
import { cn } from '@/lib/utils';

// ตัวย่อจากชื่อเซิร์ฟเวอร์ (แบบที่ Discord ใช้ตอนเซิร์ฟเวอร์ไม่มีไอคอน)
const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => [...word][0])
        .join('')
        .slice(0, 3) || '?';

export function GuildIcon({ guild, className }: { guild: Pick<GuildSummary, 'name' | 'iconUrl'>; className?: string }) {
    if (guild.iconUrl) return <img src={guild.iconUrl} alt="" className={cn('size-8 shrink-0 rounded-2xl object-cover', className)} />;
    return (
        <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/20 text-xs font-semibold text-indigo-200', className)}>
            {initials(guild.name)}
        </div>
    );
}
