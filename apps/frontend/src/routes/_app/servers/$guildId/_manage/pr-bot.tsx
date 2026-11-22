import { tr } from '../../../../../lib/i18n';
import type { PrBotSettings, UpdatePrBotInput } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Copy, Eye, EyeOff, Loader2, Plus, RefreshCw, Save, X } from '@/components/icons';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { prBotQuery, rotatePrBotSecret, updatePrBot } from '@/api/bot';
import { guildChannelsQuery } from '@/api/guilds';
import { ChannelSelect } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { PrBotBodySkeleton } from '@/components/skeleton/guild-pages';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { API_BASE, errorMessage } from '@/lib/api';
import { PrBotStatsCard } from '@/features/pr-bot/stats-card';
import { useGuild, useGuildId } from '@/hooks/use-guild';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/pr-bot')({
    loader: ({ context, params }) =>
        Promise.all([
            context.queryClient.ensureQueryData(prBotQuery(params.guildId)),
            context.queryClient.ensureQueryData(guildChannelsQuery(params.guildId)).catch(() => undefined),
        ]),
    component: PrBotPage,
});

type Row = { key: string; value: string };
const toRows = (map: Record<string, string>): Row[] => {
    const rows = Object.entries(map).map(([key, value]) => ({ key, value }));
    return rows.length ? rows : [{ key: '', value: '' }];
};
const toMap = (rows: Row[]) => Object.fromEntries(rows.filter((r) => r.key.trim() && r.value.trim()).map((r) => [r.key.trim(), r.value.trim()]));

function useSavePrBot(successMessage: string) {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: UpdatePrBotInput) => updatePrBot(guildId, input),
        onSuccess: (data) => {
            queryClient.setQueryData(prBotQuery(guildId).queryKey, data);
            toast.success(successMessage);
        },
        onError: (err) => toast.error(tr('common.saveFailed'), { description: errorMessage(err) }),
    });
}

// แถว key → value ที่เพิ่ม/ลบได้ (แทนการพิมพ์ JSON ดิบ)
function MapEditor({
    title,
    description,
    initial,
    keyPlaceholder,
    valuePlaceholder,
    addLabel,
    saveLabel,
    onSave,
    saving,
}: {
    title: string;
    description: string;
    initial: Record<string, string>;
    keyPlaceholder: string;
    valuePlaceholder: string;
    addLabel: string;
    saveLabel: string;
    onSave: (map: Record<string, string>) => void;
    saving: boolean;
}) {
    const [rows, setRows] = useState<Row[]>(() => toRows(initial));
    useEffect(() => setRows(toRows(initial)), [initial]);
    const update = (index: number, patch: Partial<Row>) => setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {rows.map((row, index) => (
                    <div key={index} className="flex gap-2">
                        <Input placeholder={keyPlaceholder} value={row.key} onChange={(e) => update(index, { key: e.target.value })} />
                        <Input placeholder={valuePlaceholder} value={row.value} onChange={(e) => update(index, { value: e.target.value })} />
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={tr('prBot.removeRow')}
                            onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                        >
                            <X />
                        </Button>
                    </div>
                ))}
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setRows((prev) => [...prev, { key: '', value: '' }])}>
                        <Plus /> {addLabel}
                    </Button>
                    <Button onClick={() => onSave(toMap(rows))} disabled={saving}>
                        {saving ? <Loader2 className="animate-spin" /> : <Save />} {saveLabel}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function PrBotForm({ settings }: { settings: PrBotSettings }) {
    const guildId = useGuildId();
    const { data: channels = [] } = useQuery(guildChannelsQuery(guildId));
    const [defaultChannel, setDefaultChannel] = useState(settings.defaultChannelId);
    const saveDefault = useSavePrBot(tr('prBot.defaultChannelSaved'));
    const saveOrgs = useSavePrBot(tr('prBot.organizationMappingSaved'));
    const saveMentions = useSavePrBot(tr('prBot.mentionMappingSaved'));

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>{tr('common.defaultChannel')}</CardTitle>
                    <CardDescription>{tr('prBot.usedForOrganizationsReposNotListed')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Field hint={tr('prBot.pickDontSendTurnOffAlerts')}>
                        <form
                            className="flex gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                saveDefault.mutate({ defaultChannelId: defaultChannel.trim() });
                            }}
                        >
                            <ChannelSelect
                                channels={channels.filter((channel) => channel.sendable)}
                                value={defaultChannel}
                                onChange={setDefaultChannel}
                                noneLabel={tr('common.dontSend')}
                            />
                            <Button type="submit" disabled={saveDefault.isPending}>
                                {saveDefault.isPending ? <Loader2 className="animate-spin" /> : <Save />} {tr('common.save')}
                            </Button>
                        </form>
                    </Field>
                </CardContent>
            </Card>

            <MapEditor
                title={tr('prBot.channelsByOrganization')}
                description={tr('prBot.whichChannelEachOrganizationsPrsGo')}
                initial={settings.orgChannels}
                keyPlaceholder={tr('prBot.eGMudst2026Pegasus')}
                valuePlaceholder="Channel ID"
                addLabel={tr('prBot.addOrganization')}
                saveLabel={tr('prBot.saveOrganizationMapping')}
                onSave={(orgChannels) => saveOrgs.mutate({ orgChannels })}
                saving={saveOrgs.isPending}
            />

            <MapEditor
                title={tr('prBot.mentionsByRepo')}
                description={tr('prBot.whichRoleToMentionWhenA')}
                initial={settings.repoMentions}
                keyPlaceholder={tr('prBot.eGMudst2026PegasusPegasus')}
                valuePlaceholder={tr('prBot.roleNameOrRoleId')}
                addLabel={tr('prBot.addRepo')}
                saveLabel={tr('prBot.saveMentionMapping')}
                onSave={(repoMentions) => saveMentions.mutate({ repoMentions })}
                saving={saveMentions.isPending}
            />
        </>
    );
}

