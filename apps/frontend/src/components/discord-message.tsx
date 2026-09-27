import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { appInfoQuery, DEFAULT_BOT } from '@/api/app';
import { nowTimeLabel } from '@/lib/format';

// กรอบข้อความจำลองแบบ Discord — ใช้ดูตัวอย่างก่อนส่งจริง (หน้า News / Welcome)
export function DiscordMessage({ children, bot }: { children: ReactNode; bot?: { name: string; avatar: string } | null }) {
    const { data: info } = useQuery(appInfoQuery);
    const author = bot ?? info?.bot ?? DEFAULT_BOT;

    return (
        <div className="rounded-lg bg-[#313338] p-4 font-sans text-[#dbdee1] shadow-inner">
            <div className="flex gap-4">
                <img src={author.avatar} alt="" className="size-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5">
                        <span className="font-medium text-white">{author.name}</span>
                        <span className="rounded-[3px] bg-[#5865f2] px-1 text-[10px] leading-4 font-semibold text-white">BOT</span>
                        <span className="text-xs text-[#949ba4]">{nowTimeLabel()}</span>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}
