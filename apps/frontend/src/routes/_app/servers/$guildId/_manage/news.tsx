import { HEX_COLOR_RE, isHttpUrl, NEWS_DEFAULT_FOOTER, NEWS_LIMITS, NEWS_PRESETS, type NewsType } from '@notstack/shared';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Spinner } from '@/components/ui/spinner';
import { useT, tr, trText } from '@/lib/i18n';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Send } from '@/components/icons';
import { useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { sendNews } from '@/api/bot';
import { ColorField } from '@/components/color-field';
import { useConfirm } from '@/components/confirm-dialog';
import { DiscordMessage } from '@/components/discord-message';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { applyMarkdown, MarkdownToolbar, type MarkdownAction } from '@/features/news/markdown-toolbar';
import { errorMessage } from '@/lib/api';
import { renderDiscordMarkdown } from '@/lib/discord-markdown';
import { cn } from '@/lib/utils';
import { useGuild } from '@/hooks/use-guild';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/news')({
    component: NewsPage,
});

const EMPTY = { title: '', content: '', footer: '', imageUrl: '' };
const SHORTCUTS: Record<string, MarkdownAction> = { b: 'bold', i: 'italic', u: 'underline' };

function NewsPage() {
    const guild = useGuild();
    // draft และ mutation ของเซิร์ฟเวอร์เดิมต้องไม่ติดไปยังเซิร์ฟเวอร์ที่เพิ่งเลือก
    return <NewsEditor key={guild.id} guildId={guild.id} guildName={guild.name} />;
}