async function copy(text: string, label: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(tr('common.copied', { 0: label }));
    } catch {
        toast.error(tr('prBot.copyFailedSelectTheTextAnd'));
    }
}

// URL + secret ที่ต้องใส่ใน GitHub (Settings → Webhooks) — แต่ละเซิร์ฟเวอร์มีของตัวเอง
function WebhookCard({ settings }: { settings: PrBotSettings }) {
    const guild = useGuild();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const [reveal, setReveal] = useState(false);
    const url = `${API_BASE || window.location.origin}${settings.webhookPath}`;
    const rotate = useMutation({
        mutationFn: () => rotatePrBotSecret(guild.id),
        onSuccess: ({ webhookSecret }) => {
            queryClient.setQueryData(prBotQuery(guild.id).queryKey, { ...settings, webhookSecret });
            setReveal(true);
            toast.success(tr('prBot.newSecretCreated'), { description: tr('prBot.rememberToUpdateTheSecretField') });
        },
        onError: (err) => toast.error(tr('prBot.failedToCreateANewSecret'), { description: errorMessage(err) }),
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle>GitHub Webhook</CardTitle>
                <CardDescription>
                    {tr('prBot.inGithubSettingsWebhooksAddWebhook')} <code>application/json</code>
                    {tr('prBot.chooseLetMeSelectIndividualEvents')} <b>Pull requests</b>, <b>Pull request reviews</b>, <b>Pull request review comments</b>,{' '}
                    <b>Issue comments</b>, <b>Check runs</b> {tr('common.and')} <b>Statuses</b> {tr('prBot.theDiscordMessageUpdatesItselfWhen')}
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                <Field label="Payload URL">
                    <div className="flex gap-2">
                        <Input readOnly className="font-mono text-xs" value={url} onFocus={(e) => e.target.select()} />
                        <Button variant="outline" onClick={() => void copy(url, ' URL')}>
                            <Copy /> {tr('common.copy')}
                        </Button>
                    </div>
                </Field>
                <Field label="Secret" hint={tr('prBot.anyoneWithThisSecretCanSend')}>
                    <div className="flex flex-wrap gap-2">
                        <Input
                            readOnly
                            className="min-w-0 flex-1 font-mono text-xs"
                            type={reveal ? 'text' : 'password'}
                            value={settings.webhookSecret}
                            onFocus={(e) => e.target.select()}
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            aria-label={reveal ? tr('prBot.hideSecret') : tr('prBot.showSecret')}
                            onClick={() => setReveal((value) => !value)}
                        >
                            {reveal ? <EyeOff /> : <Eye />}
                        </Button>
                        <Button variant="outline" onClick={() => void copy(settings.webhookSecret, ' secret')}>
                            <Copy /> {tr('common.copy')}
                        </Button>
                        <Button
                            variant="outline"
                            disabled={rotate.isPending}
                            onClick={async () => {
                                const ok = await confirm({
                                    title: tr('prBot.createANewSecret'),
                                    description: tr('prBot.theOldSecretStopsWorkingImmediately'),
                                    confirmText: tr('common.createNew'),
                                    destructive: true,
                                });
                                if (ok) rotate.mutate();
                            }}
                        >
                            {rotate.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} {tr('common.createNew')}
                        </Button>
                    </div>
                </Field>
                {guild.isHome && (
                    <p className="text-xs text-muted-foreground">
                        {tr('prBot.homeServerTheOldWebhook')} <code>/webhook/github</code> {tr('prBot.usingGithubWebhookSecretInThe')}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

function PrBotPage() {
    const guildId = useGuildId();
    const { data, isLoading, error } = useQuery(prBotQuery(guildId));
    return (
        <>
            <PageHeader help="prBot" title={tr('common.githubPrAlerts')} description={tr('prBot.setThePullRequestAlertChannel')} />
            {isLoading ? (
                <PrBotBodySkeleton />
            ) : error ? (
                <ErrorState error={error} />
            ) : (
                data && (
                    <>
                        <PrBotStatsCard guildId={guildId} />
                        <WebhookCard settings={data} />
                        <PrBotForm settings={data} />
                    </>
                )
            )}
        </>
    );
}
