import { Info } from '@/components/icons';
import { useT, tr, trText } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { PageGuide } from '@/lib/page-guides';

export function PageHelp({ guide }: { guide: PageGuide }) {
    const t = useT();
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" aria-label={`${t('common.howToUse')}: ${trText(guide.title)}`}>
                    <Info aria-hidden="true" /> {t('common.howToUse')}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
                <DialogHeader className="pr-8">
                    <DialogTitle>
                        {t('common.howToUse')}: {trText(guide.title)}
                    </DialogTitle>
                    <DialogDescription>{trText(guide.summary)}</DialogDescription>
                </DialogHeader>
                <ol className="space-y-4" aria-label={tr('common.steps')}>
                    {guide.steps.map((step, index) => (
                        <li key={step} className="flex items-start gap-3 leading-relaxed">
                            <span
                                aria-hidden="true"
                                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-highlight"
                            >
                                {index + 1}
                            </span>
                            <span>{step}</span>
                        </li>
                    ))}
                </ol>
                <div className="space-y-1 rounded-lg border bg-muted/40 p-3">
                    <p className="font-medium">{tr('common.savingAndWhatHappens')}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{trText(guide.saving)}</p>
                </div>
                {guide.tip && <p className="text-sm leading-relaxed text-muted-foreground">{guide.tip}</p>}
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button">{tr('common.gotIt')}</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
