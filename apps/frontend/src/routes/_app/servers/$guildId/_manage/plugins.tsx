import { useMemo, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { PLUGIN_CATEGORIES, type GuildPluginState, type PluginCategory, type PluginId } from '@notstack/shared';
import { toast } from 'sonner';
import { guildPluginsQuery, usePluginMutations } from '@/api/plugins';
import { useConfirm } from '@/components/confirm-dialog';
import { Blocks, CheckCircle2, Loader2, PlugZap, Settings, Trash2 } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { SearchInput } from '@/components/search-input';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useGuild, useGuildId } from '@/hooks/use-guild';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { pluginAccent, pluginCategoryLabel, pluginCopy, pluginIcon } from '@/lib/plugin-ui';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'installed' | 'not-installed';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/plugins')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(guildPluginsQuery(params.guildId)),
    component: PluginsPage,
});

function PluginGridSkeleton() {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, idx) => (
                <Card key={idx} className="p-5">
                    <div className="flex items-start gap-3.5">
                        <Skeleton className="size-11 shrink-0 rounded-xl" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </div>
                    <Skeleton className="mt-4 h-10 w-full" />
                    <Skeleton className="mt-5 h-8 w-full" />
                </Card>
            ))}
        </div>
    );
}

function PluginCard({
    plugin,
    guildId,
    busy,
    onInstall,
    onUninstall,
}: {
    plugin: GuildPluginState;
    guildId: string;
    busy: boolean;
    onInstall: (plugin: GuildPluginState) => void;
    onUninstall: (plugin: GuildPluginState) => void;
}) {
    const t = useT();
    const Icon = pluginIcon(plugin.id);
    const accent = pluginAccent(plugin.id);
    const copy = pluginCopy(plugin.id);

    return (
        <Card
            className={cn(
                'flex flex-col justify-between transition-colors',
                plugin.installed ? 'border-border bg-card' : 'border-border/75 bg-card/75',
                accent.borderHover,
            )}
        >
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                        <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl border', accent.badgeBg)}>
                            <Icon className={cn('size-5', accent.iconText)} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-sm font-semibold text-foreground">{copy.name}</h3>
                                <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-mono text-muted-foreground">
                                    {t('plugins.versionLabel', { 0: plugin.version })}
                                </Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span>{pluginCategoryLabel(plugin.category)}</span>
                                <span aria-hidden>·</span>
                                <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{plugin.id}</code>
                            </div>
                        </div>
                    </div>

                    {plugin.installed ? (
                        <Badge className="shrink-0 gap-1 border border-emerald-500/30 bg-emerald-500/12 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400">
                            <CheckCircle2 className="size-3" />
                            {t('plugins.statusInstalled')}
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="shrink-0 text-muted-foreground">
                            {t('plugins.statusNotInstalled')}
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="flex-1 pt-0 pb-4">
                <p className="text-xs leading-relaxed text-muted-foreground">{copy.description}</p>
            </CardContent>

            <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                <div className="min-w-0 text-[11px] text-muted-foreground">
                    {plugin.installed && plugin.installedAt ? (
                        <span className="block truncate">
                            {t('plugins.installedAt', { 0: formatDateTime(plugin.installedAt) })}
                            {plugin.installedBy ? ` · ${t('plugins.installedBy', { 0: plugin.installedBy })}` : ''}
                        </span>
                    ) : (
                        <span>{pluginCategoryLabel(plugin.category)}</span>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    {plugin.installed ? (
                        <>
                            <Link
                                to={plugin.routePath}
                                params={{ guildId }}
                                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 gap-1.5 text-xs')}
                            >
                                <Settings className="size-3.5" />
                                {t('plugins.configure')}
                            </Link>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => onUninstall(plugin)}
                                className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                                {busy ? t('plugins.uninstalling') : t('plugins.uninstall')}
                            </Button>
                        </>
                    ) : (
                        <Button type="button" size="sm" disabled={busy} onClick={() => onInstall(plugin)} className="h-8 gap-1.5 text-xs">
                            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <PlugZap className="size-3.5" />}
                            {busy ? t('plugins.installing') : t('plugins.install')}
                        </Button>
                    )}
                </div>
            </CardFooter>
        </Card>
    );
}

function PluginsPage() {
    const t = useT();
    const guildId = useGuildId();
    const guild = useGuild();
    const confirm = useConfirm();
    const { data, isLoading, error } = useQuery(guildPluginsQuery(guildId));
    const { install, uninstall } = usePluginMutations(guildId);

    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<'all' | PluginCategory>('all');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [activePluginId, setActivePluginId] = useState<PluginId | null>(null);

    const plugins = useMemo(() => data?.plugins ?? [], [data?.plugins]);
    const installedCount = data?.installedIds.length ?? guild.installedPlugins?.length ?? 0;
    const totalCount = plugins.length || 4;

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return plugins.filter((plugin) => {
            if (category !== 'all' && plugin.category !== category) return false;
            if (status === 'installed' && !plugin.installed) return false;
            if (status === 'not-installed' && plugin.installed) return false;
            if (!q) return true;
            const copy = pluginCopy(plugin.id);
            const hay = `${plugin.id} ${plugin.name} ${plugin.description} ${copy.name} ${copy.description} ${pluginCategoryLabel(plugin.category)}`.toLowerCase();
            return hay.includes(q);
        });
    }, [plugins, category, status, search]);

    const handleInstall = async (plugin: GuildPluginState) => {
        setActivePluginId(plugin.id);
        const copy = pluginCopy(plugin.id);
        try {
            await install.mutateAsync(plugin.id);
            toast.success(t('plugins.installedToast', { 0: copy.name }));
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setActivePluginId(null);
        }
    };

    const handleUninstall = async (plugin: GuildPluginState) => {
        const copy = pluginCopy(plugin.id);
        const ok = await confirm({
            title: t('plugins.confirmUninstallTitle', { 0: copy.name }),
            description: t('plugins.confirmUninstallDescription', { 0: copy.name }),
            confirmText: t('plugins.uninstall'),
            destructive: true,
        });
        if (!ok) return;

        setActivePluginId(plugin.id);
        try {
            await uninstall.mutateAsync(plugin.id);
            toast.success(t('plugins.uninstalledToast', { 0: copy.name }));
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setActivePluginId(null);
        }
    };

    return (
        <>
            <PageHeader
                help="plugins"
                title={t('common.plugins')}
                description={t('common.installAndManageAddOnFeatures')}
                actions={
                    <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs font-medium">
                        <Blocks className="size-3.5 text-primary" />
                        {t('plugins.installedCount', { 0: installedCount, 1: totalCount })}
                    </Badge>
                }
            />

            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 lg:flex-row lg:items-center lg:justify-between">
                <SearchInput value={search} onChange={setSearch} placeholder={t('plugins.searchPlaceholder')} className="w-full lg:w-64" />

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-background/60 p-1">
                        <Button
                            type="button"
                            size="sm"
                            variant={category === 'all' ? 'secondary' : 'ghost'}
                            onClick={() => setCategory('all')}
                            className="h-7 px-2.5 text-xs"
                        >
                            {t('plugins.allCategories')}
                        </Button>
                        {PLUGIN_CATEGORIES.map((cat) => (
                            <Button
                                key={cat}
                                type="button"
                                size="sm"
                                variant={category === cat ? 'secondary' : 'ghost'}
                                onClick={() => setCategory(cat)}
                                className="h-7 px-2.5 text-xs"
                            >
                                {pluginCategoryLabel(cat)}
                            </Button>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-background/60 p-1">
                        {(['all', 'installed', 'not-installed'] as const).map((nextStatus) => {
                            const label =
                                nextStatus === 'all'
                                    ? t('plugins.allStatuses')
                                    : nextStatus === 'installed'
                                      ? t('plugins.filterInstalled')
                                      : t('plugins.filterNotInstalled');
                            return (
                                <Button
                                    key={nextStatus}
                                    type="button"
                                    size="sm"
                                    variant={status === nextStatus ? 'secondary' : 'ghost'}
                                    onClick={() => setStatus(nextStatus)}
                                    className="h-7 px-2.5 text-xs"
                                >
                                    {label}
                                </Button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {isLoading ? (
                <PluginGridSkeleton />
            ) : error ? (
                <ErrorState error={error} />
            ) : filtered.length === 0 ? (
                <EmptyState>
                    <p className="text-sm font-medium text-foreground">{t('plugins.emptyTitle')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('plugins.emptyDescription')}</p>
                </EmptyState>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {filtered.map((plugin) => (
                        <PluginCard
                            key={plugin.id}
                            plugin={plugin}
                            guildId={guildId}
                            busy={activePluginId === plugin.id}
                            onInstall={handleInstall}
                            onUninstall={handleUninstall}
                        />
                    ))}
                </div>
            )}
        </>
    );
}
