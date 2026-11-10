import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useEffect } from 'react';
import { appInfoQuery, DEFAULT_BOT } from '@/api/app';
import { guildQuery } from '@/api/guilds';

// ชื่อเดิมจาก index.html — คืนค่าให้ตอนออกจากหน้าที่ไม่มีหัวข้อของตัวเอง
const DEFAULT_TITLE = typeof document === 'undefined' ? '' : document.title;

// ชื่อแท็บเบราว์เซอร์ตามหน้าที่เปิด: "ชื่อหน้า · ชื่อเซิร์ฟเวอร์ — ชื่อบอท"
export function useDocumentTitle(title: string | undefined): void {
    const { guildId } = useParams({ strict: false });
    const { data: guild } = useQuery({ ...guildQuery(guildId ?? ''), enabled: Boolean(guildId) });
    const { data: info } = useQuery(appInfoQuery);
    const botName = info?.bot?.name ?? DEFAULT_BOT.name;
    const guildName = guildId ? guild?.name : undefined;

    useEffect(() => {
        if (!title) return;
        document.title = `${[title, guildName].filter(Boolean).join(' · ')} — ${botName}`;
        return () => {
            document.title = DEFAULT_TITLE;
        };
    }, [title, guildName, botName]);
}
