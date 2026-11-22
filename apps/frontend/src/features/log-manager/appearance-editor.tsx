import { tr, byLang } from '../../lib/i18n';
import { DEFAULT_LOG_APPEARANCE, formatLogEmbed, type LogAppearance, type LogEmbedContent, type LogEventSetting } from '@notstack/shared';
import { useMutation } from '@tanstack/react-query';
import { Check, RotateCcw, Save } from '@/components/icons';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { logSettingsApi } from '@/api/bot';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { errorMessage } from '@/lib/api';

const samples = byLang((): Record<string, LogEmbedContent> => ({
    messageUpdate: {
        title: tr('logManager.messageEdited'),
        description: tr('logManager.maliEditedAMessageInGeneral'),
        fields: [
            { name: tr('logManager.author'), value: '@Mali' },
            { name: tr('logManager.channel'), value: '#general' },
            {
                name: tr('logManager.before'),
                value: tr('logManager.sampleBefore'),
                inline: false,
            },
            { name: tr('logManager.after'), value: tr('logManager.sampleAfter'), inline: false },
        ],
    },
    memberJoin: {
        title: tr('logManager.memberJoined'),
        description: tr('logManager.maliJoinedTheServer'),
        thumbnail: 'https://cdn.discordapp.com/embed/avatars/0.png',
        fields: [
            { name: tr('logManager.user'), value: '@Mali' },
            { name: '🆔 User ID', value: '123456789012345678' },
            { name: tr('logManager.accountCreated'), value: tr('logManager.sampleAccountCreated'), inline: false },
            { name: tr('logManager.memberCountNow'), value: tr('logManager.sampleMemberCount') },
        ],
    },
    memberBan: {
        title: tr('logManager.memberBanned'),
        description: tr('logManager.maliWasBannedFromTheServer'),
        thumbnail: 'https://cdn.discordapp.com/embed/avatars/0.png',
        fields: [
            { name: tr('logManager.member'), value: '@Mali' },
            { name: tr('logManager.moderator'), value: '@Admin' },
            { name: tr('logManager.reason'), value: tr('logManager.sampleReason'), inline: false },
        ],
    },
}));

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
            toast.success(tr('logManager.formatSaved'), { description: tr('logManager.appliesToEveryNewLogType') });
        },
        onError: (error) => toast.error(tr('common.saveFailed'), { description: errorMessage(error) }),
    });
    const dirty = JSON.stringify(draft) !== JSON.stringify(persisted);
    useUnsavedChangesGuard(dirty, {
        title: tr('logManager.discardUnsavedFormat'),
        description: tr('logManager.logFormatChangesWillBeLost'),
        confirmText: tr('common.discardChanges'),
        destructive: true,
    });
    const patch = (next: Partial<LogAppearance>) => setDraft((current) => ({ ...current, ...next }));
    const event = events.find((e) => e.key === sample);
    const preview = formatLogEmbed(sample, samples()[sample]!, draft, event?.color, '2026-10-05T12:00:00.000Z');
    const toggles = [
        ['showFieldIcons', tr('logManager.fieldIcons'), tr('logManager.addSymbolsToTellDataTypes')],
        ['showIds', tr('logManager.showIds'), tr('logManager.showIdFieldsForReferenceWhen')],
        ['showThumbnail', tr('common.avatar'), tr('logManager.showAnImageWhenTheEvent')],
        ['showTimestamp', tr('logManager.eventTime'), tr('logManager.showTheTimeAtTheEnd')],
    ] as const;

    return (
        <Card className="overflow-hidden">
            <CardHeader>
                <CardTitle>{tr('logManager.designLogMessages')}</CardTitle>
                <CardDescription>{tr('logManager.adjustTheFormatForYourTeam')}</CardDescription>
            </CardHeader>
            <CardContent className="grid min-w-0 grid-cols-1 gap-8 xl:grid-cols-2">
                <div className="min-w-0 space-y-5">
                    <fieldset disabled={mutation.isPending} className="min-w-0 space-y-5 disabled:opacity-60">
                        <div className="space-y-2">
                            <Label>{tr('logManager.fieldLayout')}</Label>
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
                                            {layout === 'compact' ? tr('logManager.compact') : tr('logManager.comfortable')}
                                            {draft.layout === layout && <Check className="size-4" />}
                                        </span>
                                        <span className="mt-1 block text-xs text-muted-foreground">
                                            {layout === 'compact' ? tr('logManager.shortFieldsSideBySideSaves') : tr('logManager.oneFieldPerLineEasyTo')}
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
                            <Label htmlFor="log-content-length">{tr('logManager.maxFieldLength')}</Label>
                            <Select
                                value={String(draft.maxContentLength)}
                                disabled={mutation.isPending}
                                onValueChange={(value) => patch({ maxContentLength: Number(value) as LogAppearance['maxContentLength'] })}
                            >
                                <SelectTrigger id="log-content-length" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="250">{tr('logManager.short250Characters')}</SelectItem>
                                    <SelectItem value="500">{tr('logManager.medium500Characters')}</SelectItem>
                                    <SelectItem value="1024">{tr('logManager.long1024Characters')}</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">{tr('logManager.longerTextIsCutWithThis')}</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="log-footer">{tr('common.embedFooter')}</Label>
                            <Input
                                id="log-footer"
                                maxLength={100}
                                value={draft.footerText}
                                onChange={(e) => patch({ footerText: e.target.value })}
                                placeholder={tr('logManager.leaveEmptyToHideTheFooter')}
                            />
                            <p className="text-right text-xs text-muted-foreground">{draft.footerText.length}/100</p>
                        </div>
                    </fieldset>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate(draft)}>
                            <Save className="size-4" />
                            {mutation.isPending ? tr('logManager.saving') : tr('logManager.saveFormat')}
                        </Button>
                        <Button variant="ghost" disabled={mutation.isPending} onClick={() => setDraft({ ...DEFAULT_LOG_APPEARANCE })}>
                            <RotateCcw className="size-4" />

                            {tr('common.restoreDefaults')}
                        </Button>
                        {dirty && (
                            <Button variant="ghost" disabled={mutation.isPending} onClick={() => setDraft({ ...persisted })}>
                                {tr('common.cancelChanges')}
                            </Button>
                        )}
                    </div>
                    <p role="status" className="text-xs text-muted-foreground">
                        {dirty ? tr('logManager.youHaveUnsavedChanges') : tr('logManager.formatMatchesWhatsSaved')}
                    </p>
                </div>
                <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor="log-preview-event">{tr('logManager.livePreview')}</Label>
                        <Select value={sample} onValueChange={setSample}>
                            <SelectTrigger id="log-preview-event" className="w-48">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="messageUpdate">{tr('logManager.messageEdited2')}</SelectItem>
                                <SelectItem value="memberJoin">{tr('logManager.memberJoined2')}</SelectItem>
                                <SelectItem value="memberBan">{tr('logManager.memberBanned2')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="dark rounded-xl bg-[#313338] p-4 text-[#dbdee1] sm:p-5">
                        <div className="mb-3 flex items-center gap-2 text-sm">
                            <span className="flex size-8 items-center justify-center rounded-full bg-indigo-500 font-bold text-white">N</span>
                            <span className="font-semibold text-white">NotStack</span>
                            <span className="rounded bg-indigo-500 px-1 text-[10px] text-white">APP</span>
                            <span className="text-xs text-[#b5bac1]">{tr('logManager.today1900')}</span>
                        </div>
                        <div
                            className="dark relative min-w-0 rounded border-l-4 bg-[#2b2d31] p-4"
                            style={{ borderLeftColor: `#${preview.color.toString(16).padStart(6, '0')}` }}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-semibold text-white">{preview.title}</p>
                                    {preview.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{preview.description}</p>}
                                </div>
                                {preview.thumbnail && (
                                    <span
                                        aria-label={tr('logManager.sampleAvatar')}
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
                                    {[preview.footer?.text, preview.timestamp ? tr('logManager.today1900') : ''].filter(Boolean).join(' • ')}
                                </p>
                            )}
                        </div>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{tr('logManager.sampleDataUsesEachEventsColor')}</p>
                </div>
            </CardContent>
        </Card>
    );
}
