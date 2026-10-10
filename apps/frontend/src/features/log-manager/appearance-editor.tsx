import { DEFAULT_LOG_APPEARANCE, formatLogEmbed, type LogAppearance, type LogEmbedContent, type LogEventSetting } from '@notstack/shared';
import { useMutation } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { Check, RotateCcw, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { logSettingsApi } from '@/api/bot';
import { useConfirm } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';

const samples: Record<string, LogEmbedContent> = {
    messageUpdate: {
        title: '📝 แก้ไขข้อความ',
        description: '@Mali แก้ไขข้อความใน #general',
        fields: [
            { name: '👤 ผู้เขียน', value: '@Mali' },
            { name: '📺 ช่อง', value: '#general' },
            {
                name: 'ก่อนแก้ไข',
                value: 'วันนี้นัดคุยกันตอน 18:00 น. ที่ห้อง Community นะ ทุกคนสามารถนำไอเดียและคำถามมาพูดคุยกันได้ เราจะทบทวนกิจกรรมที่ผ่านมาและวางแผนกิจกรรมครั้งถัดไปด้วยกัน หากใครไม่สะดวกเข้าร่วม สามารถฝากความคิดเห็นไว้ในห้องนี้ได้เลย ทีมงานจะรวบรวมข้อมูลไปพูดคุยให้ แล้วเจอกันนะ!',
                inline: false,
            },
            { name: 'หลังแก้ไข', value: 'ขอเลื่อนเป็น 19:00 น. นะ เจอกันที่ห้อง Community เหมือนเดิม', inline: false },
        ],
    },
    memberJoin: {
        title: '📥 สมาชิกเข้าร่วม',
        description: '@Mali เข้าร่วมเซิร์ฟเวอร์',
        thumbnail: 'https://cdn.discordapp.com/embed/avatars/0.png',
        fields: [
            { name: '👤 ผู้ใช้', value: '@Mali' },
            { name: '🆔 User ID', value: '123456789012345678' },
            { name: '📅 สร้างบัญชีเมื่อ', value: '12 มกราคม 2025 • 1 ปีที่แล้ว', inline: false },
            { name: '👥 จำนวนสมาชิกตอนนี้', value: '128 คน' },
        ],
    },
    memberBan: {
        title: '🔨 แบนสมาชิก',
        description: '@Mali ถูกแบนออกจากเซิร์ฟเวอร์',
        thumbnail: 'https://cdn.discordapp.com/embed/avatars/0.png',
        fields: [
            { name: '👤 สมาชิก', value: '@Mali' },
            { name: '🛡️ ผู้ดำเนินการ', value: '@Admin' },
            { name: '📝 เหตุผล', value: 'ส่งข้อความรบกวนสมาชิกซ้ำหลังจากได้รับคำเตือน', inline: false },
        ],
    },
};

export function AppearanceEditor({
    guildId,
    appearance,
    events,
    onSaved,
}: {
    guildId: string;
    appearance: LogAppearance;
    events: LogEventSetting[];
    onSaved: (appearance: LogAppearance) => void;
}) {
    const [draft, setDraft] = useState<LogAppearance>({ ...appearance });
    const [persisted, setPersisted] = useState<LogAppearance>(appearance);
    const [sample, setSample] = useState('messageUpdate');
    const confirm = useConfirm();
    const lastAppearance = useRef(appearance);
    useEffect(() => {
        const previous = lastAppearance.current;
        lastAppearance.current = appearance;
        setPersisted(appearance);
        setDraft((current) => (JSON.stringify(current) === JSON.stringify(previous) ? { ...appearance } : current));
    }, [appearance]);
    const mutation = useMutation({
        mutationFn: (next: LogAppearance) => logSettingsApi.updateOptions(guildId, { appearance: next }),
        onSuccess: ({ options }) => {
            setPersisted(options.appearance);
            setDraft(options.appearance);
            onSaved(options.appearance);
            toast.success('บันทึกรูปแบบแล้ว', { description: 'ใช้กับ log ใหม่ทุกประเภทในเซิร์ฟเวอร์นี้' });
        },
        onError: (error) => toast.error('บันทึกไม่สำเร็จ', { description: errorMessage(error) }),
    });
    const dirty = JSON.stringify(draft) !== JSON.stringify(persisted);
    useBlocker({
        shouldBlockFn: async () =>
            dirty &&
            !(await confirm({
                title: 'ทิ้งรูปแบบที่ยังไม่บันทึก?',
                description: 'การแก้ไขรูปแบบ Log จะหายไปเมื่อออกจากหน้านี้',
                confirmText: 'ทิ้งการแก้ไข',
                destructive: true,
            })),
        enableBeforeUnload: () => dirty,
    });
    const patch = (next: Partial<LogAppearance>) => setDraft((current) => ({ ...current, ...next }));
    const event = events.find((e) => e.key === sample);
    const preview = formatLogEmbed(sample, samples[sample]!, draft, event?.color, '2026-10-05T12:00:00.000Z');
    const toggles = [
        ['showFieldIcons', 'ไอคอนหน้ารายละเอียด', 'เพิ่มสัญลักษณ์ช่วยแยกประเภทข้อมูล'],
        ['showIds', 'แสดง ID', 'แสดงช่อง ID สำหรับอ้างอิงเมื่อเหตุการณ์มีข้อมูลนี้'],
        ['showThumbnail', 'รูปโปรไฟล์', 'แสดงรูปเมื่อเหตุการณ์มีรูปประกอบ'],
        ['showTimestamp', 'เวลาที่เกิดเหตุการณ์', 'แสดงเวลาที่ท้าย embed'],
    ] as const;

    return (
        <Card className="overflow-hidden">
            <CardHeader>
                <CardTitle>ออกแบบข้อความ Log</CardTitle>
                <CardDescription>ปรับรูปแบบให้เหมาะกับทีม แล้วดูตัวอย่างก่อนบันทึก • ใช้กับ log ใหม่ทุกประเภทในเซิร์ฟเวอร์นี้</CardDescription>
            </CardHeader>
            <CardContent className="grid min-w-0 grid-cols-1 gap-8 xl:grid-cols-2">
                <div className="min-w-0 space-y-5">
                    <fieldset disabled={mutation.isPending} className="min-w-0 space-y-5 disabled:opacity-60">
                        <div className="space-y-2">
                            <Label>การจัดวางรายละเอียด</Label>
                            <div className="grid grid-cols-2 gap-3">
                                {(['compact', 'comfortable'] as const).map((layout) => (
                                    <button
                                        key={layout}
                                        type="button"
                                        aria-pressed={draft.layout === layout}
                                        onClick={() => patch({ layout })}
                                        className={`rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${draft.layout === layout ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                                    >
                                        <span className="flex items-center justify-between text-sm font-medium">
                                            {layout === 'compact' ? 'กระชับ' : 'อ่านสบาย'}
                                            {draft.layout === layout && <Check className="size-4" />}
                                        </span>
                                        <span className="mt-1 block text-xs text-muted-foreground">
                                            {layout === 'compact' ? 'ข้อมูลสั้นวางคู่กัน ประหยัดพื้นที่' : 'แยกข้อมูลทีละบรรทัด อ่านง่าย'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="divide-y rounded-lg border px-3">
                            {toggles.map(([key, title, hint]) => (
                                <Label key={key} className="flex cursor-pointer items-center justify-between gap-4 py-3 font-normal">
                                    <span>
                                        <span className="block text-sm font-medium">{title}</span>
                                        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
                                    </span>
                                    <Switch checked={draft[key]} disabled={mutation.isPending} onCheckedChange={(checked) => patch({ [key]: checked })} />
                                </Label>
                            ))}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="log-content-length">ความยาวรายละเอียดต่อช่อง</Label>
                            <Select
                                value={String(draft.maxContentLength)}
                                disabled={mutation.isPending}
                                onValueChange={(value) => patch({ maxContentLength: Number(value) as LogAppearance['maxContentLength'] })}
                            >
                                <SelectTrigger id="log-content-length" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="250">สั้น · 250 ตัวอักษร</SelectItem>
                                    <SelectItem value="500">ปานกลาง · 500 ตัวอักษร</SelectItem>
                                    <SelectItem value="1024">ยาว · 1,024 ตัวอักษร</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">ข้อความที่ยาวเกินจะแสดง … การตั้งค่านี้เปลี่ยนเฉพาะ embed ใน Discord</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="log-footer">ข้อความท้าย embed</Label>
                            <Input
                                id="log-footer"
                                maxLength={100}
                                value={draft.footerText}
                                onChange={(e) => patch({ footerText: e.target.value })}
                                placeholder="เว้นว่างเพื่อซ่อนข้อความท้าย"
                            />
                            <p className="text-right text-xs text-muted-foreground">{draft.footerText.length}/100</p>
                        </div>
                    </fieldset>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate(draft)}>
                            <Save className="size-4" />
                            {mutation.isPending ? 'กำลังบันทึก…' : 'บันทึกรูปแบบ'}
                        </Button>
                        <Button variant="ghost" disabled={mutation.isPending} onClick={() => setDraft({ ...DEFAULT_LOG_APPEARANCE })}>
                            <RotateCcw className="size-4" />
                            คืนค่าเริ่มต้น
                        </Button>
                        {dirty && (
                            <Button variant="ghost" disabled={mutation.isPending} onClick={() => setDraft({ ...persisted })}>
                                ยกเลิกการแก้ไข
                            </Button>
                        )}
                    </div>
                    <p role="status" className="text-xs text-muted-foreground">
                        {dirty ? 'มีการแก้ไขที่ยังไม่ได้บันทึก' : 'รูปแบบตรงกับค่าที่บันทึกไว้'}
                    </p>
                </div>
                <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor="log-preview-event">ตัวอย่างสด</Label>
                        <Select value={sample} onValueChange={setSample}>
                            <SelectTrigger id="log-preview-event" className="w-48">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="messageUpdate">แก้ไขข้อความ</SelectItem>
                                <SelectItem value="memberJoin">สมาชิกเข้าร่วม</SelectItem>
                                <SelectItem value="memberBan">แบนสมาชิก</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="rounded-xl bg-[#313338] p-4 text-[#dbdee1] sm:p-5">
                        <div className="mb-3 flex items-center gap-2 text-sm">
                            <span className="flex size-8 items-center justify-center rounded-full bg-indigo-500 font-bold text-white">N</span>
                            <span className="font-semibold text-white">NotStack</span>
                            <span className="rounded bg-indigo-500 px-1 text-[10px] text-white">APP</span>
                            <span className="text-xs text-[#b5bac1]">วันนี้ 19:00</span>
                        </div>
                        <div
                            className="relative min-w-0 rounded border-l-4 bg-[#2b2d31] p-4"
                            style={{ borderLeftColor: `#${preview.color.toString(16).padStart(6, '0')}` }}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-semibold text-white">{preview.title}</p>
                                    {preview.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{preview.description}</p>}
                                </div>
                                {preview.thumbnail && (
                                    <span
                                        aria-label="รูปโปรไฟล์ตัวอย่าง"
                                        className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-indigo-400 text-lg font-semibold text-white"
                                    >
                                        M
                                    </span>
                                )}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4">
                                {preview.fields.map((field, index) => (
                                    <div key={index} className={`min-w-0 ${field.inline ? '' : 'col-span-2'}`}>
                                        <p className="text-xs font-semibold text-white">{field.name}</p>
                                        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{field.value}</p>
                                    </div>
                                ))}
                            </div>
                            {(preview.footer || preview.timestamp) && (
                                <p className="mt-4 break-words text-[11px] text-[#b5bac1]">
                                    {[preview.footer?.text, preview.timestamp ? 'วันนี้ 19:00' : ''].filter(Boolean).join(' • ')}
                                </p>
                            )}
                        </div>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        ข้อมูลสมมติ • ใช้สีที่ตั้งไว้ของเหตุการณ์นั้น ขนาดและการขึ้นบรรทัดจริงขึ้นอยู่กับหน้าจอ Discord รูปแบบจะเริ่มใช้หลังบันทึก
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
