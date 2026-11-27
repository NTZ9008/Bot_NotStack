import { tr, byLang } from '../../lib/i18n';
import type { GuildChannel, GuildRole, WeatherFieldKey, WeatherMeta, WeatherPlace } from '@notstack/shared';
import { DateTimeInput } from '@/components/date-time-input';
import { ArrowDown, ArrowUp, Loader2, MapPin, Search } from '@/components/icons';
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

export const WEATHER_SECTIONS = byLang((): { value: WeatherSection; label: string }[] => [
    { value: 'schedule', label: tr('weather.timeChannel') },
    { value: 'location', label: tr('weather.location') },
    { value: 'embed', label: tr('weather.messageData') },
    { value: 'chart', label: tr('common.charts') },
    { value: 'radar', label: tr('weather.radar') },
]);

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
            <Field label={tr('common.channelToPostIn')} hint={channels.length ? tr('weather.theBotNeedsViewChannelSend') : tr('common.theBotIsntOnlineYetSo')}>
                <ChannelSelect
                    channels={channels}
                    value={draft.channelId}
                    onChange={(channelId) => patch((d) => void (d.channelId = channelId))}
                    placeholder={tr('common.pickAChannel')}
                />
            </Field>

            <Field label={tr('weather.sendTime')} hint={tr('weather.thaiTime', { 0: meta.timezone })}>
                <DateTimeInput
                    mode="time"

                    className="max-w-40"
                    value={schedule.time}
                    onValueChange={(v) => /^\d{2}:\d{2}$/.test(v) && patch((d) => void (d.options.schedule.time = v))}
                />
            </Field>

            <Field label={tr('weather.sendOn')}>
                <div className="grid max-w-md grid-cols-7 gap-1.5">
                    {DAY_BUTTONS().map((day) => {
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
                    {DAY_PRESETS().map((preset) => (
                        <button key={preset.label} type="button" className="text-highlight hover:underline" onClick={() => setDays(preset.days)}>
                            {preset.label}
                        </button>
                    ))}
                </div>
            </Field>

            <TemplateInput
                meta={meta}
                label={tr('weather.messageSentWithTheEmbed')}
                hint={tr('weather.supportsDiscordMarkdownOnlyRolesTyped', {
                    0: draft.content.length,
                    1: meta.limits.maxContentLength,
                })}
                value={draft.content}
                max={meta.limits.maxContentLength}
                multiline
                placeholder={tr('weather.leaveEmptySendOnlyTheEmbed')}
                onChange={(content) => patch((d) => void (d.content = content))}
            />
            <Select
                value=""
                disabled={!roles.length}
                onValueChange={(roleId) => {
                    const tag = `<@&${roleId}>`;
                    patch((d) => void (d.content = (d.content ? `${d.content.trimEnd()} ${tag}` : tag).slice(0, meta.limits.maxContentLength)));
                }}
            >
                <SelectTrigger className="w-full max-w-sm">
                    <SelectValue placeholder={tr('weather.mentionARoleInTheMessage')} />
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
            toast.error(tr('weather.locationSearchFailed'), { description: errorMessage(err) });
        } finally {
            setSearching(false);
        }
    };

    const pick = (place: WeatherPlace) => {
        patch((d) => {
            d.options.location = {
                name: place.name,
                lat: Math.round(place.lat * 1e4) / 1e4,
                lon: Math.round(place.lon * 1e4) / 1e4,
                country: place.country || '',
            };
        });
        setPlaces(null);
        toast.success(tr('weather.selected', { 0: place.name }), { description: tr('weather.dontForgetToSave') });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <MapPin className="size-6 shrink-0 text-destructive" />
                <div className="min-w-0">
                    <p className="truncate font-medium">{location.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                        {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
                        {location.country && ` · ${location.country}`}
                    </p>
                </div>
            </div>

            <Field label={tr('weather.nameShownInTheReport')} hint={tr('weather.replacesTheLocationVariableRenameWithout')}>
                <Input
                    maxLength={meta.limits.maxLocationNameLength}
                    value={location.name}
                    onChange={(e) => patch((d) => void (d.options.location.name = e.target.value))}
                />
            </Field>

            <Field label={tr('weather.changeLocation')} hint={tr('weather.typeAThaiOrEnglishName')}>
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void search();
                    }}
                >
                    <Input
                        placeholder={tr('weather.eGSalayaBangkokOrCoordinates')}
                        autoComplete="off"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <Button type="submit" disabled={searching || !query.trim()}>
                        {searching ? <Loader2 className="animate-spin" /> : <Search />} {tr('common.search')}
                    </Button>
                </form>
            </Field>

            {places && (
                <div className="grid gap-2">
                    {places.length === 0 && <p className="text-sm text-muted-foreground">{tr('weather.locationNotFoundTryAnEnglish')}</p>}
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
                                {tr('common.select2')}
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
                    <div
                        key={field.key}
                        className={cn('flex items-center justify-between gap-2 rounded-lg border px-3 py-2', on ? 'border-primary/40' : 'opacity-70')}
                    >
                        <Label className="flex min-w-0 cursor-pointer items-start gap-2.5 font-normal">
                            <Checkbox className="mt-0.5" checked={on} onCheckedChange={(checked) => toggle(field.key, checked === true)} />
                            <span className="min-w-0">
                                <span className="block text-sm font-medium">{field.label}</span>
                                <span className="block text-xs text-muted-foreground">{field.hint}</span>
                            </span>
                        </Label>
                        {on && (
                            <div className="flex shrink-0 gap-1">
                                <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    aria-label={tr('common.moveUp')}
                                    disabled={index === 0}
                                    onClick={() => move(field.key, -1)}
                                >
                                    <ArrowUp />
                                </Button>
                                <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    aria-label={tr('common.moveDown')}
                                    disabled={index === selected.length - 1}
                                    onClick={() => move(field.key, 1)}
                                >
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
            <Field label={tr('common.embedLeftBarColor')}>
                <ColorField value={embed.color} onChange={(color) => patch((d) => void (d.options.embed.color = upper(color)))} className="max-w-60" />
            </Field>
            <TemplateInput
                meta={meta}
                label={tr('common.topics')}
                value={embed.title}
                max={meta.limits.maxTitleLength}
                onChange={(title) => patch((d) => void (d.options.embed.title = title))}
            />
            <SwitchRow label={tr('weather.linkTheTitleToTheCity')} checked={embed.link} onChange={(link) => patch((d) => void (d.options.embed.link = link))} />
            <TemplateInput
                meta={meta}
                label={tr('weather.descriptionUnderTheTitle')}
                hint={tr('weather.supportsDiscordMarkdownOptional')}
                value={embed.description}
                max={meta.limits.maxDescriptionLength}
                multiline
                onChange={(description) => patch((d) => void (d.options.embed.description = description))}
            />
            <Field label={tr('weather.fields', { 0: embed.fields.length, 1: meta.fields.length })} hint={tr('weather.discordShows3FieldsPerRow')}>
                <FieldList meta={meta} draft={draft} patch={patch} />
            </Field>
            <Field label={tr('common.embedFooter')} hint={tr('weather.eGDataSourceOrBot')}>
                <Input
                    maxLength={meta.limits.maxFooterLength}
                    value={embed.footer}
                    onChange={(e) => patch((d) => void (d.options.embed.footer = e.target.value))}
                />
            </Field>
            <SwitchRow
                label={tr('weather.showTheFetchTimeAtThe')}
                checked={embed.timestamp}
                onChange={(timestamp) => patch((d) => void (d.options.embed.timestamp = timestamp))}
            />
            <SwitchRow
                label={tr('weather.weatherIconInTheTopRight')}
                hint={tr('weather.whenOnDiscordShows2Fields')}
                checked={embed.thumbnail}
                onChange={(thumbnail) => patch((d) => void (d.options.embed.thumbnail = thumbnail))}
            />
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="mb-1 font-medium">{tr('weather.variablesForTheTitleDescriptionMessage')}</p>
                <ul className="grid gap-0.5 text-xs text-muted-foreground">
                    {meta.placeholders.map((p) => (
                        <li key={p.key}>
                            <code className="text-highlight">{`{${p.key}}`}</code> {p.label}
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
    const hours = Object.fromEntries(meta.chartHours.map((h) => [String(h), tr('common.hr', { 0: h })])) as Record<string, string>;
    return (
        <div className="space-y-4">
            <SwitchRow
                label={tr('weather.attachAForecastChartToThe')}
                hint={tr('weather.temperatureLineRainChanceBarsEvery')}
                checked={chart.enabled}
                onChange={(enabled) => patch((d) => void (d.options.chart.enabled = enabled))}
            />
            <fieldset disabled={!chart.enabled} className={cn('space-y-4', !chart.enabled && 'pointer-events-none opacity-50')}>
                <Field label={tr('weather.timeSpanShown')}>
                    <Segmented value={String(chart.hours)} options={hours} onChange={(value) => patch((d) => void (d.options.chart.hours = Number(value)))} />
                </Field>
                <SwitchRow
                    label={tr('weather.showRainChanceBars')}
                    checked={chart.showRain}
                    onChange={(showRain) => patch((d) => void (d.options.chart.showRain = showRain))}
                />
                <Field label={tr('weather.chartTheme')}>
                    <Segmented value={chart.theme} options={THEME_LABELS()} onChange={(theme) => patch((d) => void (d.options.chart.theme = theme))} />
                </Field>
                <Field label={tr('weather.temperatureLineColor')}>
                    <ColorField value={chart.color} onChange={(color) => patch((d) => void (d.options.chart.color = upper(color)))} className="max-w-60" />
                </Field>
            </fieldset>
        </div>
    );
}

function RadarSection({ meta, draft, patch }: FormProps) {
    const { radar } = draft.options;
    const zooms = Object.fromEntries(meta.radarZooms.map((z) => [String(z), ZOOM_LABELS()[z] ?? tr('weather.zoom', { 0: z })])) as Record<string, string>;
    const tmd = radar.source === 'tmd';
    return (
        <div className="space-y-4">
            <SwitchRow
                label={tr('weather.attachARainRadarMap')}
                hint={tr('weather.currentRainAroundTheLocationIf')}
                checked={radar.enabled}
                onChange={(enabled) => patch((d) => void (d.options.radar.enabled = enabled))}
            />
            <fieldset disabled={!radar.enabled} className={cn('space-y-4', !radar.enabled && 'pointer-events-none opacity-50')}>
                <Field
                    label={tr('weather.radarSource')}
                    hint={tmd ? tr('weather.thaiMeteorologicalDepartmentRadarNetworkAcross') : tr('weather.compositeRadarFromManyCountriesNew')}
                >
                    <Segmented
                        value={radar.source}
                        options={RADAR_SOURCE_LABELS()}
                        onChange={(source) => patch((d) => void (d.options.radar.source = source))}
                    />
                </Field>
                <SwitchRow
                    label={tr('weather.n1HourAnimationGif')}
                    hint={tr('weather.showsWhereTheRainIsMoving')}
                    checked={radar.animated}
                    onChange={(animated) => patch((d) => void (d.options.radar.animated = animated))}
                />
                <Field label={tr('weather.distanceShown')} hint={tr('weather.imageWidthRegional700KmMedium', { 0: tmd ? '800' : '600' })}>
                    <Segmented value={String(radar.zoom)} options={zooms} onChange={(value) => patch((d) => void (d.options.radar.zoom = Number(value)))} />
                </Field>
                <Field label={tr('weather.mapTheme')}>
                    <Segmented value={radar.theme} options={THEME_LABELS()} onChange={(theme) => patch((d) => void (d.options.radar.theme = theme))} />
                </Field>
            </fieldset>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="mb-1 font-medium">{tr('weather.aboutTheRadar')}</p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                    <li>{tr('weather.showsRainAtSendTimeAnd')}</li>
                    {tmd ? (
                        <>
                            <li>{tr('weather.radarImagesUpdateEvery15Minutes')}</li>
                            <li>{tr('weather.ifTmdRadarCantBeFetched')}</li>
                        </>
                    ) : (
                        <li>{tr('weather.radarImagesUpdateEvery10Minutes')}</li>
                    )}
                    <li>{tr('weather.ifTheRadarCantBeFetched')}</li>
                </ul>
            </div>
        </div>
    );
}

export function WeatherForm({ section, channels, roles, ...props }: FormProps & { section: WeatherSection; channels: GuildChannel[]; roles: GuildRole[] }) {
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
