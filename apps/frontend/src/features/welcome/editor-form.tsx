import type { GuildChannel, WelcomeAsset, WelcomeCard, WelcomeDesign, WelcomeFontId, WelcomeMeta, WelcomeWeight } from '@notstack/shared';
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ChannelSelect } from '@/components/channel-select';
import { ColorField } from '@/components/color-field';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AssetGallery } from './asset-gallery';
import { CenterButton, insertAtCursor, PlaceholderChips, RangeField, Segmented, SwitchRow } from './form-controls';
import { ALIGN_LABELS, FIT_LABELS, layerTitle, SHAPE_LABELS, SIZE_PRESETS, type CardDraft, type Section } from './types';

export type PatchDraft = (mutate: (draft: CardDraft) => void) => void;

interface FormProps {
    meta: WelcomeMeta;
    draft: CardDraft;
    patch: PatchDraft;
}

// เปลี่ยนขนาดรูป — ย่อ/ขยายตำแหน่งและขนาดขององค์ประกอบตามสัดส่วน จะได้ไม่หลุดขอบ
export function resizeCanvas(design: WelcomeDesign, width: number, height: number, meta: WelcomeMeta): void {
    const { limits } = meta;
    const w = Math.min(limits.maxWidth, Math.max(limits.minWidth, Math.round(width) || design.width));
    const h = Math.min(limits.maxHeight, Math.max(limits.minHeight, Math.round(height) || design.height));
    const sx = w / design.width;
    const sy = h / design.height;
    const s = Math.min(sx, sy);

    design.avatar.x = Math.round(design.avatar.x * sx);
    design.avatar.y = Math.round(design.avatar.y * sy);
    design.avatar.size = Math.max(16, Math.min(Math.min(w, h), Math.round(design.avatar.size * s)));
    design.avatar.borderWidth = Math.round(design.avatar.borderWidth * s);
    for (const t of design.texts) {
        t.x = Math.round(t.x * sx);
        t.y = Math.round(t.y * sy);
        t.size = Math.max(8, Math.min(200, Math.round(t.size * s)));
        t.maxWidth = Math.min(w, Math.round(t.maxWidth * sx));
        t.letterSpacing = Math.round(t.letterSpacing * s);
        t.strokeWidth = Math.round(t.strokeWidth * s);
    }
    design.width = w;
    design.height = h;
}

