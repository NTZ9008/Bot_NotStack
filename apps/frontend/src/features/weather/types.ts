import { tr } from '../../lib/i18n';
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
    { value: 1, label: tr('จ') },
    { value: 2, label: tr('อ') },
    { value: 3, label: tr('พ') },
    { value: 4, label: tr('พฤ') },
    { value: 5, label: tr('ศ') },
    { value: 6, label: tr('ส') },
    { value: 0, label: tr('อา') },
];

export const DAY_PRESETS = [
    { label: tr('ทุกวัน'), days: [0, 1, 2, 3, 4, 5, 6] },
    { label: tr('จันทร์–ศุกร์'), days: [1, 2, 3, 4, 5] },
    { label: tr('เสาร์–อาทิตย์'), days: [0, 6] },
];

export const THEME_LABELS = { light: tr('สว่าง'), dark: tr('มืด') } as const;
export const ZOOM_LABELS: Record<number, string> = { 8: tr('ภูมิภาค'), 9: tr('กลาง'), 10: tr('ใกล้') };
export const RADAR_SOURCE_LABELS: Record<WeatherRadarSource, string> = { rainviewer: 'RainViewer', tmd: tr('กรมอุตุนิยมวิทยา') };
