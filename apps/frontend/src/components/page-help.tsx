import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { PageGuide } from '@/lib/page-guides';

export function PageHelp({ guide }: { guide: PageGuide }) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" aria-label={`วิธีใช้งาน: ${guide.title}`}>
                    <Info aria-hidden="true" /> วิธีใช้งาน
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
                <DialogHeader className="pr-8">
                    <DialogTitle>วิธีใช้งาน: {guide.title}</DialogTitle>
                    <DialogDescription>{guide.summary}</DialogDescription>
                </DialogHeader>
                <ol className="space-y-4" aria-label="ขั้นตอนการใช้งาน">
                    {guide.steps.map((step, index) => (
                        <li key={step} className="flex items-start gap-3 leading-relaxed">
                            <span
                                aria-hidden="true"
                                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-indigo-300"
                            >
                                {index + 1}
                            </span>
                            <span>{step}</span>
                        </li>
                    ))}
                </ol>
                <div className="space-y-1 rounded-lg border bg-muted/40 p-3">
                    <p className="font-medium">การบันทึกและผลที่เกิดขึ้น</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{guide.saving}</p>
                </div>
                {guide.tip && <p className="text-sm leading-relaxed text-muted-foreground">{guide.tip}</p>}
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button">เข้าใจแล้ว</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
