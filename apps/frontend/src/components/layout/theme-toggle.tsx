import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';

// ปุ่มสลับธีมสว่าง/มืด (มุมบนเมนูซ้าย)
export function ThemeToggle({ className }: { className?: string }) {
    const [theme, setTheme] = useTheme();
    const dark = theme === 'dark';
    return (
        <Button variant="ghost" size="icon" className={className} aria-label={dark ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด'} onClick={() => setTheme(dark ? 'light' : 'dark')}>
            {dark ? <Sun /> : <Moon />}
        </Button>
    );
}
