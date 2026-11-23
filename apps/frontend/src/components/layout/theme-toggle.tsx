import { cn } from 'cn';
import { Moon, Palette, Sun } from '@/components/icons';
import { useTheme, type Theme } from '@/hooks/use-theme';
import { useLang, useT, type Lang, tr } from '@/lib/i18n';

// ปุ่มแบบแบ่งช่อง (segmented) ทรงแคปซูลบนแถบบน — เลือกธีม / ภาษา ; ช่องที่เลือกมีพื้นเลื่อนตามแบบนุ่มๆ
function Segmented<T extends string>({
    label,
    value,
    options,
    onChange,
    iconOnly = false,
}: {
    label: string;
    value: T;
    options: { value: T; label: string; short?: string; icon?: typeof Sun }[];
    onChange: (v: T) => void;
    iconOnly?: boolean;
}) {
    const index = Math.max(
        0,
        options.findIndex((o) => o.value === value),
    );
    return (
        <div role="group" aria-label={label} className="relative grid shrink-0 auto-cols-fr grid-flow-col rounded-full bg-muted p-1 ring-1 ring-border">
            <span
                aria-hidden
                className="absolute inset-y-1 left-1 rounded-full bg-card shadow-sm ring-1 ring-border transition-transform duration-500 ease-spring motion-reduce:transition-none dark:bg-primary dark:ring-0"
                style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
            />
            {options.map(({ value: v, label: text, short, icon: Icon }) => (
                <button
                    key={v}
                    type="button"
                    aria-pressed={value === v}
                    aria-label={iconOnly ? text : undefined}
                    title={iconOnly || short ? text : undefined}
                    onClick={() => onChange(v)}
                    className={cn(
                        'relative flex h-8 min-w-8 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold text-muted-foreground transition-colors duration-200 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                        value === v && 'text-accent-foreground dark:text-white',
                    )}
                >
                    {Icon && <Icon className="size-4" />}
                    {!iconOnly && (short ?? text)}
                </button>
            ))}
        </div>
    );
}

export function ThemeSwitcher({ iconOnly = false }: { iconOnly?: boolean }) {
    const [theme, setTheme] = useTheme();
    const t = useT();
    return (
        <Segmented<Theme>
            label={t('layout.theme')}
            value={theme}
            onChange={setTheme}
            iconOnly={iconOnly}
            options={[
                { value: 'light', label: t('common.light'), icon: Sun },
                { value: 'dark', label: t('common.dark'), icon: Moon },
                { value: 'classic', label: t('layout.classic'), icon: Palette },
            ]}
        />
    );
}

export function LanguageSwitcher({ short = false }: { short?: boolean }) {
    const [lang, setLang] = useLang();
    return (
        <Segmented<Lang>
            label={tr('layout.language')}
            value={lang}
            onChange={setLang}
            options={[
                { value: 'th', label: tr('layout.thaiLanguageName'), short: short ? 'TH' : undefined },
                { value: 'en', label: 'English', short: short ? 'EN' : undefined },
            ]}
        />
    );
}
