import { Check, Moon, Palette, Sun } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTheme, type Theme } from '@/hooks/use-theme';

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'สว่าง', icon: Sun },
    { value: 'dark', label: 'มืด', icon: Moon },
    { value: 'classic', label: 'สีเดิม (แบบหน้าแรก)', icon: Palette },
];

// เลือกธีม (มุมบนเมนูซ้าย)
export function ThemeToggle({ className }: { className?: string }) {
    const [theme, setTheme] = useTheme();
    const Current = THEMES.find((t) => t.value === theme)?.icon ?? Sun;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={className} aria-label="เลือกธีม">
                    <Current />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs text-muted-foreground">ธีม</DropdownMenuLabel>
                {THEMES.map(({ value, label, icon: Icon }) => (
                    <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
                        <Icon />
                        {label}
                        {theme === value && <Check className="ml-auto" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
