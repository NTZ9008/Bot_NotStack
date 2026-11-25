import { useState } from 'react';
import { toast } from 'sonner';
import { Snowflake, X } from '@/components/icons';
import { Button } from '@/components/ui/button';
import xmasCrew from '@/features/landing/festival/xmas-white.webp';
import { useTheme } from '@/hooks/use-theme';
import { isChristmasSeason } from '@/lib/christmas';
import { useT } from '@/lib/i18n';

// ==========================================
// 🎄 ป้ายแนะนำธีมคริสต์มาส (ชั่วคราว) — การ์ดลอยมุมขวาล่างทุกหน้าใน Dashboard ช่วงเทศกาล
// ซ่อนเมื่อใช้ธีมคริสต์มาสอยู่แล้ว หรือกด "ลองใช้เลย" / "ไว้ทีหลัง" ไปแล้ว (จำไว้ใน localStorage ไม่ถามซ้ำ)
// สีการ์ดตายตัว (แดง → เขียวสน) ไม่ตามธีมที่ใช้อยู่ จะได้เด่นทั้งธีมสว่างและมืด
// ==========================================
const DISMISS_KEY = 'christmas-promo-2026';

function wasDismissed() {
    try {
        return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
        return false;
    }
}

export function ChristmasThemePromo() {
    const [theme, setTheme] = useTheme();
    const [hidden, setHidden] = useState(wasDismissed);
    const t = useT();
    if (hidden || theme === 'christmas' || !isChristmasSeason()) return null;

    const dismiss = () => {
        try {
            localStorage.setItem(DISMISS_KEY, '1');
        } catch {
            // ปิด storage: ซ่อนแค่หน้านี้
        }
        setHidden(true);
    };
    const tryIt = () => {
        setTheme('christmas');
        dismiss();
        toast.success(t('layout.christmasPromoApplied'));
    };

    return (
        <aside
            aria-labelledby="christmas-promo-title"
            className="fixed right-3 bottom-3 z-50 w-[min(25rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl bg-gradient-to-br from-[#8a0b20] via-[#c8102e] to-[#0f3d2a] p-5 pr-32 text-white shadow-2xl ring-1 shadow-black/40 ring-white/20 animate-in duration-700 fade-in slide-in-from-bottom-6 motion-reduce:animate-none sm:right-6 sm:bottom-6"
        >
            {/* หิมะประดับ + มาสคอตชุดคริสต์มาสโผล่มุมขวา */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_20%_20%,#fff_1.5px,transparent_2.5px),radial-gradient(circle_at_70%_60%,#fff_1px,transparent_2px),radial-gradient(circle_at_45%_85%,#fff_1.5px,transparent_2.5px)] [background-size:60px_60px,80px_80px,70px_70px]"
            />
            <img src={xmasCrew} alt="" aria-hidden className="pointer-events-none absolute -right-3 -bottom-10 h-48 w-auto drop-shadow-xl" />
            <button
                type="button"
                onClick={dismiss}
                aria-label={t('layout.christmasPromoLater')}
                className="absolute top-2.5 right-2.5 grid size-8 place-items-center rounded-full bg-black/20 text-white/90 transition-colors hover:bg-black/35 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
                <X className="size-4" />
            </button>

            <p className="relative inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
                <Snowflake aria-hidden className="size-3.5 text-[#facc15]" /> Merry Christmas & Happy New Year
            </p>
            <h2 id="christmas-promo-title" className="relative mt-3 text-lg leading-tight font-black">
                {t('layout.christmasPromoTitle')}
            </h2>
            <p className="relative mt-1.5 text-sm text-pretty text-white/90">{t('layout.christmasPromoText')}</p>
            <div className="relative mt-4 flex flex-wrap gap-2">
                <Button onClick={tryIt} className="bg-white text-[#a50d26] shadow-lg hover:bg-white/90">
                    <Snowflake aria-hidden /> {t('layout.christmasPromoTry')}
                </Button>
                <Button variant="ghost" onClick={dismiss} className="text-white hover:bg-white/15 hover:text-white">
                    {t('layout.christmasPromoLater')}
                </Button>
            </div>
        </aside>
    );
}
