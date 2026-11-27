import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Spinner } from '@/components/ui/spinner';
import {
    HEX_COLOR_RE,
    REMINDER_DAYS,
    REMINDER_DEFAULT_EMBED_COLOR,
    REMINDER_LIMITS,
    REMINDER_SCHEDULE_TYPES,
    REMINDER_TIMEZONE,
    buildDailyCron,
    buildWeeklyCron,
    formatBangkokDateTimeInput,
    parseDailyCron,
    parseWeeklyCron,
    reminderInputSchema,
    type CreateReminderInput,
    type GuildChannel,
    type GuildRole,
    type ReminderScheduleType,
    type ScheduledReminderItem,
    type UpdateReminderInput,
} from '@notstack/shared';
import { ChannelSelect } from '@/components/channel-select';
import { ColorField } from '@/components/color-field';
import { DateTimeInput } from '@/components/date-time-input';
import { DiscordMessage } from '@/components/discord-message';
import { Field } from '@/components/field';
import {} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { applyMarkdown, MarkdownToolbar, type MarkdownAction } from '@/features/news/markdown-toolbar';
import { renderDiscordMarkdown } from '@/lib/discord-markdown';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const NO_ROLE = '__none__';
const SHORTCUTS: Record<string, MarkdownAction> = { b: 'bold', i: 'italic', u: 'underline' };

const defaultOnceValue = () => formatBangkokDateTimeInput(new Date(Date.now() + 60 * 60 * 1000));

export interface ReminderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    reminder: ScheduledReminderItem | null;
    channels: GuildChannel[];
    roles: GuildRole[];
    busy: boolean;
    onSubmit: (payload: CreateReminderInput | UpdateReminderInput) => Promise<void>;
}

