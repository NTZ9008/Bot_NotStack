import { HEX_COLOR_RE, isHttpUrl, NEWS_DEFAULT_FOOTER, NEWS_LIMITS, NEWS_PRESETS, type NewsType } from '@notstack/shared';
import { useT, tr } from '@/lib/i18n';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Loader2, Send } from '@/components/icons';
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
        title: tr('ทิ้งประกาศที่ยังไม่ได้ส่ง?'),
        description: tr('ประกาศสำหรับเซิร์ฟเวอร์ {0} ยังไม่ได้ส่ง หากออกจากหน้านี้หรือสลับเซิร์ฟเวอร์ ข้อความที่ร่างไว้จะถูกล้าง', { 0: guildName }),
        confirmText: tr('ทิ้งข้อความ'),
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
            toast.success(tr('ส่งประกาศสำเร็จ!'), { description: tr('ประกาศของคุณถูกส่งเข้าดิสคอร์ดเรียบร้อยแล้ว') });
            setForm(EMPTY);
            setColor(NEWS_PRESETS[type].color);
        },
        onError: (err) => toast.error(tr('ส่งประกาศไม่สำเร็จ'), { description: errorMessage(err) }),
    });

    const send = async () => {
        const title = form.title.trim();
        const content = form.content.trim();
        if (!title || !content) return toast.warning(tr('ข้อมูลไม่ครบถ้วน'), { description: tr('กรุณากรอกหัวข้อและรายละเอียดข่าวสารให้ครบก่อนส่ง') });
        if (content.length > NEWS_LIMITS.content) {
            return toast.warning(tr('เนื้อหายาวเกินไป'), {
                description: tr('Discord รับได้ไม่เกิน {0} ตัวอักษร (ตอนนี้ {1} ตัว)', { 0: NEWS_LIMITS.content, 1: content.length }),
            });
        }
        const ok = await confirm({
            title: tr('ยืนยันการส่งประกาศ?'),
            description: tr('ข้อความนี้จะถูกส่งไปยังห้องประกาศที่ตั้งค่าไว้ของเซิร์ฟเวอร์ {0} ทันที', { 0: guildName }),
            confirmText: tr('ส่งเลย!'),
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
            <PageHeader
                help="news"
                title={tr('ส่งประกาศ')}
                description={t('ประกาศสำหรับเซิร์ฟเวอร์ {name} — จัดรูปแบบข้อความและดูตัวอย่างก่อนส่งจริง', { name: guildName })}
            />
            <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            {tr('ก่อนส่งครั้งแรก เลือกห้องประกาศใน')}{' '}
                            <Link to="/servers/$guildId/config" params={{ guildId }} className="text-highlight underline underline-offset-4">
                                {tr('ตั้งค่าบอท')}
                            </Link>
                        </p>
                        <div>
                            <Field label={tr('ประเภทข่าวสาร')}>
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
                                                {tr(NEWS_PRESETS[key].label)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>
                        <Field
                            label={tr('หัวข้อประกาศ')}
                            htmlFor="news-title"
                            hint={tr('Discord แสดงหัวข้อเป็นข้อความธรรมดา จัดตัวหนา/เอียงไม่ได้ · {0}/{1}', { 0: form.title.length, 1: NEWS_LIMITS.title })}
                        >
                            <Input
                                id="news-title"
                                maxLength={NEWS_LIMITS.title}
                                placeholder={tr('ตัวอย่าง: แพตช์อัปเดตระบบใหม่...')}
                                value={form.title}
                                onChange={set('title')}
                            />
                        </Field>
                        <Field
                            label={tr('รายละเอียด')}
                            htmlFor="news-content"
                            hint={
                                <span className={cn(form.content.length > NEWS_LIMITS.content && 'text-destructive')}>
                                    {tr('รองรับ Markdown ของ Discord ·')} {form.content.length}/{NEWS_LIMITS.content}
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
                                    placeholder={tr('พิมพ์เนื้อหาข่าวสาร — ลากคลุมข้อความแล้วกดปุ่มด้านบนเพื่อจัดรูปแบบ')}
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
                        <details className="rounded-lg border">
                            <summary className="cursor-pointer rounded-lg p-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
                                {tr('ปรับแต่งเพิ่มเติม · สี รูปภาพ ข้อความท้าย')}
                            </summary>
                            <div className="space-y-4 border-t p-3">
                                <Field label={tr('สีแถบด้านซ้ายของ embed')}>
                                    <ColorField value={color} onChange={setColor} />
                                </Field>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label={tr('ข้อความท้ายประกาศ')} htmlFor="news-footer">
                                        <Input
                                            id="news-footer"
                                            maxLength={NEWS_LIMITS.footer}
                                            placeholder={NEWS_DEFAULT_FOOTER}
                                            value={form.footer}
                                            onChange={set('footer')}
                                        />
                                    </Field>
                                    <Field
                                        label={tr('ลิงก์รูปภาพประกอบ')}
                                        htmlFor="news-image"
                                        error={form.imageUrl.trim() && !imageOk ? tr('ลิงก์รูปภาพต้องขึ้นต้นด้วย http:// หรือ https://') : undefined}
                                    >
                                        <Input
                                            id="news-image"
                                            placeholder={tr('https://... (ไม่บังคับ)')}
                                            spellCheck={false}
                                            value={form.imageUrl}
                                            onChange={set('imageUrl')}
                                        />
                                    </Field>
                                </div>
                            </div>
                        </details>
                        <Button className="w-full bg-amber-500 text-amber-950 hover:bg-amber-400" onClick={() => void send()} disabled={mutation.isPending}>
                            {mutation.isPending ? <Loader2 className="animate-spin" /> : <Send />} {tr('ส่งประกาศเข้า Discord')}
                        </Button>
                    </CardContent>
                </Card>

                {/* ตัวอย่างข้อความที่จะไปโผล่ใน Discord (อัปเดตสดขณะพิมพ์) */}
                <div className="space-y-2 xl:sticky xl:top-20 xl:self-start">
                    <p className="text-sm text-muted-foreground">{tr('ตัวอย่างที่จะเห็นใน Discord')}</p>
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
                                <p className="text-sm text-[#949ba4] italic">{tr('ยังไม่ได้พิมพ์เนื้อหา')}</p>
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