function NewsEditor({ guildId, guildName }: { guildId: string; guildName: string }) {
    const t = useT();
    const confirm = useConfirm();
    const [type, setType] = useState<NewsType>('general');
    const [color, setColor] = useState(NEWS_PRESETS.general.color);
    const [form, setForm] = useState(EMPTY);
    const textarea = useRef<HTMLTextAreaElement>(null);
    const pendingSelection = useRef<[number, number] | null>(null);

    useUnsavedChangesGuard(Object.values(form).some(Boolean), {
        title: tr('news.discardTheUnsentAnnouncement'),
        description: tr('news.theAnnouncementForHasntBeenSent', { 0: guildName }),
        confirmText: tr('news.discardMessage'),
        destructive: true,
    });

    // หลังแทรก Markdown ให้เลือกข้อความเดิม/ตำแหน่งเคอร์เซอร์ต่อ
    useLayoutEffect(() => {
        if (pendingSelection.current && textarea.current) {
            textarea.current.setSelectionRange(...pendingSelection.current);
            pendingSelection.current = null;
        }
    }, [form.content]);

    const apply = (action: MarkdownAction) => {
        const area = textarea.current;
        if (!area) return;
        const result = applyMarkdown(form.content, area.selectionStart, area.selectionEnd, action);
        pendingSelection.current = result.selection;
        setForm((f) => ({ ...f, content: result.value }));
    };

    const mutation = useMutation({
        mutationFn: (input: Parameters<typeof sendNews>[1]) => sendNews(guildId, input),
        onSuccess: () => {
            toast.success(tr('news.announcementSent'), { description: tr('news.yourAnnouncementHasBeenPostedTo') });
            setForm(EMPTY);
            setColor(NEWS_PRESETS[type].color);
        },
        onError: (err) => toast.error(tr('news.failedToSendAnnouncement'), { description: errorMessage(err) }),
    });

    const send = async () => {
        const title = form.title.trim();
        const content = form.content.trim();
        if (!title || !content) return toast.warning(tr('common.missingInformation'), { description: tr('news.pleaseFillInTheTitleAnd') });
        if (content.length > NEWS_LIMITS.content) {
            return toast.warning(tr('news.contentTooLong'), {
                description: tr('news.discordAcceptsUpToCharactersCurrently', { 0: NEWS_LIMITS.content, 1: content.length }),
            });
        }
        const ok = await confirm({
            title: tr('news.sendThisAnnouncement'),
            description: tr('news.thisMessageWillBeSentRight', { 0: guildName }),
            confirmText: tr('news.sendIt'),
        });
        if (!ok) return;
        mutation.mutate({
            type,
            title,
            content,
            color: HEX_COLOR_RE.test(color) ? color : NEWS_PRESETS[type].color,
            footer: form.footer.trim() || undefined,
            imageUrl: form.imageUrl.trim() || undefined,
        });
    };

    const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value }));
    const imageOk = isHttpUrl(form.imageUrl.trim());

    return (
        <>
            <PageHeader help="news" title={tr('common.announcements')} description={t('news.announcementsForNameFormatTheMessage', { name: guildName })} />
            <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            {tr('news.beforeTheFirstSendPickThe')}{' '}
                            <Link to="/servers/$guildId/config" params={{ guildId }} className="text-highlight underline underline-offset-4">
                                {tr('common.botSettings')}
                            </Link>
                        </p>
                        <div>
                            <Field label={tr('news.newsType')}>
                                <Select
                                    value={type}
                                    onValueChange={(value) => {
                                        // เปลี่ยนประเภทข่าว = เปลี่ยนสีเริ่มต้นให้ด้วย (แอดมินเลือกสีเองทับได้)
                                        setType(value as NewsType);
                                        setColor(NEWS_PRESETS[value as NewsType].color);
                                    }}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(Object.keys(NEWS_PRESETS) as NewsType[]).map((key) => (
                                            <SelectItem key={key} value={key}>
                                                {trText(NEWS_PRESETS[key].label)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>
                        <Field
                            label={tr('news.announcementTitle')}
                            htmlFor="news-title"
                            hint={tr('news.discordShowsTheTitleAsPlain', { 0: form.title.length, 1: NEWS_LIMITS.title })}
                        >
                            <Input
                                id="news-title"
                                maxLength={NEWS_LIMITS.title}
                                placeholder={tr('news.exampleNewSystemUpdatePatch')}
                                value={form.title}
                                onChange={set('title')}
                            />
                        </Field>
                        <Field
                            label={tr('common.details')}
                            htmlFor="news-content"
                            hint={
                                <span className={cn(form.content.length > NEWS_LIMITS.content && 'text-destructive')}>
                                    {tr('news.supportsDiscordMarkdown')} {form.content.length}/{NEWS_LIMITS.content}
                                </span>
                            }
                        >
                            <div>
                                <MarkdownToolbar textareaRef={textarea} onApply={apply} />
                                <Textarea
                                    id="news-content"
                                    ref={textarea}
                                    rows={11}
                                    className="rounded-t-none"
                                    placeholder={tr('news.typeTheNewsContentSelectText')}
                                    value={form.content}
                                    onChange={set('content')}
                                    onKeyDown={(e) => {
                                        const action = SHORTCUTS[e.key.toLowerCase()];
                                        if ((e.ctrlKey || e.metaKey) && action) {
                                            e.preventDefault();
                                            apply(action);
                                        }
                                    }}
                                />
                            </div>
                        </Field>
                        <Accordion type="single" collapsible className="rounded-lg border">
                            <AccordionItem value="more" className="border-none">
                                <AccordionTrigger className="px-3">{tr('news.moreOptionsColorImageFooter')}</AccordionTrigger>
                                <AccordionContent className="space-y-4 border-t p-3">
                                    <Field label={tr('common.embedLeftBarColor')}>
                                        <ColorField value={color} onChange={setColor} />
                                    </Field>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <Field label={tr('news.footerText')} htmlFor="news-footer">
                                            <Input
                                                id="news-footer"
                                                maxLength={NEWS_LIMITS.footer}
                                                placeholder={NEWS_DEFAULT_FOOTER}
                                                value={form.footer}
                                                onChange={set('footer')}
                                            />
                                        </Field>
                                        <Field
                                            label={tr('news.imageUrl')}
                                            htmlFor="news-image"
                                            error={form.imageUrl.trim() && !imageOk ? tr('news.theImageUrlMustStartWith') : undefined}
                                        >
                                            <Input
                                                id="news-image"
                                                placeholder={tr('news.httpsOptional')}
                                                spellCheck={false}
                                                value={form.imageUrl}
                                                onChange={set('imageUrl')}
                                            />
                                        </Field>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                        <Button className="w-full" onClick={() => void send()} disabled={mutation.isPending}>
                            {mutation.isPending ? <Spinner /> : <Send />} {tr('news.postAnnouncementToDiscord')}
                        </Button>
                    </CardContent>
                </Card>

                {/* ตัวอย่างข้อความที่จะไปโผล่ใน Discord (อัปเดตสดขณะพิมพ์) */}
                <div className="space-y-2 xl:sticky xl:top-20 xl:self-start">
                    <p className="text-sm text-muted-foreground">{tr('news.previewAsSeenInDiscord')}</p>
                    <DiscordMessage>
                        <div
                            className="dark max-w-lg rounded border-l-4 bg-[#2b2d31] p-3"
                            style={{ borderLeftColor: HEX_COLOR_RE.test(color) ? color : NEWS_PRESETS[type].color }}
                        >
                            {form.title.trim() && (
                                <p className="mb-1 font-semibold text-white">
                                    {NEWS_PRESETS[type].prefix} {form.title.trim()}
                                </p>
                            )}
                            {form.content.trim() ? (
                                <div className="discord-md" dangerouslySetInnerHTML={{ __html: renderDiscordMarkdown(form.content) }} />
                            ) : (
                                <p className="text-sm text-[#949ba4] italic">{tr('news.noContentYet')}</p>
                            )}
                            {imageOk && <img src={form.imageUrl.trim()} alt="" className="mt-3 max-h-72 rounded" />}
                            <p className="mt-2 text-xs text-[#b5bac1]">{form.footer.trim() || NEWS_DEFAULT_FOOTER}</p>
                        </div>
                    </DiscordMessage>
                </div>
            </div>
        </>
    );
}
