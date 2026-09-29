import type { GuildChannel, GuildRole, WeatherFieldKey, WeatherMeta, WeatherPlace } from '@notstack/shared';
import { ArrowDown, ArrowUp, Loader2, MapPin, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { weatherApi } from '@/api/weather';
import { ChannelSelect } from '@/components/channel-select';
import { ColorField } from '@/components/color-field';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { insertAtCursor, PlaceholderChips, Segmented } from '@/features/welcome/form-controls';
import { useGuildId } from '@/hooks/use-guild';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DAY_BUTTONS, DAY_PRESETS, RADAR_SOURCE_LABELS, THEME_LABELS, ZOOM_LABELS, type PatchWeather, type WeatherDraft } from './types';

export type WeatherSection = 'schedule' | 'location' | 'embed' | 'chart' | 'radar';

export const WEATHER_SECTIONS: { value: WeatherSection; label: string }[] = [
    { value: 'schedule', label: 'เวลา & ห้อง' },
    { value: 'location', label: 'สถานที่' },
    { value: 'embed', label: 'ข้อความ & ข้อมูล' },
    { value: 'chart', label: 'กราฟ' },
    { value: 'radar', label: 'เรดาร์' },
];

interface FormProps {
    meta: WeatherMeta;
    draft: WeatherDraft;
    patch: PatchWeather;
}

// สีเก็บเป็นตัวพิมพ์ใหญ่เหมือนที่ server เก็บ — เทียบว่ามีการแก้ไขได้ตรง
const upper = (value: string) => value.toUpperCase();

function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
    return (
        <Label className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 font-normal">
            <span>
                {label}
                {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
            </span>
            <Switch checked={checked} onCheckedChange={onChange} />
        </Label>
    );
}

// ช่องข้อความที่มีปุ่มแทรกตัวแปร {location} {date} ... ตรงตำแหน่งเคอร์เซอร์
function TemplateInput({
    meta,
    label,
    hint,
    value,
    max,
    multiline,
    rows = 3,
    placeholder,
    onChange,
}: {
    meta: WeatherMeta;
    label: string;
    hint?: string;
    value: string;
    max: number;
    multiline?: boolean;
    rows?: number;
    placeholder?: string;
    onChange: (value: string) => void;
}) {
    const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
    const insert = (token: string) => {
        const { value: next, cursor } = insertAtCursor(ref.current, value, token);
        onChange(next.slice(0, max));
        requestAnimationFrame(() => {
            ref.current?.focus();
            ref.current?.setSelectionRange(cursor, cursor);
        });
    };
    return (
        <Field label={label} hint={hint}>
            {multiline ? (
                <Textarea ref={ref} rows={rows} maxLength={max} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
            ) : (
                <Input ref={ref} maxLength={max} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
            )}
            <PlaceholderChips meta={meta} onInsert={insert} />
        </Field>
    );
}

