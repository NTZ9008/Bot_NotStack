import { tr } from '../../../../../lib/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Bot, CheckCircle2, Eye, EyeOff, ExternalLink, Loader2, RefreshCw, Save, ShieldAlert, Trash2 } from '@/components/icons';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { aiSettingsQuery, testAiKey, updateAiSettings } from '@/api/ai';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useGuildId } from '@/hooks/use-guild';
import { errorMessage } from '@/lib/api';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/ai')({ component: AiSettingsPage });

function compact(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.00$/, '')}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 2).replace(/\.00$/, '')}K`;
    return String(value);
}

function Progress({ current, limit, cooldown }: { current: number; limit: number; cooldown: boolean }) {
    const ratio = Math.min(100, (current / Math.max(1, limit)) * 100);
    const color = cooldown || ratio >= 100 ? '#ef4444' : ratio > 70 ? '#f59e0b' : '#cbd5e1';
    return (
        <div className="space-y-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full transition-all" style={{ width: `${ratio}%`, backgroundColor: color }} />
            </div>
            <div className="text-xs tabular-nums text-muted-foreground">
                {compact(current)} / {compact(limit)}
            </div>
        </div>
    );
}

function AiSettingsPage() {
    const guildId = useGuildId();
    const client = useQueryClient();
    const query = aiSettingsQuery(guildId);
    const { data, isLoading, refetch, isFetching } = useQuery(query);
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [dailyLimit, setDailyLimit] = useState('500');
    const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
    const canEnable = Boolean(data?.hasKey || data?.hasFallbackHomeKey);
    const savedDailyLimit = data?.dailyLimit;

    useEffect(() => {
        if (savedDailyLimit !== undefined) setDailyLimit(String(savedDailyLimit));
    }, [savedDailyLimit]);

    const save = useMutation({
        mutationFn: () => updateAiSettings(guildId, { ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), dailyLimit: Number(dailyLimit) }),
        onSuccess: (next) => {
            setApiKey('');
            setTestResult(null);
            client.setQueryData(query.queryKey, next);
            toast.success(tr('ai.aiSettingsSaved'));
        },
        onError: (error) => toast.error(tr('common.saveFailed'), { description: errorMessage(error) }),
    });
    const toggle = useMutation({
        mutationFn: (aiEnabled: boolean) => updateAiSettings(guildId, { aiEnabled }),
        onSuccess: (next) => {
            client.setQueryData(query.queryKey, next);
            toast.success(next.aiEnabled ? tr('ai.aiEnabled') : tr('ai.aiDisabled'));
        },
        onError: (error) => toast.error(tr('common.failedToChangeStatus'), { description: errorMessage(error) }),
    });
    const removeKey = useMutation({
        mutationFn: () => updateAiSettings(guildId, { apiKey: null }),
        onSuccess: (next) => {
            client.setQueryData(query.queryKey, next);
            setApiKey('');
            toast.success(tr('ai.apiKeyRemoved'));
        },
        onError: (error) => toast.error(tr('ai.failedToRemoveKey'), { description: errorMessage(error) }),
    });
    const test = useMutation({
        mutationFn: () => testAiKey(guildId, apiKey.trim() || undefined),
        onSuccess: (result) => {
            setTestResult(result);
            if (result.ok) toast.success(result.message);
            else toast.error(result.message);
        },
        onError: (error) => {
            setTestResult({ ok: false, message: errorMessage(error) });
            toast.error(tr('ai.keyTestFailed'), { description: errorMessage(error) });
        },
    });

    return (
        <div className="space-y-6">
            <PageHeader title={tr('common.aiChatSettings')} description={tr('ai.manageTheGeminiApiKeyAnd')} />
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bot className="size-5 text-highlight" />
                        {tr('ai.statusAndGeminiApiKey')}
                    </CardTitle>
                    <CardDescription>{tr('ai.theKeyIsEncryptedBeforeSaving')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            {tr('ai.loadingSettings')}
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
                                <div className="space-y-1">
                                    <div className="font-medium">
                                        {tr('ai.aiSystem')} {data?.aiEnabled ? tr('common.enabled') : tr('common.disable')}
                                    </div>
                                    <p className="max-w-2xl text-sm text-muted-foreground">
                                        {data?.aiEnabled ? tr('ai.theBotRepliesWhenMentionedAnd') : tr('ai.whenOffTheBotWontReply')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={data?.aiEnabled ? 'text-sm text-emerald-700 dark:text-emerald-400' : 'text-sm text-muted-foreground'}>
                                        {data?.aiEnabled ? tr('ai.on') : tr('common.close')}
                                    </span>
                                    <Switch
                                        checked={Boolean(data?.aiEnabled)}
                                        disabled={toggle.isPending || (!data?.aiEnabled && !canEnable)}
                                        onCheckedChange={(checked) => toggle.mutate(checked)}
                                    />
                                </div>
                            </div>
                            {!data?.aiEnabled && !canEnable && (
                                <p className="-mt-2 text-sm text-amber-700 dark:text-amber-400">{tr('ai.saveAGeminiApiKeyFirst')}</p>
                            )}
                            {data?.isUsingFallbackHomeKey && (
                                <p className="rounded-md border border-highlight/30 bg-highlight/5 p-3 text-sm text-highlight">
                                    {tr('ai.theHomeServerIsUsingThe')}
                                    {data.maskedKey ?? 'GEMINI_KEY'})
                                </p>
                            )}
                            <div className="grid gap-2">
                                <Label htmlFor="gemini-key">Gemini API Key</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="gemini-key"
                                        type={showKey ? 'text' : 'password'}
                                        autoComplete="off"
                                        placeholder={data?.maskedKey ?? tr('ai.pasteAGeminiApiKeyHere')}
                                        value={apiKey}
                                        onChange={(event) => setApiKey(event.target.value)}
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        aria-label={showKey ? tr('ai.hideKey') : tr('ai.showKey')}
                                        onClick={() => setShowKey(!showKey)}
                                    >
                                        {showKey ? <EyeOff /> : <Eye />}
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {data?.hasKey ? tr('ai.set', { 0: data.maskedKey }) : tr('ai.noKeySetForThisServer')}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="outline"
                                    disabled={test.isPending || (!apiKey.trim() && !data?.hasKey && !data?.isUsingFallbackHomeKey)}
                                    onClick={() => test.mutate()}
                                >
                                    {test.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                                    {tr('ai.testKey')}
                                </Button>
                                <Button disabled={save.isPending || (!apiKey.trim() && Number(dailyLimit) === data?.dailyLimit)} onClick={() => save.mutate()}>
                                    {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                                    {tr('ai.saveSettings')}
                                </Button>
                                {data?.hasKey && (
                                    <Button variant="destructive" disabled={removeKey.isPending} onClick={() => removeKey.mutate()}>
                                        {removeKey.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                                        {tr('ai.removeKey')}
                                    </Button>
                                )}
                                {testResult && (
                                    <span
                                        className={testResult.ok ? 'text-sm text-emerald-700 dark:text-emerald-400' : 'text-sm text-red-700 dark:text-red-400'}
                                    >
                                        {testResult.message}
                                    </span>
                                )}
                            </div>
                            <div className="grid max-w-sm gap-2">
                                <Label htmlFor="daily-limit">{tr('ai.serverDailyRequestLimit')}</Label>
                                <Input
                                    id="daily-limit"
                                    type="number"
                                    min="1"
                                    max="100000"
                                    value={dailyLimit}
                                    onChange={(event) => setDailyLimit(event.target.value)}
                                />
                            </div>
                            <div className="rounded-lg border bg-muted/20 p-4 text-sm">
                                <p className="mb-1 font-medium">{tr('ai.getAFreeApiKeyFrom')}</p>
                                <p className="text-muted-foreground">{tr('ai.createAnApiKeyInYour')}</p>
                                <a
                                    className="mt-2 inline-flex items-center gap-1 text-highlight hover:underline"
                                    href="https://aistudio.google.com/app/apikey"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {tr('ai.openGoogleAiStudio')} <ExternalLink className="size-3.5" />
                                </a>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <CardTitle>Gemini API Rate Limit &amp; Usage</CardTitle>
                            <CardDescription className="mt-1">
                                {tr('ai.requestsToday')} {data?.todayTotalRequests ?? 0} {tr('ai.entriesAutoRefreshEvery20Seconds')}
                            </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                            {isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                            {tr('common.refresh')}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[850px] text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs text-muted-foreground">
                                    <th className="px-3 py-3 font-medium">Model</th>
                                    <th className="px-3 py-3 font-medium">Category</th>
                                    <th className="w-44 px-3 py-3 font-medium">{tr('ai.rpmRequestsMin')}</th>
                                    <th className="w-44 px-3 py-3 font-medium">{tr('ai.tpmTokensMin')}</th>
                                    <th className="w-44 px-3 py-3 font-medium">{tr('ai.rpdRequestsDay')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data?.models.map((model) => {
                                    const cooldownSeconds = model.cooldownUntil ? Math.max(0, Math.ceil((model.cooldownUntil - Date.now()) / 1000)) : 0;
                                    const modelLabel = model.name
                                        .replace('gemini-', 'Gemini ')
                                        .replaceAll('-', ' ')
                                        .replace(/\bflash\b/i, 'Flash')
                                        .replace(/\blite\b/i, 'Lite');
                                    return (
                                        <tr key={model.name} className="border-b last:border-0">
                                            <td className="px-3 py-4">
                                                <div className="flex items-center gap-2 font-medium">
                                                    <span className={`size-2 rounded-full ${model.status === 'cooldown' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                                    {modelLabel}
                                                </div>
                                                {cooldownSeconds > 0 && (
                                                    <div className="mt-1 flex items-center gap-1 text-xs text-red-700 dark:text-red-400">
                                                        <ShieldAlert className="size-3" />
                                                        {tr('ai.coolingDown')} {cooldownSeconds} {tr('ai.seconds')}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-4 text-muted-foreground">{model.category}</td>
                                            <td className="px-3 py-4">
                                                <Progress current={model.rpm.current} limit={model.rpm.limit} cooldown={model.status === 'cooldown'} />
                                            </td>
                                            <td className="px-3 py-4">
                                                <Progress current={model.tpm.current} limit={model.tpm.limit} cooldown={model.status === 'cooldown'} />
                                            </td>
                                            <td className="px-3 py-4">
                                                <Progress current={model.rpd.current} limit={model.rpd.limit} cooldown={model.status === 'cooldown'} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
