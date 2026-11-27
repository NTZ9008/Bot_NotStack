import { useEffect, useState, type FormEvent } from 'react';
import { Spinner } from '@/components/ui/spinner';
import {
    UPTIME_INTERVAL_MINUTES,
    UPTIME_LIMITS,
    uptimeTargetInputSchema,
    type CreateUptimeTargetInput,
    type GuildChannel,
    type GuildRole,
    type UpdateUptimeTargetInput,
    type UptimeIntervalMinutes,
    type UptimeTargetSummary,
} from '@notstack/shared';
import {} from '@/components/icons';
import { ChannelSelect } from '@/components/channel-select';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/lib/i18n';

const NO_ROLE = '__none__';

export interface UptimeTargetDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    target: UptimeTargetSummary | null;
    channels: GuildChannel[];
    roles: GuildRole[];
    busy: boolean;
    onSubmit: (payload: CreateUptimeTargetInput | UpdateUptimeTargetInput) => Promise<void>;
}

export function UptimeTargetDialog({ open, onOpenChange, target, channels, roles, busy, onSubmit }: UptimeTargetDialogProps) {
    const t = useT();
    const sendableChannels = channels.filter((ch) => ch.sendable);

    const [name, setName] = useState('');
    const [url, setUrl] = useState('https://');
    const [intervalMinutes, setIntervalMinutes] = useState<UptimeIntervalMinutes>(5);
    const [channelId, setChannelId] = useState('');
    const [mentionRoleId, setMentionRoleId] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        if (target) {
            setName(target.name);
            setUrl(target.url);
            setIntervalMinutes(target.intervalMinutes);
            setChannelId(target.channelId);
            setMentionRoleId(target.mentionRoleId ?? '');
            setEnabled(target.enabled);
        } else {
            setName('');
            setUrl('https://');
            setIntervalMinutes(5);
            setChannelId(channels.find((ch) => ch.sendable)?.id ?? '');
            setMentionRoleId('');
            setEnabled(true);
        }
        setFormError(null);
    }, [open, target, channels]);

    const roleMissing = Boolean(mentionRoleId && !roles.some((r) => r.id === mentionRoleId));

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const parsed = uptimeTargetInputSchema.safeParse({
            name,
            url,
            intervalMinutes,
            channelId,
            mentionRoleId: mentionRoleId || null,
            enabled,
        });
        if (!parsed.success) {
            setFormError(parsed.error.issues[0]?.message ?? t('uptime.invalidInput'));
            return;
        }
        setFormError(null);
        await onSubmit(parsed.data);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{target ? t('uptime.editTarget') : t('uptime.addTarget')}</DialogTitle>
                    <DialogDescription>{t('uptime.targetDialogDescription')}</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <Field label={t('uptime.targetName')} htmlFor="uptime-name">
                        <Input
                            id="uptime-name"
                            value={name}
                            maxLength={UPTIME_LIMITS.maxNameLength}
                            placeholder={t('uptime.targetNamePlaceholder')}
                            onChange={(e) => setName(e.target.value)}
                            disabled={busy}
                        />
                    </Field>

                    <Field label={t('uptime.targetUrl')} htmlFor="uptime-url" hint={t('uptime.targetUrlHint')}>
                        <Input
                            id="uptime-url"
                            type="url"
                            value={url}
                            maxLength={UPTIME_LIMITS.maxUrlLength}
                            placeholder="https://api.example.com/health"
                            onChange={(e) => setUrl(e.target.value)}
                            disabled={busy}
                        />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t('uptime.checkInterval')}>
                            <Select
                                value={String(intervalMinutes)}
                                onValueChange={(v) => setIntervalMinutes(Number(v) as UptimeIntervalMinutes)}
                                disabled={busy}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {UPTIME_INTERVAL_MINUTES.map((mins) => (
                                        <SelectItem key={mins} value={String(mins)}>
                                            {t('uptime.everyMinutes', { 0: mins })}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>

                        <Field label={t('uptime.alertChannel')}>
                            <ChannelSelect channels={sendableChannels} value={channelId} onChange={setChannelId} disabled={busy} />
                        </Field>
                    </div>

                    <Field label={t('uptime.mentionRole')} hint={t('uptime.mentionRoleHint')}>
                        <Select value={mentionRoleId || NO_ROLE} onValueChange={(v) => setMentionRoleId(v === NO_ROLE ? '' : v)} disabled={busy}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                                <SelectItem value={NO_ROLE}>{t('uptime.noMentionRole')}</SelectItem>
                                {roles.map((role) => (
                                    <SelectItem key={role.id} value={role.id}>
                                        @{role.name}
                                    </SelectItem>
                                ))}
                                {roleMissing && <SelectItem value={mentionRoleId}>{t('common.notFoundInDiscord', { 0: mentionRoleId })}</SelectItem>}
                            </SelectContent>
                        </Select>
                    </Field>

                    <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 px-3.5 py-2.5">
                        <div>
                            <div className="text-xs font-medium text-foreground">{t('uptime.enableMonitoring')}</div>
                            <div className="text-[11px] text-muted-foreground">{t('uptime.enableMonitoringHint')}</div>
                        </div>
                        <Switch checked={enabled} onCheckedChange={setEnabled} disabled={busy} />
                    </div>

                    {formError && <p className="text-xs font-medium text-destructive">{formError}</p>}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={busy}>
                            {busy && <Spinner className="mr-1.5 size-4" />}
                            {target ? t('common.save') : t('uptime.addTarget')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