// ==========================================
// เวลา & ห้อง
// ==========================================
function ScheduleSection({ meta, draft, patch, channels, roles }: FormProps & { channels: GuildChannel[]; roles: GuildRole[] }) {
    const { schedule } = draft.options;
    const setDays = (days: number[]) => patch((d) => void (d.options.schedule.days = [...new Set(days)].sort((a, b) => a - b)));
    return (
        <div className="space-y-4">
            <Field label="ห้องที่จะส่ง" hint={channels.length ? 'บอทต้องมีสิทธิ์ดูห้อง ส่งข้อความ ฝังลิงก์ และแนบไฟล์ (สำหรับรูปกราฟ/เรดาร์) ในห้องนี้' : 'บอทยังไม่ออนไลน์ จึงยังโหลดรายชื่อห้องไม่ได้'}>
                <ChannelSelect channels={channels} value={draft.channelId} onChange={(channelId) => patch((d) => void (d.channelId = channelId))} placeholder="— เลือกห้องที่จะส่ง —" />
            </Field>

            <Field label="เวลาที่ส่ง" hint={`เวลาไทย (${meta.timezone})`}>
                <Input
                    type="time"
                    step={60}
                    className="max-w-40"
                    value={schedule.time}
                    onChange={(e) => /^\d{2}:\d{2}$/.test(e.target.value) && patch((d) => void (d.options.schedule.time = e.target.value))}
                />
            </Field>

            <Field label="วันที่ส่ง">
                <div className="grid max-w-md grid-cols-7 gap-1.5">
                    {DAY_BUTTONS.map((day) => {
                        const on = schedule.days.includes(day.value);
                        return (
                            <Button
                                key={day.value}
                                type="button"
                                size="sm"
                                variant={on ? 'default' : 'outline'}
                                aria-pressed={on}
                                onClick={() => setDays(on ? schedule.days.filter((d) => d !== day.value) : [...schedule.days, day.value])}
                            >
                                {day.label}
                            </Button>
                        );
                    })}
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs">
                    {DAY_PRESETS.map((preset) => (
                        <button key={preset.label} type="button" className="text-indigo-300 hover:underline" onClick={() => setDays(preset.days)}>
                            {preset.label}
                        </button>
                    ))}
                </div>
            </Field>

            <TemplateInput
                meta={meta}
                label="ข้อความที่ส่งคู่กับ embed"
                hint={`รองรับ Markdown ของ Discord · แท็กได้เฉพาะยศที่ใส่ไว้ในข้อความ (@everyone / @here จะไม่ทำงาน) · ${draft.content.length}/${meta.limits.maxContentLength}`}
                value={draft.content}
                max={meta.limits.maxContentLength}
                multiline
                placeholder="เว้นว่างไว้ = ส่งแค่ embed"
                onChange={(content) => patch((d) => void (d.content = content))}
            />
            <Select
                value=""
                disabled={!roles.length}
                onValueChange={(roleId) => {
                    const tag = `<@&${roleId}>`;
                    patch((d) => void (d.content = (d.content ? `${d.content.replace(/\s+$/, '')} ${tag}` : tag).slice(0, meta.limits.maxContentLength)));
                }}
            >
                <SelectTrigger className="w-full max-w-sm">
                    <SelectValue placeholder="+ แท็กยศในข้อความ..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                    {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                            @{role.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

// ==========================================
// สถานที่ — ค้นหาชื่อ (ไทย/อังกฤษ) หรือวางพิกัดจาก Google Maps
// ==========================================
function LocationSection({ meta, draft, patch }: FormProps) {
    const guildId = useGuildId();
    const { location } = draft.options;
    const [query, setQuery] = useState('');
    const [places, setPlaces] = useState<WeatherPlace[] | null>(null);
    const [searching, setSearching] = useState(false);

    const search = async () => {
        const q = query.trim();
        if (!q) return;
        setSearching(true);
        try {
            setPlaces(await weatherApi.searchLocations(guildId, q));
        } catch (err) {
            setPlaces(null);
            toast.error('ค้นหาสถานที่ไม่สำเร็จ', { description: errorMessage(err) });
        } finally {
            setSearching(false);
        }
    };

    const pick = (place: WeatherPlace) => {
        patch((d) => {
            d.options.location = { name: place.name, lat: Math.round(place.lat * 1e4) / 1e4, lon: Math.round(place.lon * 1e4) / 1e4, country: place.country || '' };
        });
        setPlaces(null);
        toast.success(`เลือก "${place.name}" แล้ว`, { description: 'อย่าลืมกดบันทึก' });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <MapPin className="size-6 shrink-0 text-rose-400" />
                <div className="min-w-0">
                    <p className="truncate font-medium">{location.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                        {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
                        {location.country && ` · ${location.country}`}
                    </p>
                </div>
            </div>

            <Field label="ชื่อที่แสดงในรายงาน" hint='ใช้แทนตัวแปร {location} — เปลี่ยนชื่อได้โดยไม่ต้องค้นหาใหม่ (เช่น "ม.มหิดล ศาลายา")'>
                <Input maxLength={meta.limits.maxLocationNameLength} value={location.name} onChange={(e) => patch((d) => void (d.options.location.name = e.target.value))} />
            </Field>

            <Field label="เปลี่ยนสถานที่" hint="พิมพ์ชื่อภาษาไทยหรืออังกฤษ หรือคัดลอกพิกัดจาก Google Maps มาวางเพื่อความแม่นยำ">
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void search();
                    }}
                >
                    <Input placeholder="เช่น ศาลายา, Bangkok หรือพิกัด 13.7946, 100.3234" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
                    <Button type="submit" disabled={searching || !query.trim()}>
                        {searching ? <Loader2 className="animate-spin" /> : <Search />} ค้นหา
                    </Button>
                </form>
            </Field>

            {places && (
                <div className="grid gap-2">
                    {places.length === 0 && <p className="text-sm text-muted-foreground">ไม่พบสถานที่นี้ — ลองพิมพ์ชื่อภาษาอังกฤษ หรือวางพิกัดแทน</p>}
                    {places.map((place, i) => (
                        <div key={`${place.lat},${place.lon},${i}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                            <div className="min-w-0">
                                <p className="truncate font-medium">{place.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {[place.nameEn !== place.name ? place.nameEn : '', place.state, place.country].filter(Boolean).join(' · ')}
                                </p>
                                <p className="font-mono text-xs text-muted-foreground">
                                    {place.lat.toFixed(4)}, {place.lon.toFixed(4)}
                                </p>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => pick(place)}>
                                เลือก
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ==========================================
// ข้อความ & ช่องข้อมูลของ embed
// ==========================================
function FieldList({ meta, draft, patch }: FormProps) {
    const selected = draft.options.embed.fields;
    const byKey = new Map(meta.fields.map((f) => [f.key as string, f]));
    // ช่องที่เลือกไว้ตามลำดับที่ตั้ง แล้วต่อด้วยช่องที่ยังไม่ได้เลือก
    const ordered = [...selected.map((key) => byKey.get(key)!), ...meta.fields.filter((f) => !selected.includes(f.key))];
    const toggle = (key: WeatherFieldKey, on: boolean) =>
        patch((d) => {
            const fields = d.options.embed.fields.filter((k) => k !== key);
            if (on) fields.push(key);
            d.options.embed.fields = fields;
        });
    const move = (key: WeatherFieldKey, dir: -1 | 1) =>
        patch((d) => {
            const fields = d.options.embed.fields;
            const from = fields.indexOf(key);
            const to = from + dir;
            if (from === -1 || to < 0 || to >= fields.length) return;
            [fields[from], fields[to]] = [fields[to]!, fields[from]!];
        });

    return (
        <div className="grid gap-1.5">
            {ordered.map((field) => {
                const index = selected.indexOf(field.key);
                const on = index !== -1;
                return (
                    <div key={field.key} className={cn('flex items-center justify-between gap-2 rounded-lg border px-3 py-2', on ? 'border-primary/40' : 'opacity-70')}>
                        <Label className="flex min-w-0 cursor-pointer items-start gap-2.5 font-normal">
                            <Checkbox className="mt-0.5" checked={on} onCheckedChange={(checked) => toggle(field.key, checked === true)} />
                            <span className="min-w-0">
                                <span className="block text-sm font-medium">{field.label}</span>
                                <span className="block text-xs text-muted-foreground">{field.hint}</span>
                            </span>
                        </Label>
                        {on && (
                            <div className="flex shrink-0 gap-1">
                                <Button size="icon-xs" variant="ghost" aria-label="เลื่อนขึ้น" disabled={index === 0} onClick={() => move(field.key, -1)}>
                                    <ArrowUp />
                                </Button>
                                <Button size="icon-xs" variant="ghost" aria-label="เลื่อนลง" disabled={index === selected.length - 1} onClick={() => move(field.key, 1)}>
                                    <ArrowDown />
                                </Button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function EmbedSection({ meta, draft, patch }: FormProps) {
    const { embed } = draft.options;
    return (
        <div className="space-y-4">
            <Field label="สีแถบด้านซ้ายของ embed">
                <ColorField value={embed.color} onChange={(color) => patch((d) => void (d.options.embed.color = upper(color)))} className="max-w-60" />
            </Field>
            <TemplateInput meta={meta} label="หัวข้อ" value={embed.title} max={meta.limits.maxTitleLength} onChange={(title) => patch((d) => void (d.options.embed.title = title))} />
            <SwitchRow label="ทำหัวข้อเป็นลิงก์ไปหน้าเมืองบน OpenWeatherMap" checked={embed.link} onChange={(link) => patch((d) => void (d.options.embed.link = link))} />
            <TemplateInput
                meta={meta}
                label="รายละเอียด (ใต้หัวข้อ)"
                hint="รองรับ Markdown ของ Discord · เว้นว่างได้"
                value={embed.description}
                max={meta.limits.maxDescriptionLength}
                multiline
                onChange={(description) => patch((d) => void (d.options.embed.description = description))}
            />
            <Field label={`ช่องข้อมูล (${embed.fields.length}/${meta.fields.length})`} hint="Discord เรียงช่องข้อมูลแถวละ 3 ช่อง — เลือก 3, 6 หรือ 9 ช่องจะได้ตารางเต็มแถวพอดี">
                <FieldList meta={meta} draft={draft} patch={patch} />
            </Field>
            <Field label="ข้อความท้าย embed" hint="เช่น แหล่งข้อมูล หรือเครดิตผู้ทำบอท (Discord แสดงเป็นตัวหนังสือเล็ก ไม่รองรับ Markdown)">
                <Input maxLength={meta.limits.maxFooterLength} value={embed.footer} onChange={(e) => patch((d) => void (d.options.embed.footer = e.target.value))} />
            </Field>
            <SwitchRow label="แสดงวันเวลาที่ดึงข้อมูลท้าย embed" checked={embed.timestamp} onChange={(timestamp) => patch((d) => void (d.options.embed.timestamp = timestamp))} />
            <SwitchRow
                label="รูปไอคอนสภาพอากาศมุมขวาบน"
                hint="เมื่อเปิด Discord จะเรียงช่องข้อมูลแถวละ 2 ช่องแทน 3"
                checked={embed.thumbnail}
                onChange={(thumbnail) => patch((d) => void (d.options.embed.thumbnail = thumbnail))}
            />
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="mb-1 font-medium">ตัวแปรที่ใช้ได้ในหัวข้อ / รายละเอียด / ข้อความคู่ embed</p>
                <ul className="grid gap-0.5 text-xs text-muted-foreground">
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
// กราฟพยากรณ์ / แผนที่เรดาร์ฝน
// ==========================================
function ChartSection({ meta, draft, patch }: FormProps) {
    const { chart } = draft.options;
    const hours = Object.fromEntries(meta.chartHours.map((h) => [String(h), `${h} ชม.`])) as Record<string, string>;
    return (
        <div className="space-y-4">
            <SwitchRow
                label="แนบกราฟพยากรณ์ใน embed"
                hint="เส้นอุณหภูมิ + แท่งโอกาสฝนตก ทุก 3 ชั่วโมง"
                checked={chart.enabled}
                onChange={(enabled) => patch((d) => void (d.options.chart.enabled = enabled))}
            />
            <fieldset disabled={!chart.enabled} className={cn('space-y-4', !chart.enabled && 'pointer-events-none opacity-50')}>
                <Field label="ช่วงเวลาที่แสดง">
                    <Segmented value={String(chart.hours)} options={hours} onChange={(value) => patch((d) => void (d.options.chart.hours = Number(value)))} />
                </Field>
                <SwitchRow label="แสดงแท่งโอกาสฝนตก" checked={chart.showRain} onChange={(showRain) => patch((d) => void (d.options.chart.showRain = showRain))} />
                <Field label="ธีมของกราฟ">
                    <Segmented value={chart.theme} options={THEME_LABELS} onChange={(theme) => patch((d) => void (d.options.chart.theme = theme))} />
                </Field>
                <Field label="สีเส้นอุณหภูมิ">
                    <ColorField value={chart.color} onChange={(color) => patch((d) => void (d.options.chart.color = upper(color)))} className="max-w-60" />
                </Field>
            </fieldset>
        </div>
    );
}

function RadarSection({ meta, draft, patch }: FormProps) {
    const { radar } = draft.options;
    const zooms = Object.fromEntries(meta.radarZooms.map((z) => [String(z), ZOOM_LABELS[z] ?? `ซูม ${z}`])) as Record<string, string>;
    const tmd = radar.source === 'tmd';
    return (
        <div className="space-y-4">
            <SwitchRow
                label="แนบแผนที่เรดาร์ฝน"
                hint="ฝนที่กำลังตกรอบสถานที่ — ถ้าเปิดกราฟด้วย เรดาร์จะอยู่ embed ที่ 2 ต่อจากกราฟ"
                checked={radar.enabled}
                onChange={(enabled) => patch((d) => void (d.options.radar.enabled = enabled))}
            />
            <fieldset disabled={!radar.enabled} className={cn('space-y-4', !radar.enabled && 'pointer-events-none opacity-50')}>
                <Field
                    label="แหล่งข้อมูลเรดาร์"
                    hint={
                        tmd
                            ? 'เครือข่ายเรดาร์ของกรมอุตุฯ ทั่วไทย ภาพใหม่ทุก 15 นาที (ช้ากว่าเวลาจริงราว 15-30 นาที) · ครอบคลุมเฉพาะไทยและประเทศใกล้เคียง'
                            : 'ภาพเรดาร์รวมจากหลายประเทศ ภาพใหม่ทุก 10 นาที · ใช้ได้ทั่วโลก'
                    }
                >
                    <Segmented value={radar.source} options={RADAR_SOURCE_LABELS} onChange={(source) => patch((d) => void (d.options.radar.source = source))} />
                </Field>
                <SwitchRow
                    label="ภาพเคลื่อนไหวย้อนหลัง 1 ชั่วโมง (GIF)"
                    hint="เห็นทิศทางที่ฝนเคลื่อน · ปิด = ภาพนิ่งของภาพล่าสุด (PNG)"
                    checked={radar.animated}
                    onChange={(animated) => patch((d) => void (d.options.radar.animated = animated))}
                />
                <Field
                    label="ระยะที่แสดง"
                    hint={`ความกว้างของภาพ: ภูมิภาค ~700 กม. · กลาง ~350 กม. · ใกล้ ~180 กม. — ยิ่งใกล้ขอบฝนยิ่งเบลอ (ข้อมูลเรดาร์ละเอียดราว ${tmd ? '800' : '600'} ม. ต่อจุด)`}
                >
                    <Segmented value={String(radar.zoom)} options={zooms} onChange={(value) => patch((d) => void (d.options.radar.zoom = Number(value)))} />
                </Field>
                <Field label="ธีมของแผนที่">
                    <Segmented value={radar.theme} options={THEME_LABELS} onChange={(theme) => patch((d) => void (d.options.radar.theme = theme))} />
                </Field>
            </fieldset>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="mb-1 font-medium">เกี่ยวกับเรดาร์</p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                    <li>แสดงฝนที่ตก ณ ตอนส่งและย้อนหลัง ไม่ใช่พยากรณ์ — วันที่ฟ้าโปร่งภาพจะเป็นแผนที่เปล่า</li>
                    {tmd ? (
                        <>
                            <li>ภาพเรดาร์อัปเดตทุก 15 นาที จากระบบ RADARGIS ของกรมอุตุนิยมวิทยา · แผนที่ © OpenStreetMap contributors</li>
                            <li>ถ้าดึงเรดาร์ของกรมอุตุฯ ไม่ได้ หรือสถานที่อยู่นอกประเทศไทย จะใช้ภาพจาก RainViewer แทนอัตโนมัติ</li>
                        </>
                    ) : (
                        <li>ภาพเรดาร์อัปเดตทุก 10 นาที จาก RainViewer · แผนที่ © OpenStreetMap contributors</li>
                    )}
                    <li>ถ้าดึงเรดาร์ไม่ได้ รายงานยังส่งได้ตามปกติ แค่ไม่มีภาพเรดาร์</li>
                </ul>
            </div>
        </div>
    );
}

export function WeatherForm({
    section,
    channels,
    roles,
    ...props
}: FormProps & { section: WeatherSection; channels: GuildChannel[]; roles: GuildRole[] }) {
    switch (section) {
        case 'schedule':
            return <ScheduleSection {...props} channels={channels} roles={roles} />;
        case 'location':
            return <LocationSection {...props} />;
        case 'embed':
            return <EmbedSection {...props} />;
        case 'chart':
            return <ChartSection {...props} />;
        case 'radar':
            return <RadarSection {...props} />;
    }
}
