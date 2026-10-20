import type { LogSettingsResponse } from '@notstack/shared';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logSettingsQuery } from '@/api/bot';
import { useGuildId } from '@/hooks/use-guild';
import { errorMessage } from '@/lib/api';

// ทุกอย่างในหน้า Log Manager บันทึกอัตโนมัติ — แจ้งผลสั้นๆ
export const savedToast = (title = 'บันทึกแล้ว') => toast.success(title, { duration: 1600 });
export const failedToast = (err: unknown) => toast.error('บันทึกไม่สำเร็จ', { description: errorMessage(err) });

// แก้ cache ของการตั้งค่าตามผลที่ API ตอบ (ไม่ต้องโหลดใหม่ทั้งหน้า) / โหลดใหม่เมื่อบันทึกไม่สำเร็จ
export function useSettingsCache() {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    return {
        patch: (updater: (data: LogSettingsResponse) => LogSettingsResponse) =>
            queryClient.setQueryData<LogSettingsResponse>(logSettingsQuery(guildId).queryKey, (data) => (data ? updater(data) : data)),
        refresh: () => queryClient.invalidateQueries({ queryKey: logSettingsQuery(guildId).queryKey }),
    };
}
