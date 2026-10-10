import type { WeatherOptions, WeatherRadarSource, WeatherSettings } from '@notstack/shared';

// ค่าที่ต้องกดบันทึก (สวิตช์เปิด/ปิดบันทึกทันที แยกจากนี้)
export interface WeatherDraft {
    channelId: string;
    content: string;
    options: WeatherOptions;
}

export type PatchWeather = (mutate: (draft: WeatherDraft) => void) => void;

export const toDraft = (settings: WeatherSettings): WeatherDraft => ({
    channelId: settings.channelId,
    content: settings.content,
    options: structuredClone(settings.options),
});

export const isDirty = (draft: WeatherDraft | null, saved: WeatherDraft | null) => Boolean(draft && saved) && JSON.stringify(draft) !== JSON.stringify(saved);

// จันทร์ขึ้นก่อนแบบปฏิทินไทย (ค่า 0 = อาทิตย์ ตรงกับ server)
export const DAY_BUTTONS = [
    { value: 1, label: 'จ' },
    { value: 2, label: 'อ' },
    { value: 3, label: 'พ' },
    { value: 4, label: 'พฤ' },
    { value: 5, label: 'ศ' },
    { value: 6, label: 'ส' },
    { value: 0, label: 'อา' },
];

export const DAY_PRESETS = [
    { label: 'ทุกวัน', days: [0, 1, 2, 3, 4, 5, 6] },
    { label: 'จันทร์–ศุกร์', days: [1, 2, 3, 4, 5] },
    { label: 'เสาร์–อาทิตย์', days: [0, 6] },
];

export const THEME_LABELS = { light: 'สว่าง', dark: 'มืด' } as const;
export const ZOOM_LABELS: Record<number, string> = { 8: 'ภูมิภาค', 9: 'กลาง', 10: 'ใกล้' };
export const RADAR_SOURCE_LABELS: Record<WeatherRadarSource, string> = { rainviewer: 'RainViewer', tmd: 'กรมอุตุนิยมวิทยา' };
