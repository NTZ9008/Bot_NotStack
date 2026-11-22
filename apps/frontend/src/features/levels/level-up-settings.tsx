import { tr } from '../../lib/i18n';
import {
    fillLevelUpMessage,
    type LevelUpDestination,
    type LevelUpSettings,
    type LevelUpSettingsResponse,
    type RankCardMeta,
    type RankCardTheme,
} from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, RefreshCw, Save, Trash2 } from '@/components/icons';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { levelUpQuery, rankCardApi, rankCardKey, rankMetaQuery, rankThemeQuery } from '@/api/rank-card';
import { ChannelSelect } from '@/components/channel-select';
import { DiscordMessage } from '@/components/discord-message';
import { useConfirm } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { RankEditorSkeleton } from '@/components/skeleton/levels';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { insertAtCursor, PlaceholderChips, Segmented, SwitchRow } from '@/features/welcome/form-controls';
import { useAuth } from '@/hooks/use-auth';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { errorMessage } from '@/lib/api';
import { renderDiscordMarkdown } from '@/lib/discord-markdown';
import { RankPreview } from './rank-preview';
import { selectClass } from './rank-theme-editor';

export function LevelUpPanel({ guildId }: { guildId: string }) {
    const meta = useQuery(rankMetaQuery(guildId));
    const settings = useQuery(levelUpQuery(guildId));
    const theme = useQuery(rankThemeQuery(guildId));
    const failed = [meta, settings, theme].find((q) => q.error);
    if (failed) return <ErrorState error={failed.error} />;
    if (!meta.data || !settings.data || !theme.data) return <RankEditorSkeleton cards={2} />;
    return <LevelUpEditor key={guildId} guildId={guildId} meta={meta.data} initial={settings.data} theme={theme.data} />;
}

