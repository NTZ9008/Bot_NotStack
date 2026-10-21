import type { JiraOptions, JiraSettings } from '@notstack/shared';

// ค่าที่แก้ในฟอร์ม — apiToken ว่าง = ไม่เปลี่ยน token เดิม
export interface JiraDraft {
    siteUrl: string;
    email: string;
    apiToken: string;
    projectKey: string;
    panelChannelId: string;
    logChannelId: string;
    categoryId: string;
    options: JiraOptions;
}

export const toJiraDraft = (s: JiraSettings): JiraDraft => ({
    siteUrl: s.siteUrl,
    email: s.email,
    apiToken: '',
    projectKey: s.projectKey,
    panelChannelId: s.panelChannelId,
    logChannelId: s.logChannelId,
    categoryId: s.categoryId,
    options: structuredClone(s.options),
});

export interface JiraDraftProps {
    draft: JiraDraft;
    patch: (next: Partial<JiraDraft>) => void;
    patchOptions: (next: Partial<JiraOptions>) => void;
}

// ช่องตัวเลขจำนวนเต็ม 0..max (ค่าที่ไม่ใช่ตัวเลขกลายเป็น 0)
export function clampInt(raw: string, max: number): number {
    const value = Math.trunc(Number(raw));
    return Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0;
}
