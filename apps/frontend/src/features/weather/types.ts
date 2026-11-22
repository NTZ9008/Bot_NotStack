import { tr, byLang } from '../../lib/i18n';
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
export const DAY_BUTTONS = byLang(() => [
    { value: 1, label: tr('weather.mon') },
    { value: 2, label: tr('weather.tue') },
    { value: 3, label: tr('weather.wed') },
    { value: 4, label: tr('weather.thu') },
    { value: 5, label: tr('weather.fri') },
    { value: 6, label: tr('weather.sat') },
    { value: 0, label: tr('weather.sun') },
]);

export const DAY_PRESETS = byLang(() => [
    { label: tr('weather.everyDay'), days: [0, 1, 2, 3, 4, 5, 6] },
    { label: tr('weather.monFri'), days: [1, 2, 3, 4, 5] },
    { label: tr('weather.satSun'), days: [0, 6] },
]);

export const THEME_LABELS = byLang(() => ({ light: tr('common.light'), dark: tr('common.dark') }) as const);
export const ZOOM_LABELS = byLang((): Record<number, string> => ({ 8: tr('weather.regional'), 9: tr('weather.medium'), 10: tr('weather.near') }));
export const RADAR_SOURCE_LABELS = byLang((): Record<WeatherRadarSource, string> => ({
    rainviewer: 'RainViewer',
    tmd: tr('weather.thaiMeteorologicalDepartment'),
}));
