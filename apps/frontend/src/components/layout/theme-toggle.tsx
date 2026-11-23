import { cn } from 'cn';
import { Moon, Palette, Sun } from '@/components/icons';
import { useTheme, type Theme } from '@/hooks/use-theme';
import { useLang, useT, type Lang, tr } from '@/lib/i18n';

// ปุ่มแบบแบ่งช่อง (segmented) ท้ายเมนูซ้าย — เลือกธีม / ภาษา
function Segmented<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: { value: T; label: string; icon?: typeof Sun }[];
    onChange: (v: T) => void;
}) {
    return (
        <div role="group" aria-label={label} className="flex rounded-md bg-sidebar-accent p-0.5">
            {options.map(({ value: v, label: text, icon: Icon }) => (
                <button
                    key={v}
                    type="button"
                    aria-pressed={value === v}
                    onClick={() => onChange(v)}
                    className={cn(
                        'flex h-7 flex-1 items-center justify-center gap-1 rounded-sm px-1.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                        value === v && 'bg-background text-foreground shadow-sm',
                    )}
                >
                    {Icon && <Icon className="size-3.5" />}
                    {text}
                </button>
            ))}
        </div>
    );
}

export function ThemeSwitcher() {
    const [theme, setTheme] = useTheme();
    const t = useT();
    return (
        <Segmented<Theme>
            label={t('layout.theme')}
            value={theme}
            onChange={setTheme}
            options={[
                { value: 'light', label: t('common.light'), icon: Sun },
                { value: 'dark', label: t('common.dark'), icon: Moon },
                { value: 'classic', label: t('layout.classic'), icon: Palette },
            ]}
        />
    );
}

export function LanguageSwitcher() {
    const [lang, setLang] = useLang();
    return (
        <Segmented<Lang>
            label={tr('layout.language')}
            value={lang}
            onChange={setLang}
            options={[
                { value: 'th', label: tr('layout.thaiLanguageName') },
                { value: 'en', label: 'English' },
            ]}
        />
    );
}
