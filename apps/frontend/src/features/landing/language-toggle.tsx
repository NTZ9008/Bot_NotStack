import { tr, useLang } from '@/lib/i18n';

// สลับ ไทย ⇄ English — ป้ายเป็นชื่อภาษาปลายทางในภาษานั้นเอง (อ่านออกแม้ไม่รู้ภาษาที่แสดงอยู่)
export function LanguageToggle() {
    const [lang, setLang] = useLang();
    const next = lang === 'th' ? 'en' : 'th';
    return (
        <button type="button" lang={next} onClick={() => void setLang(next)} className="rounded-xl px-3 py-2 text-sm text-slate-300 hover:text-white">
            {next === 'en' ? 'English' : tr('layout.thaiLanguageName')}
        </button>
    );
}