// ==========================================
// ทั่วไป: ชื่อ / ห้องที่จะส่ง / ข้อความที่ส่งคู่กับรูป
// ==========================================
function GeneralSection({ meta, draft, patch, channels }: FormProps & { channels: GuildChannel[] }) {
    const contentRef = useRef<HTMLTextAreaElement>(null);
    const { limits } = meta;
    return (
        <div className="space-y-4">
            <Field label="ชื่อการ์ด" htmlFor="wc-name" hint="ใช้แยกการ์ดในหน้านี้เท่านั้น สมาชิกไม่เห็น">
                <Input id="wc-name" maxLength={limits.maxNameLength} value={draft.name} onChange={(e) => patch((d) => void (d.name = e.target.value))} />
            </Field>
            <Field label="ห้องที่จะส่ง" hint={channels.length ? 'บอทต้องมีสิทธิ์ดูห้อง ส่งข้อความ และแนบไฟล์ในห้องนี้' : 'บอทยังไม่ออนไลน์ จึงยังโหลดรายชื่อห้องไม่ได้'}>
                <ChannelSelect
                    channels={channels}
                    value={draft.channelId}
                    noneLabel="— เลือกห้องที่จะส่ง —"
                    placeholder="— เลือกห้องที่จะส่ง —"
                    onChange={(channelId) => patch((d) => void (d.channelId = channelId))}
                />
            </Field>
            <Field
                label="ข้อความที่ส่งคู่กับรูป"
                htmlFor="wc-content"
                hint={`รองรับ Markdown ของ Discord · {mention} จะแท็กสมาชิกใหม่จริง · ${draft.content.length}/${limits.maxContentLength}`}
            >
                <Textarea
                    id="wc-content"
                    ref={contentRef}
                    rows={4}
                    maxLength={limits.maxContentLength}
                    placeholder="เว้นว่างไว้ = ส่งแค่รูป"
                    value={draft.content}
                    onChange={(e) => patch((d) => void (d.content = e.target.value))}
                />
                <PlaceholderChips
                    meta={meta}
                    onInsert={(token) => {
                        const { value, cursor } = insertAtCursor(contentRef.current, draft.content, token);
                        patch((d) => void (d.content = value));
                        requestAnimationFrame(() => contentRef.current?.setSelectionRange(cursor, cursor));
                    }}
                />
            </Field>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="mb-1 font-medium">ตัวแปรที่ใช้ได้</p>
                <ul className="space-y-0.5 text-muted-foreground">
                    {meta.placeholders.map((p) => (
                        <li key={p.key}>
                            <code className="text-indigo-300">{`{${p.key}}`}</code> {p.label}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

// ==========================================
// พื้นหลัง: ขนาดรูป / รูปจากคลัง / การวางรูป / เบลอ / สีทับ
// ==========================================
function SizeField({ meta, draft, patch }: FormProps) {
    const { design } = draft;
    const [size, setSize] = useState({ w: String(design.width), h: String(design.height) });
    useEffect(() => setSize({ w: String(design.width), h: String(design.height) }), [design.width, design.height]);
    const preset = SIZE_PRESETS.find((p) => p.w === design.width && p.h === design.height);
    const commit = () => patch((d) => resizeCanvas(d.design, Number(size.w), Number(size.h), meta));
    const updateSize = (axis: 'w' | 'h', value: string) => {
        const next = { ...size, [axis]: value };
        setSize(next);

        const width = Number(next.w);
        const height = Number(next.h);
        if (
            Number.isFinite(width) &&
            Number.isFinite(height) &&
            width >= meta.limits.minWidth &&
            width <= meta.limits.maxWidth &&
            height >= meta.limits.minHeight &&
            height <= meta.limits.maxHeight
        ) {
            patch((d) => resizeCanvas(d.design, width, height, meta));
        }
    };

    return (
        <Field label="ขนาดรูป (กว้าง × สูง พิกเซล)" hint="เปลี่ยนขนาดแล้วตำแหน่งรูปโปรไฟล์และข้อความจะถูกย่อ/ขยายตามให้เอง">
            <Select
                value={preset ? `${preset.w}x${preset.h}` : 'custom'}
                onValueChange={(value) => {
                    if (value === 'custom') return;
                    const [w, h] = value.split('x').map(Number);
                    patch((d) => resizeCanvas(d.design, w!, h!, meta));
                }}
            >
                <SelectTrigger className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {SIZE_PRESETS.map((p) => (
                        <SelectItem key={p.label} value={`${p.w}x${p.h}`}>
                            {p.label}
                        </SelectItem>
                    ))}
                    <SelectItem value="custom">กำหนดเอง</SelectItem>
                </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
                <Input
                    type="number"
                    aria-label="ความกว้าง"
                    min={meta.limits.minWidth}
                    max={meta.limits.maxWidth}
                    value={size.w}
                    onChange={(e) => updateSize('w', e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => e.key === 'Enter' && commit()}
                />
                ×
                <Input
                    type="number"
                    aria-label="ความสูง"
                    min={meta.limits.minHeight}
                    max={meta.limits.maxHeight}
                    value={size.h}
                    onChange={(e) => updateSize('h', e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => e.key === 'Enter' && commit()}
                />
            </div>
        </Field>
    );
}

function BackgroundSection({
    meta,
    draft,
    patch,
    assets,
    cards,
    onAssetDeleted,
}: FormProps & { assets: WelcomeAsset[]; cards: WelcomeCard[]; onAssetDeleted: (assetId: number) => void }) {
    const bg = draft.design.background;
    return (
        <div className="space-y-5">
            <SizeField meta={meta} draft={draft} patch={patch} />
            <Field label="รูปพื้นหลัง" hint="รูปในคลังใช้ร่วมกันได้ทุกการ์ด — แนะนำรูปแนวนอนขนาดใกล้เคียงกับขนาดการ์ด">
                <AssetGallery
                    meta={meta}
                    assets={assets}
                    cards={cards}
                    selectedId={draft.backgroundId}
                    backgroundColor={bg.color}
                    onSelect={(id) => patch((d) => void (d.backgroundId = id))}
                    onDeleted={onAssetDeleted}
                />
            </Field>
            <Field label="การวางรูป">
                <Segmented value={bg.fit} options={FIT_LABELS} onChange={(fit) => patch((d) => void (d.design.background.fit = fit))} />
            </Field>
            <RangeField label="ความเบลอของรูป" value={bg.blur} min={0} max={30} onChange={(blur) => patch((d) => void (d.design.background.blur = blur))} />
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="สีพื้น">
                    <ColorField value={bg.color} onChange={(color) => patch((d) => void (d.design.background.color = color))} />
                </Field>
                <Field label="สีทับรูป (ช่วยให้อ่านตัวหนังสือง่ายขึ้น)">
                    <ColorField value={bg.overlayColor} onChange={(color) => patch((d) => void (d.design.background.overlayColor = color))} />
                </Field>
            </div>
            <RangeField
                label="ความเข้มของสีทับ"
                value={Math.round(bg.overlayOpacity * 100)}
                min={0}
                max={100}
                unit="%"
                onChange={(percent) => patch((d) => void (d.design.background.overlayOpacity = percent / 100))}
            />
        </div>
    );
}

// ==========================================
// รูปโปรไฟล์ของสมาชิก
// ==========================================
function AvatarSection({ draft, patch }: FormProps) {
    const { design } = draft;
    const av = design.avatar;
    const set = (mutate: (avatar: WelcomeDesign['avatar']) => void) => patch((d) => mutate(d.design.avatar));
    return (
        <div className="space-y-5">
            <SwitchRow label="แสดงรูปโปรไฟล์ของสมาชิก" checked={av.visible} onChange={(visible) => set((a) => void (a.visible = visible))} />
            <Field label="รูปทรง">
                <Segmented value={av.shape} options={SHAPE_LABELS} onChange={(shape) => set((a) => void (a.shape = shape))} />
            </Field>
            <RangeField label="ขนาด" value={av.size} min={16} max={Math.min(design.width, design.height)} onChange={(size) => set((a) => void (a.size = size))} />
            <RangeField
                label="ตำแหน่งแนวนอน (X)"
                value={av.x}
                min={0}
                max={design.width}
                onChange={(x) => set((a) => void (a.x = x))}
                extra={<CenterButton onClick={() => set((a) => void (a.x = Math.round(design.width / 2)))} />}
            />
            <RangeField
                label="ตำแหน่งแนวตั้ง (Y)"
                value={av.y}
                min={0}
                max={design.height}
                onChange={(y) => set((a) => void (a.y = y))}
                extra={<CenterButton onClick={() => set((a) => void (a.y = Math.round(design.height / 2)))} />}
            />
            <RangeField label="ความหนาของขอบ" value={av.borderWidth} min={0} max={40} onChange={(borderWidth) => set((a) => void (a.borderWidth = borderWidth))} />
            <Field label="สีขอบ">
                <ColorField value={av.borderColor} onChange={(color) => set((a) => void (a.borderColor = color))} />
            </Field>
            <p className="text-xs text-muted-foreground">ลากรูปโปรไฟล์บนรูปตัวอย่างเพื่อย้ายตำแหน่งได้เลย</p>
        </div>
    );
}

// ==========================================
// ข้อความบนรูป (หลายชั้น) — ชั้นที่อยู่ล่างสุดในรายการจะถูกวาดทับชั้นบน
// ==========================================
function TextLayer({ meta, draft, patch, index, open, onToggle }: FormProps & { index: number; open: boolean; onToggle: () => void }) {
    const { design } = draft;
    const layer = design.texts[index]!;
    const count = design.texts.length;
    const textRef = useRef<HTMLTextAreaElement>(null);
    const set = (mutate: (layer: WelcomeDesign['texts'][number]) => void) => patch((d) => mutate(d.design.texts[index]!));
    const move = (target: number) =>
        patch((d) => {
            const texts = d.design.texts;
            [texts[index], texts[target]] = [texts[target]!, texts[index]!];
        });

    return (
        <Collapsible open={open} onOpenChange={onToggle} className={cn('rounded-lg border', open && 'border-primary/50')}>
            <div className="flex items-center gap-1 p-1.5">
                <CollapsibleTrigger asChild>
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted/50">
                        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
                        <span className="truncate text-sm">{layerTitle(layer.text)}</span>
                        <ChevronDown className={cn('ml-auto size-4 shrink-0 transition-transform', open && 'rotate-180')} />
                    </button>
                </CollapsibleTrigger>
                <Button size="icon-xs" variant="ghost" title="เลื่อนขึ้น (วาดก่อน)" disabled={index === 0} onClick={() => move(index - 1)}>
                    <ChevronUp />
                </Button>
                <Button size="icon-xs" variant="ghost" title="เลื่อนลง (วาดทับ)" disabled={index === count - 1} onClick={() => move(index + 1)}>
                    <ChevronDown />
                </Button>
                <Button
                    size="icon-xs"
                    variant="ghost"
                    title="คัดลอก"
                    disabled={count >= meta.limits.maxTexts}
                    onClick={() =>
                        patch((d) => {
                            const copy = structuredClone(layer);
                            copy.y = Math.min(d.design.height, copy.y + Math.round(copy.size * 1.2));
                            d.design.texts.splice(index + 1, 0, copy);
                        })
                    }
                >
                    <Copy />
                </Button>
                <Button size="icon-xs" variant="ghost" title="ลบข้อความนี้" onClick={() => patch((d) => void d.design.texts.splice(index, 1))}>
                    <Trash2 className="text-destructive" />
                </Button>
            </div>
            <CollapsibleContent className="space-y-4 border-t p-3">
                <Field label="ข้อความ" hint="ขึ้นบรรทัดใหม่ได้ · ข้อความที่ยาวเกิน &quot;ความกว้างสูงสุด&quot; จะถูกย่อลงเอง">
                    <Textarea ref={textRef} rows={2} maxLength={meta.limits.maxTextLength} value={layer.text} onChange={(e) => set((l) => void (l.text = e.target.value))} />
                    <PlaceholderChips
                        meta={meta}
                        onInsert={(token) => {
                            const { value, cursor } = insertAtCursor(textRef.current, layer.text, token);
                            set((l) => void (l.text = value));
                            requestAnimationFrame(() => textRef.current?.setSelectionRange(cursor, cursor));
                        }}
                    />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="ฟอนต์">
                        <Select value={layer.font} onValueChange={(font) => set((l) => void (l.font = font as WelcomeFontId))}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {meta.fonts.map((f) => (
                                    <SelectItem key={f.id} value={f.id}>
                                        {f.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="น้ำหนัก">
                        <Select value={String(layer.weight)} onValueChange={(weight) => set((l) => void (l.weight = Number(weight) as WelcomeWeight))}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {meta.weights.map((w) => (
                                    <SelectItem key={w.value} value={String(w.value)}>
                                        {w.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                </div>
                <RangeField label="ขนาดตัวอักษร" value={layer.size} min={8} max={200} onChange={(size) => set((l) => void (l.size = size))} />
                <Field label="สีตัวอักษร">
                    <ColorField value={layer.color} onChange={(color) => set((l) => void (l.color = color))} />
                </Field>
                <Field label="จัดแนว (นับจากจุดตำแหน่ง X)">
                    <Segmented value={layer.align} options={ALIGN_LABELS} onChange={(align) => set((l) => void (l.align = align))} />
                </Field>
                <RangeField
                    label="ตำแหน่งแนวนอน (X)"
                    value={layer.x}
                    min={0}
                    max={design.width}
                    onChange={(x) => set((l) => void (l.x = x))}
                    extra={<CenterButton onClick={() => set((l) => void (l.x = Math.round(design.width / 2)))} />}
                />
                <RangeField label="ตำแหน่งแนวตั้ง (Y)" value={layer.y} min={0} max={design.height} onChange={(y) => set((l) => void (l.y = y))} />
                <RangeField label="ความกว้างสูงสุด (0 = ไม่จำกัด)" value={layer.maxWidth} min={0} max={design.width} onChange={(maxWidth) => set((l) => void (l.maxWidth = maxWidth))} />
                <RangeField label="ระยะห่างตัวอักษร" value={layer.letterSpacing} min={0} max={40} onChange={(letterSpacing) => set((l) => void (l.letterSpacing = letterSpacing))} />
                <RangeField label="ขอบตัวอักษร" value={layer.strokeWidth} min={0} max={20} onChange={(strokeWidth) => set((l) => void (l.strokeWidth = strokeWidth))} />
                <Field label="สีขอบตัวอักษร">
                    <ColorField value={layer.strokeColor} onChange={(color) => set((l) => void (l.strokeColor = color))} />
                </Field>
                <SwitchRow label="เงาใต้ตัวอักษร" checked={layer.shadow} onChange={(shadow) => set((l) => void (l.shadow = shadow))} />
            </CollapsibleContent>
        </Collapsible>
    );
}

function TextsSection({ meta, draft, patch, openText, setOpenText }: FormProps & { openText: number; setOpenText: (index: number) => void }) {
    const count = draft.design.texts.length;
    return (
        <div className="space-y-3">
            <p className="text-xs text-muted-foreground">ชั้นที่อยู่ล่างสุดในรายการจะถูกวาดทับชั้นบน · ลากจุดตัวเลขบนรูปตัวอย่างเพื่อย้ายข้อความ</p>
            {count === 0 && <p className="py-4 text-center text-sm text-muted-foreground">ยังไม่มีข้อความบนรูป</p>}
            {draft.design.texts.map((_, index) => (
                <TextLayer
                    key={index}
                    meta={meta}
                    draft={draft}
                    patch={patch}
                    index={index}
                    open={openText === index}
                    onToggle={() => setOpenText(openText === index ? -1 : index)}
                />
            ))}
            <Button
                variant="secondary"
                className="w-full"
                disabled={count >= meta.limits.maxTexts}
                onClick={() => {
                    patch((d) => {
                        const { width, height } = d.design;
                        d.design.texts.push({ ...structuredClone(meta.defaultText), x: Math.round(width / 2), y: Math.round(height / 2), maxWidth: width - 80 });
                    });
                    setOpenText(count);
                }}
            >
                <Plus /> เพิ่มข้อความ ({count}/{meta.limits.maxTexts})
            </Button>
        </div>
    );
}

export function EditorForm({
    section,
    channels,
    assets,
    cards,
    openText,
    setOpenText,
    onAssetDeleted,
    ...props
}: FormProps & {
    section: Section;
    channels: GuildChannel[];
    assets: WelcomeAsset[];
    cards: WelcomeCard[];
    openText: number;
    setOpenText: (index: number) => void;
    onAssetDeleted: (assetId: number) => void;
}) {
    switch (section) {
        case 'background':
            return <BackgroundSection {...props} assets={assets} cards={cards} onAssetDeleted={onAssetDeleted} />;
        case 'avatar':
            return <AvatarSection {...props} />;
        case 'texts':
            return <TextsSection {...props} openText={openText} setOpenText={setOpenText} />;
        default:
            return <GeneralSection {...props} channels={channels} />;
    }
}