export function ReminderDialog({ open, onOpenChange, reminder, channels, roles, busy, onSubmit }: ReminderDialogProps) {
    const t = useT();
    const sendableChannels = channels.filter((ch) => ch.sendable);

    const [title, setTitle] = useState('');
    const [channelId, setChannelId] = useState('');
    const [mentionRoleId, setMentionRoleId] = useState('');
    const [message, setMessage] = useState('');
    const [useEmbed, setUseEmbed] = useState(true);
    const [embedColor, setEmbedColor] = useState<string>(REMINDER_DEFAULT_EMBED_COLOR);
    const [scheduleType, setScheduleType] = useState<ReminderScheduleType>('DAILY');
    const [onceDateTime, setOnceDateTime] = useState(defaultOnceValue);
    const [dailyTime, setDailyTime] = useState('09:00');
    const [weeklyTime, setWeeklyTime] = useState('09:00');
    const [weeklyDays, setWeeklyDays] = useState<number[]>([1]);
    const [cronExpression, setCronExpression] = useState('0 9 * * 1-5');
    const [enabled, setEnabled] = useState(true);
    const [formError, setFormError] = useState<string | null>(null);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const pendingSelection = useRef<[number, number] | null>(null);

    useLayoutEffect(() => {
        if (pendingSelection.current && textareaRef.current) {
            textareaRef.current.setSelectionRange(...pendingSelection.current);
            pendingSelection.current = null;
        }
    }, [message]);

    useEffect(() => {
        if (!open) return;
        if (reminder) {
            setTitle(reminder.title);
            setChannelId(reminder.channelId);
            setMentionRoleId(reminder.mentionRoleId ?? '');
            setMessage(reminder.message);
            setUseEmbed(reminder.useEmbed);
            setEmbedColor(reminder.embedColor ?? REMINDER_DEFAULT_EMBED_COLOR);
            setScheduleType(reminder.scheduleType);
            setEnabled(reminder.enabled);
            setOnceDateTime(reminder.runAt ? formatBangkokDateTimeInput(reminder.runAt) : defaultOnceValue());

            if (reminder.scheduleType === 'DAILY') {
                setDailyTime(parseDailyCron(reminder.cronExpression) ?? '09:00');
            } else {
                setDailyTime('09:00');
            }

            if (reminder.scheduleType === 'WEEKLY') {
                const parsed = parseWeeklyCron(reminder.cronExpression);
                setWeeklyTime(parsed?.time ?? '09:00');
                setWeeklyDays(parsed?.days.length ? parsed.days : [1]);
            } else {
                setWeeklyTime('09:00');
                setWeeklyDays([1]);
            }

            setCronExpression(reminder.cronExpression ?? '0 9 * * 1-5');
        } else {
            setTitle('');
            setChannelId(channels.find((ch) => ch.sendable)?.id ?? '');
            setMentionRoleId('');
            setMessage('');
            setUseEmbed(true);
            setEmbedColor(REMINDER_DEFAULT_EMBED_COLOR);
            setScheduleType('DAILY');
            setOnceDateTime(defaultOnceValue());
            setDailyTime('09:00');
            setWeeklyTime('09:00');
            setWeeklyDays([1]);
            setCronExpression('0 9 * * 1-5');
            setEnabled(true);
        }
        setFormError(null);
    }, [open, reminder, channels]);

    const apply = (action: MarkdownAction) => {
        const area = textareaRef.current;
        if (!area) return;
        const result = applyMarkdown(message, area.selectionStart, area.selectionEnd, action);
        pendingSelection.current = result.selection;
        setMessage(result.value);
    };

    const toggleDay = (day: number) => {
        setWeeklyDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (scheduleType === 'WEEKLY' && weeklyDays.length === 0) {
            setFormError(t('reminders.selectAtLeastOneDay'));
            return;
        }

        const resolvedCron =
            scheduleType === 'DAILY'
                ? buildDailyCron(dailyTime)
                : scheduleType === 'WEEKLY'
                  ? buildWeeklyCron(weeklyTime, weeklyDays)
                  : scheduleType === 'CRON'
                    ? cronExpression.trim()
                    : null;

        const parsed = reminderInputSchema.safeParse({
            title,
            channelId,
            message,
            useEmbed,
            embedColor: useEmbed ? embedColor : null,
            mentionRoleId: mentionRoleId || null,
            scheduleType,
            cronExpression: resolvedCron,
            runAt: scheduleType === 'ONCE' ? onceDateTime : null,
            timezone: REMINDER_TIMEZONE,
            enabled,
        });

        if (!parsed.success) {
            setFormError(parsed.error.issues[0]?.message ?? t('reminders.invalidInput'));
            return;
        }

        setFormError(null);
        await onSubmit(parsed.data);
    };

    const roleMissing = Boolean(mentionRoleId && !roles.some((r) => r.id === mentionRoleId));
    const selectedRoleName = mentionRoleId ? (roles.find((r) => r.id === mentionRoleId)?.name ?? mentionRoleId) : null;
    const previewColor = HEX_COLOR_RE.test(embedColor) ? embedColor : REMINDER_DEFAULT_EMBED_COLOR;

    const scheduleLabel = (type: ReminderScheduleType) => {
        switch (type) {
            case 'ONCE':
                return t('reminders.scheduleOnce');
            case 'DAILY':
                return t('reminders.scheduleDaily');
            case 'WEEKLY':
                return t('reminders.scheduleWeekly');
            case 'CRON':
                return t('reminders.scheduleCron');
        }
    };

    const dayLabel = (day: number) => {
        switch (day) {
            case 0:
                return t('reminders.day0');
            case 1:
                return t('reminders.day1');
            case 2:
                return t('reminders.day2');
            case 3:
                return t('reminders.day3');
            case 4:
                return t('reminders.day4');
            case 5:
                return t('reminders.day5');
            default:
                return t('reminders.day6');
        }
    };

    const cronPresets = [
        { label: t('reminders.presetDaily09'), expr: '0 9 * * *' },
        { label: t('reminders.presetWeekdays09'), expr: '0 9 * * 1-5' },
        { label: t('reminders.presetFri18'), expr: '0 18 * * 5' },
        { label: t('reminders.presetMonthly01'), expr: '0 9 1 * *' },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>{reminder ? t('reminders.editReminder') : t('reminders.addReminder')}</DialogTitle>
                    <DialogDescription>{t('reminders.dialogDescription')}</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                        <div className="space-y-4">
                            <Field label={t('reminders.titleLabel')} htmlFor="reminder-title">
                                <Input
                                    id="reminder-title"
                                    value={title}
                                    maxLength={REMINDER_LIMITS.maxTitleLength}
                                    placeholder={t('reminders.titlePlaceholder')}
                                    onChange={(e) => setTitle(e.target.value)}
                                    disabled={busy}
                                />
                            </Field>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label={t('reminders.channelLabel')} htmlFor="reminder-channel">
                                    <ChannelSelect
                                        id="reminder-channel"
                                        channels={sendableChannels}
                                        value={channelId}
                                        onChange={setChannelId}
                                        disabled={busy}
                                    />
                                </Field>

                                <Field label={t('reminders.mentionRole')} hint={t('reminders.mentionRoleHint')}>
                                    <Select value={mentionRoleId || NO_ROLE} onValueChange={(v) => setMentionRoleId(v === NO_ROLE ? '' : v)} disabled={busy}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-72">
                                            <SelectItem value={NO_ROLE}>{t('reminders.noMentionRole')}</SelectItem>
                                            {roles.map((role) => (
                                                <SelectItem key={role.id} value={role.id}>
                                                    @{role.name}
                                                </SelectItem>
                                            ))}
                                            {roleMissing && (
                                                <SelectItem value={mentionRoleId}>{t('common.notFoundInDiscord', { 0: mentionRoleId })}</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </Field>
                            </div>

                            <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3.5">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Field label={t('reminders.scheduleType')}>
                                        <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as ReminderScheduleType)} disabled={busy}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {REMINDER_SCHEDULE_TYPES.map((type) => (
                                                    <SelectItem key={type} value={type}>
                                                        {scheduleLabel(type)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </Field>

                                    {scheduleType === 'ONCE' && (
                                        <Field label={t('reminders.onceDateTime')} hint={t('reminders.onceDateTimeHint')}>
                                            <DateTimeInput mode="datetime" value={onceDateTime} onValueChange={setOnceDateTime} disabled={busy} />
                                        </Field>
                                    )}

                                    {scheduleType === 'DAILY' && (
                                        <Field label={t('reminders.scheduleTime')} hint={t('reminders.timezoneNote')}>
                                            <DateTimeInput mode="time" value={dailyTime} onValueChange={setDailyTime} disabled={busy} />
                                        </Field>
                                    )}

                                    {scheduleType === 'WEEKLY' && (
                                        <Field label={t('reminders.scheduleTime')} hint={t('reminders.timezoneNote')}>
                                            <DateTimeInput mode="time" value={weeklyTime} onValueChange={setWeeklyTime} disabled={busy} />
                                        </Field>
                                    )}
                                </div>

                                {scheduleType === 'WEEKLY' && (
                                    <Field label={t('reminders.weeklyDays')}>
                                        <div className="flex flex-wrap gap-1.5">
                                            {REMINDER_DAYS.map((day) => {
                                                const active = weeklyDays.includes(day);
                                                return (
                                                    <Button
                                                        key={day}
                                                        type="button"
                                                        size="sm"
                                                        variant={active ? 'default' : 'outline'}
                                                        aria-pressed={active}
                                                        disabled={busy}
                                                        onClick={() => toggleDay(day)}
                                                        className="h-8 min-w-10 px-2.5 text-xs"
                                                    >
                                                        {dayLabel(day)}
                                                    </Button>
                                                );
                                            })}
                                        </div>
                                    </Field>
                                )}

                                {scheduleType === 'CRON' && (
                                    <div className="space-y-2">
                                        <Field label={t('reminders.cronExpression')} htmlFor="reminder-cron" hint={t('reminders.cronHint')}>
                                            <Input
                                                id="reminder-cron"
                                                value={cronExpression}
                                                maxLength={REMINDER_LIMITS.maxCronLength}
                                                placeholder="0 9 * * 1-5"
                                                className="font-mono"
                                                spellCheck={false}
                                                onChange={(e) => setCronExpression(e.target.value)}
                                                disabled={busy}
                                            />
                                        </Field>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-[11px] text-muted-foreground">{t('reminders.cronPresets')}:</span>
                                            {cronPresets.map((preset) => (
                                                <button
                                                    key={preset.expr}
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => setCronExpression(preset.expr)}
                                                    className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <Field
                                label={t('reminders.messageLabel')}
                                htmlFor="reminder-message"
                                hint={
                                    <span className={cn(message.length > REMINDER_LIMITS.maxMessageLength && 'text-destructive')}>
                                        {t('reminders.supportsMarkdownCount', { 0: message.length, 1: REMINDER_LIMITS.maxMessageLength })}
                                    </span>
                                }
                            >
                                <div>
                                    <MarkdownToolbar textareaRef={textareaRef} onApply={apply} />
                                    <Textarea
                                        id="reminder-message"
                                        ref={textareaRef}
                                        rows={6}
                                        className="rounded-t-none"
                                        maxLength={REMINDER_LIMITS.maxMessageLength}
                                        placeholder={t('reminders.messagePlaceholder')}
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        onKeyDown={(e) => {
                                            const action = SHORTCUTS[e.key.toLowerCase()];
                                            if ((e.ctrlKey || e.metaKey) && action) {
                                                e.preventDefault();
                                                apply(action);
                                            }
                                        }}
                                        disabled={busy}
                                    />
                                </div>
                            </Field>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 px-3.5 py-2.5">
                                    <div className="pr-2">
                                        <div className="text-xs font-medium text-foreground">{t('reminders.useEmbed')}</div>
                                        <div className="text-[11px] text-muted-foreground">{t('reminders.useEmbedHint')}</div>
                                    </div>
                                    <Switch checked={useEmbed} onCheckedChange={setUseEmbed} disabled={busy} />
                                </div>

                                <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 px-3.5 py-2.5">
                                    <div className="pr-2">
                                        <div className="text-xs font-medium text-foreground">{t('reminders.enableReminder')}</div>
                                        <div className="text-[11px] text-muted-foreground">{t('reminders.enableReminderHint')}</div>
                                    </div>
                                    <Switch checked={enabled} onCheckedChange={setEnabled} disabled={busy} />
                                </div>
                            </div>

                            {useEmbed && (
                                <Field label={t('reminders.embedColor')} htmlFor="reminder-embed-color">
                                    <ColorField id="reminder-embed-color" value={previewColor} onChange={setEmbedColor} />
                                </Field>
                            )}
                        </div>

                        <div className="space-y-2.5 lg:sticky lg:top-0 lg:self-start">
                            <p className="text-xs font-medium text-muted-foreground">{t('reminders.previewTitle')}</p>
                            <DiscordMessage>
                                {selectedRoleName && (
                                    <div className="mb-1">
                                        <span className="inline-block rounded bg-[#5865f2]/30 px-1 py-0.5 text-xs font-medium text-[#c9cdfb]">
                                            @{selectedRoleName}
                                        </span>
                                    </div>
                                )}
                                {useEmbed ? (
                                    <div className="dark max-w-lg rounded border-l-4 bg-[#2b2d31] p-3" style={{ borderLeftColor: previewColor }}>
                                        {title.trim() && <p className="mb-1 font-semibold text-white">{title.trim()}</p>}
                                        {message.trim() ? (
                                            <div className="discord-md text-sm" dangerouslySetInnerHTML={{ __html: renderDiscordMarkdown(message) }} />
                                        ) : (
                                            <p className="text-sm text-[#949ba4] italic">{t('reminders.previewEmptyMessage')}</p>
                                        )}
                                        <p className="mt-2 text-[11px] text-[#949ba4]">{t('reminders.previewFooter')}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-1 text-sm">
                                        {title.trim() && <p className="font-semibold text-white">{title.trim()}</p>}
                                        {message.trim() ? (
                                            <div className="discord-md" dangerouslySetInnerHTML={{ __html: renderDiscordMarkdown(message) }} />
                                        ) : (
                                            <p className="text-[#949ba4] italic">{t('reminders.previewEmptyMessage')}</p>
                                        )}
                                    </div>
                                )}
                            </DiscordMessage>
                            <p className="text-[11px] text-muted-foreground">{t('reminders.timezoneNote')}</p>
                        </div>
                    </div>

                    {formError && <p className="text-xs font-medium text-destructive">{formError}</p>}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={busy}>
                            {busy && <Spinner className="mr-1.5 size-4" />}
                            {reminder ? t('common.save') : t('reminders.addReminder')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
