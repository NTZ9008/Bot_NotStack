import { HEX_COLOR_RE, isHttpUrl, NEWS_DEFAULT_FOOTER, NEWS_LIMITS, NEWS_PRESETS, type NewsType } from '@notstack/shared';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2, Send } from 'lucide-react';
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
import { useGuildId } from '@/hooks/use-guild';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/news')({
    component: NewsPage,
});

const EMPTY = { title: '', content: '', footer: '', imageUrl: '' };
const SHORTCUTS: Record<string, MarkdownAction> = { b: 'bold', i: 'italic', u: 'underline' };

function NewsPage() {
    const guildId = useGuildId();
    const confirm = useConfirm();
    const [type, setType] = useState<NewsType>('general');
    const [color, setColor] = useState(NEWS_PRESETS.general.color);
    const [form, setForm] = useState(EMPTY);
    const textarea = useRef<HTMLTextAreaElement>(null);
    const pendingSelection = useRef<[number, number] | null>(null);

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
            toast.success('ส่งประกาศสำเร็จ!', { description: 'ประกาศของคุณถูกส่งเข้าดิสคอร์ดเรียบร้อยแล้ว' });
            setForm(EMPTY);
            setColor(NEWS_PRESETS[type].color);
        },
        onError: (err) => toast.error('ส่งประกาศไม่สำเร็จ', { description: errorMessage(err) }),
    });

    const send = async () => {
        const title = form.title.trim();
        const content = form.content.trim();
        if (!title || !content) return toast.warning('ข้อมูลไม่ครบถ้วน', { description: 'กรุณากรอกหัวข้อและรายละเอียดข่าวสารให้ครบก่อนส่ง' });
        if (content.length > NEWS_LIMITS.content) {
            return toast.warning('เนื้อหายาวเกินไป', { description: `Discord รับได้ไม่เกิน ${NEWS_LIMITS.content} ตัวอักษร (ตอนนี้ ${content.length} ตัว)` });
        }
        const ok = await confirm({ title: 'ยืนยันการส่งประกาศ?', description: 'ข้อความนี้จะถูกส่งไปยังห้องดิสคอร์ดที่คุณตั้งค่าไว้ทันที', confirmText: 'ส่งเลย!' });
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

    const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
    const imageOk = isHttpUrl(form.imageUrl.trim());

    return (
        <>
            <PageHeader title="Send News to Discord" description="เขียนประกาศเป็น embed พร้อมจัดรูปแบบข้อความ และดูตัวอย่างก่อนส่งจริง" />
            <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="ประเภทข่าวสาร">
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
                                                {NEWS_PRESETS[key].label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label="สีแถบด้านซ้ายของ embed">
                                <ColorField value={color} onChange={setColor} />
                            </Field>
                        </div>
                        <Field
                            label="หัวข้อประกาศ"
                            htmlFor="news-title"
                            hint={`Discord แสดงหัวข้อเป็นข้อความธรรมดา จัดตัวหนา/เอียงไม่ได้ · ${form.title.length}/${NEWS_LIMITS.title}`}
                        >
                            <Input id="news-title" maxLength={NEWS_LIMITS.title} placeholder="ตัวอย่าง: แพตช์อัปเดตระบบใหม่..." value={form.title} onChange={set('title')} />
                        </Field>
                        <Field
                            label="รายละเอียด"
                            hint={
                                <span className={cn(form.content.length > NEWS_LIMITS.content && 'text-destructive')}>
                                    รองรับ Markdown ของ Discord · {form.content.length}/{NEWS_LIMITS.content}
                                </span>
                            }
                        >
                            <div>
                                <MarkdownToolbar textareaRef={textarea} onApply={apply} />
                                <Textarea
                                    ref={textarea}
                                    rows={11}
                                    className="rounded-t-none"
                                    placeholder="พิมพ์เนื้อหาข่าวสาร — ลากคลุมข้อความแล้วกดปุ่มด้านบนเพื่อจัดรูปแบบ"
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
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="ข้อความท้าย embed">
                                <Input maxLength={NEWS_LIMITS.footer} placeholder={NEWS_DEFAULT_FOOTER} value={form.footer} onChange={set('footer')} />
                            </Field>
                            <Field label="ลิงก์รูปภาพประกอบ" error={form.imageUrl.trim() && !imageOk ? 'ลิงก์รูปภาพต้องขึ้นต้นด้วย http:// หรือ https://' : undefined}>
                                <Input placeholder="https://... (ไม่บังคับ)" spellCheck={false} value={form.imageUrl} onChange={set('imageUrl')} />
                            </Field>
                        </div>
                        <Button className="w-full bg-amber-500 text-amber-950 hover:bg-amber-400" onClick={() => void send()} disabled={mutation.isPending}>
                            {mutation.isPending ? <Loader2 className="animate-spin" /> : <Send />} ส่งประกาศเข้า Discord
                        </Button>
                    </CardContent>
                </Card>

                {/* ตัวอย่างข้อความที่จะไปโผล่ใน Discord (อัปเดตสดขณะพิมพ์) */}
                <div className="space-y-2 xl:sticky xl:top-20 xl:self-start">
                    <p className="text-sm text-muted-foreground">ตัวอย่างที่จะเห็นใน Discord</p>
                    <DiscordMessage>
                        <div className="max-w-lg rounded border-l-4 bg-[#2b2d31] p-3" style={{ borderLeftColor: HEX_COLOR_RE.test(color) ? color : NEWS_PRESETS[type].color }}>
                            {form.title.trim() && (
                                <p className="mb-1 font-semibold text-white">
                                    {NEWS_PRESETS[type].prefix} {form.title.trim()}
                                </p>
                            )}
                            {form.content.trim() ? (
                                <div className="discord-md" dangerouslySetInnerHTML={{ __html: renderDiscordMarkdown(form.content) }} />
                            ) : (
                                <p className="text-sm text-[#949ba4] italic">ยังไม่ได้พิมพ์เนื้อหา</p>
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
