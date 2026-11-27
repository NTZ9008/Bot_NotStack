import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    TICKET_LIMITS,
    type GuildChannel,
    type GuildRole,
    type TicketConfigDto,
    type UpdateTicketConfigInput,
} from '@notstack/shared';
import { toast } from 'sonner';
import { ticketConfigQuery, ticketsApi } from '@/api/tickets';
import { ChannelSelect, channelLabel } from '@/components/channel-select';
import { ColorField } from '@/components/color-field';
import { useConfirm } from '@/components/confirm-dialog';
import { DiscordMessage } from '@/components/discord-message';
import { Field } from '@/components/field';
import { IdChoices } from '@/components/id-choices';
import { AlertTriangle, Loader2, RotateCcw, Save, Send } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useSaveShortcut, useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { errorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n';

interface TicketDraft {
    categoryId: string;
    logChannelId: string;
    panelChannelId: string;
    staffRoleIds: string[];
    panelTitle: string;
    panelDescription: string;
    panelColor: string;
    dmTranscript: boolean;
    maxOpenPerUser: number;
}

function toDraft(config: TicketConfigDto): TicketDraft {
    return {
        categoryId: config.categoryId,
        logChannelId: config.logChannelId ?? '',
        panelChannelId: config.panelChannelId ?? '',
        staffRoleIds: [...config.staffRoleIds],
        panelTitle: config.panelTitle,
        panelDescription: config.panelDescription,
        panelColor: config.panelColor,
        dmTranscript: config.dmTranscript,
        maxOpenPerUser: config.maxOpenPerUser,
    };
}

function toPayload(draft: TicketDraft): UpdateTicketConfigInput {
    return {
        categoryId: draft.categoryId,
        logChannelId: draft.logChannelId || null,
        panelChannelId: draft.panelChannelId || null,
        staffRoleIds: draft.staffRoleIds,
        panelTitle: draft.panelTitle,
        panelDescription: draft.panelDescription,
        panelColor: draft.panelColor,
        dmTranscript: draft.dmTranscript,
        maxOpenPerUser: draft.maxOpenPerUser,
    };
}

function clampMaxOpen(raw: string): number {
    const parsed = Math.trunc(Number(raw));
    if (!Number.isFinite(parsed)) return TICKET_LIMITS.minMaxOpenPerUser;
    return Math.min(TICKET_LIMITS.maxMaxOpenPerUser, Math.max(TICKET_LIMITS.minMaxOpenPerUser, parsed));
}

export function TicketSettingsTab({
    guildId,
    config,
    allChannels,
    roles,
}: {
    guildId: string;
    config: TicketConfigDto;
    allChannels: GuildChannel[];
    roles: GuildRole[];
}) {
    const t = useT();
    const queryClient = useQueryClient();
    const confirm = useConfirm();

    const textChannels = allChannels.filter((ch) => ch.sendable);
    const categories = allChannels.filter((ch) => ch.isCategory);

    const [saved, setSaved] = useState<TicketDraft>(() => toDraft(config));
    const [draft, setDraft] = useState<TicketDraft>(() => toDraft(config));
    const [busy, setBusy] = useState<'save' | 'publish' | null>(null);

    const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

    useEffect(() => {
        const next = toDraft(config);
        setSaved(next);
        setDraft((current) => (JSON.stringify(current) === JSON.stringify(saved) ? next : current));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.guildId, config.updatedAt, config.panelMessageId]);

    const patch = (next: Partial<TicketDraft>) => setDraft((current) => ({ ...current, ...next }));

    useUnsavedChangesGuard(dirty, {
        title: t('common.discardUnsavedChanges'),
        description: t('tickets.unsavedChangesDesc'),
        confirmText: t('common.discardChanges'),
        destructive: true,
    });

    const save = async (): Promise<boolean> => {
        if (!dirty || busy) return false;
        if (!draft.panelTitle.trim()) {
            toast.error(t('tickets.panelTitleRequired'));
            return false;
        }
        setBusy('save');
        try {
            const result = await ticketsApi.saveConfig(guildId, toPayload(draft));
            queryClient.setQueryData(ticketConfigQuery(guildId).queryKey, result.config);
            const nextDraft = toDraft(result.config);
            setSaved(nextDraft);
            setDraft(nextDraft);
            if (result.warning) {
                toast.warning(t('tickets.savedWithWarning'), { description: result.warning });
            } else {
                toast.success(t('common.settingsSaved'));
            }
            return true;
        } catch (err) {
            toast.error(t('common.saveFailed'), { description: errorMessage(err) });
            return false;
        } finally {
            setBusy(null);
        }
    };

    useSaveShortcut(() => void save());

    const publish = async () => {
        if (!draft.panelChannelId) {
            toast.error(t('tickets.cantPublishYet'), { description: t('tickets.pickPanelChannelFirst') });
            return;
        }
        if (dirty) {
            toast.error(t('tickets.cantPublishYet'), { description: t('tickets.saveBeforePublish') });
            return;
        }
        const ok = await confirm({
            title: t('tickets.confirmPublishTitle', { 0: channelLabel(allChannels, saved.panelChannelId) ?? saved.panelChannelId }),
            description: t('tickets.confirmPublishDesc'),
            confirmText: config.panelMessageId ? t('tickets.updatePanel') : t('tickets.publishPanel'),
        });
        if (!ok) return;

        setBusy('publish');
        try {
            const result = await ticketsApi.publishPanel(guildId);
            queryClient.setQueryData(ticketConfigQuery(guildId).queryKey, result.config);
            toast.success(result.message);
        } catch (err) {
            toast.error(t('tickets.publishFailed'), { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground">
                        {config.panelMessageId && config.panelChannelId ? (
                            <>
                                <Badge className="mr-2 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                    {t('tickets.panelActive')}
                                </Badge>
                                {t('tickets.panelIsIn', { 0: channelLabel(allChannels, config.panelChannelId) ?? '-' })}
                            </>
                        ) : (
                            <>
                                <Badge variant="secondary" className="mr-2">
                                    {t('tickets.panelDraft')}
                                </Badge>
                                {t('tickets.panelNotPublishedYet')}
                            </>
                        )}
                    </div>
                    {dirty && (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            {t('common.youHaveUnsavedChanges')}
                        </Badge>
                    )}
                </CardHeader>
            </Card>

            {config.warning && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <div>
                        <p className="font-semibold">{t('tickets.permissionWarningTitle')}</p>
                        <p className="mt-0.5">{config.warning}</p>
                    </div>
                </div>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('tickets.channelsAndPermissionsTitle')}</CardTitle>
                        <CardDescription>{t('tickets.channelsAndPermissionsDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                        <Field label={t('tickets.categoryLabel')} hint={t('tickets.categoryHint')}>
                            <ChannelSelect
                                channels={categories}
                                showCategories
                                value={draft.categoryId}
                                onChange={(categoryId) => patch({ categoryId })}
                                noneLabel={t('tickets.noCategory')}
                            />
                        </Field>

                        <Field label={t('tickets.panelChannelLabel')} hint={t('tickets.panelChannelHint')}>
                            <ChannelSelect
                                channels={textChannels}
                                value={draft.panelChannelId}
                                onChange={(panelChannelId) => patch({ panelChannelId })}
                                noneLabel={t('tickets.noChannel')}
                            />
                        </Field>

                        <Field label={t('tickets.logChannelLabel')} hint={t('tickets.logChannelHint')}>
                            <ChannelSelect
                                channels={textChannels}
                                value={draft.logChannelId}
                                onChange={(logChannelId) => patch({ logChannelId })}
                                noneLabel={t('tickets.noLogChannel')}
                            />
                        </Field>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                                label={t('tickets.maxOpenPerUserLabel')}
                                htmlFor="ticket-max-open"
                                hint={t('tickets.maxOpenPerUserHint', {
                                    0: TICKET_LIMITS.minMaxOpenPerUser,
                                    1: TICKET_LIMITS.maxMaxOpenPerUser,
                                })}
                            >
                                <Input
                                    id="ticket-max-open"
                                    type="number"
                                    inputMode="numeric"
                                    className="w-28"
                                    min={TICKET_LIMITS.minMaxOpenPerUser}
                                    max={TICKET_LIMITS.maxMaxOpenPerUser}
                                    value={draft.maxOpenPerUser}
                                    onChange={(e) => patch({ maxOpenPerUser: clampMaxOpen(e.target.value) })}
                                />
                            </Field>

                            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                                <div className="space-y-0.5">
                                    <Label htmlFor="ticket-dm-transcript" className="text-sm font-medium">
                                        {t('tickets.dmTranscriptLabel')}
                                    </Label>
                                    <p className="text-xs text-muted-foreground">{t('tickets.dmTranscriptHint')}</p>
                                </div>
                                <Switch
                                    id="ticket-dm-transcript"
                                    checked={draft.dmTranscript}
                                    onCheckedChange={(dmTranscript) => patch({ dmTranscript })}
                                />
                            </div>
                        </div>

                        <IdChoices
                            title={t('tickets.staffRolesTitle')}
                            options={roles}
                            values={draft.staffRoleIds}
                            onChange={(staffRoleIds) => patch({ staffRoleIds: staffRoleIds.slice(0, TICKET_LIMITS.maxStaffRoles) })}
                            emptyHint={t('tickets.staffRolesHint')}
                        />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{t('tickets.panelDesignTitle')}</CardTitle>
                        <CardDescription>{t('tickets.panelDesignDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                        <Field label={t('common.topics')} htmlFor="ticket-panel-title">
                            <Input
                                id="ticket-panel-title"
                                maxLength={TICKET_LIMITS.maxPanelTitleLength}
                                value={draft.panelTitle}
                                onChange={(e) => patch({ panelTitle: e.target.value })}
                            />
                        </Field>

                        <Field label={t('common.details')} htmlFor="ticket-panel-desc">
                            <Textarea
                                id="ticket-panel-desc"
                                rows={4}
                                maxLength={TICKET_LIMITS.maxPanelDescriptionLength}
                                value={draft.panelDescription}
                                onChange={(e) => patch({ panelDescription: e.target.value })}
                            />
                        </Field>

                        <Field label={t('tickets.panelColorLabel')} htmlFor="ticket-panel-color">
                            <ColorField
                                id="ticket-panel-color"
                                value={draft.panelColor}
                                onChange={(panelColor) => patch({ panelColor: panelColor.toUpperCase() })}
                            />
                        </Field>

                        <DiscordMessage>
                            <div className="dark max-w-md rounded border-l-4 bg-[#2b2d31] p-3" style={{ borderColor: draft.panelColor }}>
                                {draft.panelTitle && <div className="font-semibold text-white">{draft.panelTitle}</div>}
                                {draft.panelDescription && (
                                    <div className="mt-1 text-sm whitespace-pre-wrap text-[#dbdee1]">{draft.panelDescription}</div>
                                )}
                            </div>
                            <span className="mt-2 inline-flex items-center gap-1.5 rounded bg-[#5865f2] px-4 py-1.5 text-sm font-medium text-white">
                                🎫 {t('tickets.openTicketButton')}
                            </span>
                        </DiscordMessage>
                    </CardContent>
                </Card>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button onClick={() => void save()} disabled={!dirty || busy !== null} title="Ctrl/⌘ + S">
                    {busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />} {t('common.save')}
                </Button>
                <Button variant="outline" disabled={!dirty || busy !== null} onClick={() => setDraft(structuredClone(saved))}>
                    <RotateCcw /> {t('common.cancelChanges')}
                </Button>
                <Button variant="secondary" onClick={() => void publish()} disabled={busy !== null}>
                    {busy === 'publish' ? <Loader2 className="animate-spin" /> : <Send />}{' '}
                    {config.panelMessageId ? t('tickets.updatePanel') : t('tickets.publishPanel')}
                </Button>
            </div>
        </div>
    );
}
