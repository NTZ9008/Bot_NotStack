import type * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { enGB, th } from 'react-day-picker/locale';
import { useLang } from '@/lib/i18n';
import { cn } from 'cn';
import { ChevronLeft, ChevronRight } from '@/components/icons';
import { buttonVariants } from '@/components/ui/button';

// ปฏิทินตามธีม (ไม่ใช้ปฏิทินของเบราว์เซอร์) — ภาษาไทย ปี พ.ศ.
function Calendar({ className, classNames, showOutsideDays = true, ...props }: React.ComponentProps<typeof DayPicker>) {
    const [lang] = useLang();
    return (
        <DayPicker
            locale={lang === 'en' ? enGB : th}
            showOutsideDays={showOutsideDays}
            className={cn('p-3', className)}
            formatters={{
                // ไทยแสดงปี พ.ศ.
                formatCaption: (month) =>
                    lang === 'en'
                        ? month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
                        : `${month.toLocaleDateString('th-TH', { month: 'long' })} ${month.getFullYear() + 543}`,
            }}
            classNames={{
                root: 'w-fit',
                months: 'relative flex flex-col gap-4',
                month: 'flex w-full flex-col gap-3',
                nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
                button_previous: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'z-10'),
                button_next: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'z-10'),
                month_caption: 'flex h-8 items-center justify-center text-sm font-semibold',
                caption_label: 'select-none',
                month_grid: 'border-collapse',
                weekdays: 'flex',
                weekday: 'w-9 text-center text-xs font-normal text-muted-foreground select-none',
                week: 'mt-1 flex w-full',
                day: 'relative size-9 p-0 text-center text-sm',
                day_button: cn(
                    'inline-flex size-9 items-center justify-center rounded-md outline-none transition-colors',
                    'hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
                ),
                selected: '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground',
                today: '[&>button]:font-bold [&>button]:text-brand',
                outside: 'text-muted-foreground/50',
                disabled: 'pointer-events-none text-muted-foreground/40',
                hidden: 'invisible',
                ...classNames,
            }}
            components={{
                Chevron: ({ orientation, className: iconClass }) =>
                    orientation === 'left' ? <ChevronLeft className={cn('size-4', iconClass)} /> : <ChevronRight className={cn('size-4', iconClass)} />,
            }}
            {...props}
        />
    );
}

export { Calendar };