function LevelUpEditor({ guildId, meta, initial, theme }: { guildId: string; meta: RankCardMeta; initial: LevelUpSettingsResponse; theme: RankCardTheme }) {
    const client = useQueryClient();
    const confirm = useConfirm();
    const { user } = useAuth();
    const { data: allChannels = [] } = useQuery(guildChannelsQuery(guildId));
    const { data: roles = [] } = useQuery(guildRolesQuery(guildId));
    const channels = allChannels.filter((channel) => channel.sendable);
    const [saved, setSaved] = useState(initial);
    const [draft, setDraft] = useState<LevelUpSettings>(initial.settings);
    const messageRef = useRef<HTMLTextAreaElement>(null);
    const dirty = JSON.stringify(draft) !== JSON.stringify(saved.settings);
    const patch = (data: Partial<LevelUpSettings>) => setDraft((old) => ({ ...old, ...data }));
    const patchReward = (index: number, data: Partial<LevelUpSettings['rewards'][number]>) =>
        setDraft((old) => ({ ...old, rewards: old.rewards.map((reward, i) => (i === index ? { ...reward, ...data } : reward)) }));

    useUnsavedChangesGuard(dirty, { title: tr('levels.discardUnsavedLevelUpSettings'), destructive: true });

    const save = useMutation({
        mutationFn: () => rankCardApi.saveLevelUp(guildId, draft),
        onSuccess: (data) => {
            setSaved(data);
            setDraft(data.settings);
            client.setQueryData(levelUpQuery(guildId).queryKey, data);
            if (data.warnings.length) toast.warning(tr('levels.savedWithWarnings'), { description: data.warnings[0] });
            else toast.success(tr('levels.levelUpSettingsSaved'));
        },
        onError: (err) => toast.error(tr('common.saveFailed'), { description: errorMessage(err) }),
    });
    const sync = useMutation({
        mutationFn: () => rankCardApi.syncRewards(guildId),
        onSuccess: (data) => toast.success(tr('levels.roleSyncStarted'), { description: data.message }),
        onError: (err) => toast.error(tr('levels.roleSyncFailed'), { description: errorMessage(err) }),
    });

    // ตัวอย่างข้อความประกาศ — แทนค่าตัวแปรด้วยข้อมูลตัวอย่างฝั่งหน้าเว็บเลย
    const sampleLevel = draft.rewards[0]?.level ?? 12;
    const sampleRoles = draft.rewards
        .filter((reward) => reward.level === sampleLevel)
        .map((reward) => roles.find((role) => role.id === reward.roleId)?.name)
        .filter(Boolean)
        .join(', ');
    const sampleName = user.displayName || user.discordUsername || tr('common.members');
    const message = fillLevelUpMessage(draft.message, {
        mention: '\u0000MENTION\u0000',
        user: sampleName,
        level: String(sampleLevel),
        previousLevel: String(sampleLevel - 1),
        server: '',
        roles: sampleRoles,
    }).trim();
    const messageHtml = renderDiscordMarkdown(message).split('\u0000MENTION\u0000').join(`<span class="dc-mention">@${sampleName}</span>`);
    const usedRoles = new Set(draft.rewards.map((reward) => reward.roleId));

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{tr('levels.announceLevelUpsFromChatVoice')}</p>
                <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
                    <Save />
                    {save.isPending ? tr('levels.saving') : tr('common.save')}
                </Button>
            </div>

            {saved.warnings.length > 0 && (
                <div role="alert" className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                    {saved.warnings.map((warning) => (
                        <p key={warning} className="flex gap-2">
                            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                            {warning}
                        </p>
                    ))}
                </div>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <fieldset disabled={save.isPending} className="min-w-0 space-y-5">
                    <Card>
                        <CardHeader>
                            <CardTitle>{tr('levels.levelUpAnnouncements')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <SwitchRow label={tr('levels.announceWhenMembersLevelUp')} checked={draft.announce} onChange={(announce) => patch({ announce })} />
                            <fieldset disabled={!draft.announce} className="space-y-4 disabled:opacity-50">
                                <Field label={tr('levels.sendTo')}>
                                    <Segmented
                                        value={draft.destination}
                                        options={meta.destinations}
                                        onChange={(destination: LevelUpDestination) => patch({ destination })}
                                    />
                                </Field>
                                {draft.destination !== 'dm' && (
                                    <Field
                                        label={draft.destination === 'channel' ? tr('levels.announcementChannel') : tr('levels.fallbackChannel')}
                                        hint={
                                            draft.destination === 'channel'
                                                ? tr('levels.everyAnnouncementGoesToThisChannel')
                                                : tr('levels.usedWhenTheBotCantPost')
                                        }
                                    >
                                        <ChannelSelect
                                            channels={channels}
                                            value={draft.channelId}
                                            onChange={(channelId) => patch({ channelId })}
                                            noneLabel={tr('levels.none')}
                                        />
                                    </Field>
                                )}
                                <Field
                                    label={tr('common.messages')}
                                    hint={tr('levels.charactersEmptySendOnlyTheCard', { 0: draft.message.length, 1: meta.limits.maxMessageLength })}
                                >
                                    <Textarea
                                        ref={messageRef}
                                        rows={3}
                                        maxLength={meta.limits.maxMessageLength}
                                        value={draft.message}
                                        onChange={(e) => patch({ message: e.target.value })}
                                    />
                                    <PlaceholderChips
                                        meta={meta}
                                        onInsert={(token) => {
                                            const { value, cursor } = insertAtCursor(messageRef.current, draft.message, token);
                                            patch({ message: value.slice(0, meta.limits.maxMessageLength) });
                                            requestAnimationFrame(() => messageRef.current?.setSelectionRange(cursor, cursor));
                                        }}
                                    />
                                </Field>
                                <SwitchRow label={tr('levels.attachTheLevelUpCardAs')} checked={draft.showCard} onChange={(showCard) => patch({ showCard })} />
                            </fieldset>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{tr('levels.rewardRolesByLevel')}</CardTitle>
                            <CardDescription>{tr('levels.theBotOnlyManagesRolesIn')}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {draft.rewards.map((reward, index) => (
                                <div key={index} className="flex items-end gap-2">
                                    <Field label={index === 0 ? tr('levels.level') : undefined} className="w-24 shrink-0">
                                        <Input
                                            type="number"
                                            min={1}
                                            max={meta.limits.maxLevel}
                                            value={Number.isNaN(reward.level) ? '' : reward.level}
                                            onChange={(e) => patchReward(index, { level: e.target.valueAsNumber })}
                                        />
                                    </Field>
                                    <Field label={index === 0 ? tr('levels.roleGiven') : undefined} className="min-w-0 flex-1">
                                        <select className={selectClass} value={reward.roleId} onChange={(e) => patchReward(index, { roleId: e.target.value })}>
                                            <option value="">{tr('levels.pickARole')}</option>
                                            {roles.map((role) => (
                                                <option key={role.id} value={role.id} disabled={role.id !== reward.roleId && usedRoles.has(role.id)}>
                                                    {role.name}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={tr('levels.removeThisRewardRole')}
                                        onClick={() => setDraft((old) => ({ ...old, rewards: old.rewards.filter((_, i) => i !== index) }))}
                                    >
                                        <Trash2 />
                                    </Button>
                                </div>
                            ))}
                            <Button
                                type="button"
                                variant="outline"
                                disabled={draft.rewards.length >= meta.limits.maxRewards}
                                onClick={() =>
                                    setDraft((old) => ({ ...old, rewards: [...old.rewards, { level: (old.rewards.at(-1)?.level ?? 0) + 5, roleId: '' }] }))
                                }
                            >
                                <Plus />

                                {tr('levels.addRewardRole')}
                            </Button>
                            {draft.rewards.some((reward) => !reward.roleId) && (
                                <p className="text-xs text-amber-700 dark:text-amber-400">{tr('levels.rowsWithoutARoleAreDropped')}</p>
                            )}
                            <Field label={tr('levels.whenReachingAHigherLevelsRole')}>
                                <Segmented
                                    value={draft.stackRewards ? 'stack' : 'replace'}
                                    options={{ stack: tr('levels.keepPreviousRolesToo'), replace: tr('levels.keepOnlyTheHighestRole') }}
                                    onChange={(value) => patch({ stackRewards: value === 'stack' })}
                                />
                            </Field>
                            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
                                <p className="flex-1 text-sm text-muted-foreground">{tr('levels.membersWhoAlreadyReachedALevel')}</p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={dirty || sync.isPending || !saved.settings.rewards.length}
                                    title={dirty ? tr('levels.saveSettingsFirst') : undefined}
                                    onClick={async () => {
                                        const ok = await confirm({
                                            title: tr('levels.syncRewardRolesForEveryMember'),
                                            description: tr('levels.theBotAddsRemovesRewardRoles'),
                                            confirmText: tr('levels.startSync'),
                                        });
                                        if (ok) sync.mutate();
                                    }}
                                >
                                    <RefreshCw className={sync.isPending ? 'animate-spin' : undefined} />

                                    {tr('levels.applyToExistingMembers')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </fieldset>

                <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
                    {draft.showCard ? (
                        <RankPreview
                            queryKey={[...rankCardKey(guildId), 'level-up']}
                            input={{ rewards: draft.rewards, theme }}
                            fetcher={(input, signal) =>
                                rankCardApi.preview(guildId, { kind: 'levelup', theme: input.theme, levelUp: { ...draft, rewards: input.rewards } }, signal)
                            }
                            kind="levelup"
                            kinds={['levelup']}
                            onKind={() => {}}
                        >
                            {message && <div className="discord-md" dangerouslySetInnerHTML={{ __html: messageHtml }} />}
                        </RankPreview>
                    ) : (
                        <DiscordMessage>
                            {message ? (
                                <div className="discord-md" dangerouslySetInnerHTML={{ __html: messageHtml }} />
                            ) : (
                                <p className="text-sm text-[#949ba4]">{tr('levels.noMessageAndNoCardNothing')}</p>
                            )}
                        </DiscordMessage>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">{tr('levels.thePreviewUsesTheServerTheme')}</p>
                </div>
            </div>
        </div>
    );
}
