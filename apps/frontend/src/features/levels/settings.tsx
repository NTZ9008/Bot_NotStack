import { tr, trText } from '../../lib/i18n';
import {
    defaultXpRule,
    defaultXpSettings,
    XP_SOURCES,
    XP_SOURCE_LABELS,
    xpAtLevel,
    xpSettingsSchema,
    type XpRule,
    type XpSettingsResponse,
} from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Trash2 } from '@/components/icons';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { xpApi, xpKey, xpSettingsQuery } from '@/api/levels';
import { useConfirm } from '@/components/confirm-dialog';
import { SaveBar } from '@/components/page-controls';
import { XpSettingsSkeleton } from '@/components/skeleton/levels';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { IdChoices } from '@/components/id-choices';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { errorMessage } from '@/lib/api';

const selectClass = 'h-9 w-full rounded-md border bg-background px-3 text-sm';
export function NumberField({
    label,
    value,
    onChange,
    min = 0,
    max,
    step = 1,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
}) {
    return (
        <label className="grid gap-1.5 text-sm">
            {label}
            <Input type="number" value={Number.isNaN(value) ? '' : value} min={min} max={max} step={step} onChange={(e) => onChange(e.target.valueAsNumber)} />
        </label>
    );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    const id = useId();
    return (
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <label htmlFor={id} className="text-sm">
                {label}
            </label>
            <Switch id={id} checked={checked} onCheckedChange={onChange} />
        </div>
    );
}
export function XpSettingsPanel({ guildId }: { guildId: string }) {
    const query = useQuery(xpSettingsQuery(guildId));
    if (query.isLoading) return <XpSettingsSkeleton />;
    if (query.error) return <ErrorState error={query.error} />;
    return query.data ? <SettingsEditor key={guildId} initial={query.data} guildId={guildId} /> : null;
}
function SettingsEditor({ initial, guildId }: { initial: XpSettingsResponse; guildId: string }) {
    const [saved, setSaved] = useState(initial);
    const [draft, setDraft] = useState(initial.settings);
    const [commandText, setCommandText] = useState<Record<string, string>>({});
    const client = useQueryClient(),
        confirm = useConfirm();
    const channels = useQuery(guildChannelsQuery(guildId));
    const roles = useQuery(guildRolesQuery(guildId));
    const dirty = JSON.stringify(draft) !== JSON.stringify(saved.settings);
    const parsed = xpSettingsSchema.safeParse(draft);
    const patch = (data: Partial<typeof draft>) => setDraft((old) => ({ ...old, ...data }));
    const patchRule = (id: string, data: Partial<XpRule>) =>
        setDraft((old) => ({ ...old, rules: old.rules.map((r) => (r.id === id ? { ...r, ...data } : r)) }));
    useUnsavedChangesGuard(dirty, { title: tr('levels.discardUnsavedXpSettings'), destructive: true });
    const save = useMutation({
        mutationFn: () => xpApi.save(guildId, { revision: saved.revision, settings: xpSettingsSchema.parse(draft) }),
        onSuccess: (data) => {
            setSaved(data);
            setDraft(data.settings);
            setCommandText({});
            client.setQueryData(xpSettingsQuery(guildId).queryKey, data);
            void client.invalidateQueries({ queryKey: xpKey(guildId) });
            toast.success(tr('levels.xpRulesSaved'));
        },
        onError: (err) => toast.error(tr('common.saveFailed'), { description: errorMessage(err) }),
    });
    const channelOptions = (channels.data ?? []).map((c) => ({ id: c.id, name: `${c.isCategory ? tr('levels.section') : '#'} ${c.name}` }));
    const voiceIds = (channels.data ?? []).filter((c) => c.isVoice).map((c) => c.id);
    return (
        <div className="space-y-5">
            <p className="text-sm text-muted-foreground">{tr('levels.changingTheLevelFormulaKeepsExisting')}</p>
            {!parsed.success && (
                <p role="alert" className="text-sm text-destructive">
                    {parsed.error.issues[0]?.path.join('.')} — {parsed.error.issues[0]?.message}
                </p>
            )}
            <fieldset disabled={save.isPending} className="space-y-5">
                <Card>
                    <CardHeader>
                        <CardTitle>{tr('levels.xpSystemOverview')}</CardTitle>
                        <CardDescription>{tr('levels.n100NormalRate15015')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Toggle label={tr('levels.earnXpFromActivity')} checked={draft.enabled} onChange={(enabled) => patch({ enabled })} />
                        <div className="grid gap-4 sm:grid-cols-2">
                            <NumberField
                                label={tr('levels.serverWideMultiplier')}
                                value={draft.multiplierPercent}
                                max={1000}
                                onChange={(multiplierPercent) => patch({ multiplierPercent })}
                            />
                            <NumberField
                                label={tr('levels.maxXpPerPersonPerDay')}
                                value={draft.dailyCap}
                                max={2000000000}
                                onChange={(dailyCap) => patch({ dailyCap })}
                            />
                            <NumberField
                                label={tr('levels.levelFormulaBaseXp')}
                                value={draft.curveBase}
                                min={1}
                                max={100000}
                                onChange={(curveBase) => patch({ curveBase })}
                            />
                            <NumberField
                                label={tr('levels.formulaExponent')}
                                value={draft.curveExponent}
                                min={1}
                                max={3}
                                step={0.1}
                                onChange={(curveExponent) => patch({ curveExponent })}
                            />
                        </div>
                        <p className="text-sm text-muted-foreground">{tr('levels.totalXpNeededCeilBaseLevel')}</p>
                        <div className="grid grid-cols-3 gap-2">
                            {[1, 5, 10].map((level) => (
                                <div className="rounded-md bg-muted p-3 text-center" key={level}>
                                    <p className="text-xs text-muted-foreground">Level {level}</p>
                                    <p className="font-semibold">{xpAtLevel(level, draft).toLocaleString()} XP</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>{tr('levels.xpConditions')}</CardTitle>
                        <CardDescription>{tr('levels.botsDontEarnXpExcludedChannels')}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                        <NumberField
                            label={tr('levels.minimumMessageLength')}
                            value={draft.messageMinLength}
                            max={4000}
                            onChange={(messageMinLength) => patch({ messageMinLength })}
                        />
                        <NumberField
                            label={tr('levels.minimumPeopleInVoiceExcludingBots')}
                            value={draft.voiceMinMembers}
                            min={1}
                            max={99}
                            onChange={(voiceMinMembers) => patch({ voiceMinMembers })}
                        />
                        <Toggle
                            label={tr('levels.noXpWhileMuted')}
                            checked={draft.voiceIgnoreMuted}
                            onChange={(voiceIgnoreMuted) => patch({ voiceIgnoreMuted })}
                        />
                        <Toggle
                            label={tr('levels.noXpWhileDeafened')}
                            checked={draft.voiceIgnoreDeafened}
                            onChange={(voiceIgnoreDeafened) => patch({ voiceIgnoreDeafened })}
                        />
                        <Toggle
                            label={tr('levels.noXpInTheAfkChannel')}
                            checked={draft.voiceIgnoreAfk}
                            onChange={(voiceIgnoreAfk) => patch({ voiceIgnoreAfk })}
                        />
                        <IdChoices
                            title={tr('levels.excludedChannelsCategories')}
                            options={channelOptions}
                            values={draft.excludedChannelIds}
                            onChange={(excludedChannelIds) => patch({ excludedChannelIds })}
                        />
                        <IdChoices
                            title={tr('common.excludedRoles')}
                            options={roles.data ?? []}
                            values={draft.excludedRoleIds}
                            onChange={(excludedRoleIds) => patch({ excludedRoleIds })}
                        />
                    </CardContent>
                </Card>
                <div className="space-y-2">
                    <h2 className="text-lg font-semibold">
                        {tr('levels.xpRules')}
                        {draft.rules.length}/50)
                    </h2>
                    <p className="text-sm text-muted-foreground">{tr('levels.matchingRulesAddXpInThe')}</p>
                </div>
                {draft.rules.map((rule, index) => (
                    <Card key={rule.id}>
                        <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <CardTitle>
                                    {index + 1}. {rule.name}
                                </CardTitle>
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={tr('levels.copy2', { 0: rule.name })}
                                        disabled={draft.rules.length >= 50}
                                        onClick={() =>
                                            patch({
                                                rules: [
                                                    ...draft.rules,
                                                    {
                                                        ...structuredClone(rule),
                                                        id: crypto.randomUUID(),
                                                        name: tr('levels.copy', { 0: rule.name }).slice(0, 80),
                                                    },
                                                ],
                                            })
                                        }
                                    >
                                        <Copy />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={tr('common.remove', { 0: rule.name })}
                                        onClick={async () => {
                                            if (
                                                await confirm({
                                                    title: tr('levels.deleteRule', { 0: rule.name }),
                                                    description: tr('levels.membersKeepTheirXpPressSave'),
                                                    destructive: true,
                                                })
                                            )
                                                patch({ rules: draft.rules.filter((r) => r.id !== rule.id) });
                                        }}
                                    >
                                        <Trash2 />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Toggle label={tr('levels.enableThisRule')} checked={rule.enabled} onChange={(enabled) => patchRule(rule.id, { enabled })} />
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <label className="grid gap-1.5 text-sm">
                                    {tr('levels.ruleName')}
                                    <Input value={rule.name} maxLength={80} onChange={(e) => patchRule(rule.id, { name: e.target.value })} />
                                </label>
                                <label className="grid gap-1.5 text-sm">
                                    {tr('levels.activity')}
                                    <select
                                        className={selectClass}
                                        value={rule.source}
                                        onChange={(e) => patchRule(rule.id, { source: e.target.value as XpRule['source'] })}
                                    >
                                        {XP_SOURCES.map((v) => (
                                            <option key={v} value={v}>
                                                {trText(XP_SOURCE_LABELS[v])}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <NumberField
                                    label={tr('levels.minXpPerEvent')}
                                    value={rule.minXp}
                                    max={100000}
                                    onChange={(minXp) => patchRule(rule.id, { minXp })}
                                />
                                <NumberField
                                    label={tr('levels.maxXpPerEvent')}
                                    value={rule.maxXp}
                                    max={100000}
                                    onChange={(maxXp) => patchRule(rule.id, { maxXp })}
                                />
                                <NumberField
                                    label={tr('levels.ruleMultiplier')}
                                    value={rule.multiplierPercent}
                                    max={1000}
                                    onChange={(multiplierPercent) => patchRule(rule.id, { multiplierPercent })}
                                />
                                <NumberField
                                    label={tr('levels.chanceToEarnXp')}
                                    value={rule.chancePercent}
                                    max={100}
                                    onChange={(chancePercent) => patchRule(rule.id, { chancePercent })}
                                />
                                <NumberField
                                    label={tr('levels.cooldownSeconds')}
                                    value={rule.cooldownSeconds}
                                    min={1}
                                    max={86400}
                                    onChange={(cooldownSeconds) => patchRule(rule.id, { cooldownSeconds })}
                                />
                                <NumberField
                                    label={tr('levels.ruleXpCapPerPersonPer')}
                                    value={rule.dailyCap}
                                    max={2000000000}
                                    onChange={(dailyCap) => patchRule(rule.id, { dailyCap })}
                                />
                            </div>
                            <p className="rounded-md bg-primary/10 p-3 text-sm">
                                {tr('levels.whenEarned')}{' '}
                                <strong>
                                    {Math.floor((((rule.minXp * rule.multiplierPercent) / 100) * draft.multiplierPercent) / 100).toLocaleString()}–
                                    {Math.floor((((rule.maxXp * rule.multiplierPercent) / 100) * draft.multiplierPercent) / 100).toLocaleString()} XP
                                </strong>{' '}
                                {tr('levels.eventChance')} {rule.chancePercent}%{rule.source === 'voice' && tr('levels.voiceCheckedEvery15Seconds')}
                            </p>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <IdChoices
                                    title={tr('levels.onlyInChannelsCategories')}
                                    options={channelOptions}
                                    voiceIds={voiceIds}
                                    emptyHint={
                                        rule.source === 'voice'
                                            ? tr('levels.noChannelSelectedEveryVoiceChannel')
                                            : tr('levels.noChannelSelectedAllChannelsSelect')
                                    }
                                    values={rule.channelIds}
                                    onChange={(channelIds) => patchRule(rule.id, { channelIds })}
                                />
                                <IdChoices
                                    title={tr('levels.onlyForMembersWithAnyOf')}
                                    options={roles.data ?? []}
                                    values={rule.roleIds}
                                    onChange={(roleIds) => patchRule(rule.id, { roleIds })}
                                />
                            </div>
                            {rule.source === 'command' && (
                                <label className="grid gap-1.5 text-sm">
                                    {tr('levels.commandNamesCommaSeparatedEmptyEvery')}
                                    <Input
                                        value={commandText[rule.id] ?? rule.commands.join(', ')}
                                        placeholder="ping, weather"
                                        onChange={(e) => {
                                            const text = e.target.value;
                                            setCommandText((old) => ({ ...old, [rule.id]: text }));
                                            patchRule(rule.id, {
                                                commands: text
                                                    .split(',')
                                                    .map((v) => v.trim().replace(/^\//, ''))
                                                    .filter(Boolean),
                                            });
                                        }}
                                    />
                                </label>
                            )}
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={index === 0}
                                    onClick={() => {
                                        const rules = [...draft.rules];
                                        [rules[index - 1], rules[index]] = [rules[index]!, rules[index - 1]!];
                                        patch({ rules });
                                    }}
                                >
                                    {tr('common.moveUp')}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={index === draft.rules.length - 1}
                                    onClick={() => {
                                        const rules = [...draft.rules];
                                        [rules[index], rules[index + 1]] = [rules[index + 1]!, rules[index]!];
                                        patch({ rules });
                                    }}
                                >
                                    {tr('common.moveDown')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {!draft.rules.length && (
                    <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">{tr('levels.noRulesYetMembersWontEarn')}</p>
                )}
                <div className="flex flex-wrap gap-2">
                    {XP_SOURCES.map((source) => (
                        <Button
                            key={source}
                            variant="outline"
                            disabled={draft.rules.length >= 50}
                            onClick={() => patch({ rules: [...draft.rules, { ...defaultXpRule(source, crypto.randomUUID()), enabled: true }] })}
                        >
                            <Plus />
                            {tr('levels.addRule')} {trText(XP_SOURCE_LABELS[source])}
                        </Button>
                    ))}
                    <Button
                        variant="ghost"
                        onClick={async () => {
                            if (
                                await confirm({
                                    title: tr('levels.restoreDefaultXpSettings'),
                                    description: tr('levels.replacesTheRulesYoureEditingKeeps'),
                                    destructive: true,
                                })
                            ) {
                                setDraft(defaultXpSettings());
                                setCommandText({});
                            }
                        }}
                    >
                        {tr('common.restoreDefaults')}
                    </Button>
                </div>
            </fieldset>
            <SaveBar
                dirty={dirty}
                saving={save.isPending}
                invalid={!parsed.success}
                saveLabel={tr('levels.saveAll')}
                onSave={() => save.mutate()}
                onReset={() => {
                    setDraft(saved.settings);
                    setCommandText({});
                }}
            >
                <Button
                    variant="outline"
                    disabled={save.isPending}
                    onClick={async () => {
                        if (dirty && !(await confirm({ title: tr('levels.discardChangesAndReloadTheLatest'), destructive: true }))) return;
                        try {
                            const latest = await client.fetchQuery({ ...xpSettingsQuery(guildId), staleTime: 0 });
                            setSaved(latest);
                            setDraft(latest.settings);
                            setCommandText({});
                        } catch (err) {
                            toast.error(errorMessage(err));
                        }
                    }}
                >
                    {tr('levels.reload')}
                </Button>
            </SaveBar>
        </div>
    );
}
