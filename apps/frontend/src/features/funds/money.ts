import { formatBaht as formatBahtTh } from '@notstack/shared';
import { dateLocale } from '@/lib/i18n';

// จำนวนเงินตามภาษา: ไทย "1,500 บาท" · English "1,500 THB"
export const formatBaht = (value: number): string => {
    const th = formatBahtTh(value);
    return dateLocale() === 'en-GB' ? th.replace(/ บาท$/, ' THB') : th;
};
