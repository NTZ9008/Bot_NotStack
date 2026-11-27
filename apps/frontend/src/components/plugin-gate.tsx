import { useState, type ReactNode } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { PLUGIN_MAP, type PluginId } from '@notstack/shared';
import { toast } from 'sonner';
import { guildPluginsQuery, usePluginMutations } from '@/api/plugins';
import { ArrowRight, Lock, PlugZap } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useGuild } from '@/hooks/use-guild';
import { errorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { PageGuideKey } from '@/lib/page-guides';
import { pluginAccent, pluginCategoryLabel, pluginCopy, pluginIcon } from '@/lib/plugin-ui';
import { cn } from '@/lib/utils';

export interface PluginRouteGuardProps {
    pluginId: PluginId;
    title: string;
    description: string;
    help: PageGuideKey;
    children: () => ReactNode;
}

export function PluginRouteGuard({ pluginId, title, description, help, children }: PluginRouteGuardProps) {
    const t = useT();
    const guild = useGuild();
    const { install } = usePluginMutations(guild.id);
    const [installing, setInstalling] = useState(false);

    const hasFromGuild = guild.installedPlugins?.includes(pluginId) ?? false;
    const { data: pluginsData } = useQuery({
        ...guildPluginsQuery(guild.id),
        enabled: guild.installedPlugins === undefined,
    });

    const isInstalled = hasFromGuild || (pluginsData?.installedIds.includes(pluginId) ?? false);
    if (isInstalled) return <>{children()}</>;

    const def = PLUGIN_MAP.get(pluginId);
    const Icon = pluginIcon(pluginId);
    const accent = pluginAccent(pluginId);
    const copy = pluginCopy(pluginId);

    const handleInstall = async () => {
        setInstalling(true);
        try {
            await install.mutateAsync(pluginId);
            toast.success(t('plugins.installedToast', { 0: copy.name }));
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setInstalling(false);
        }
    };

    return (
        <>
            <PageHeader help={help} title={title} description={description} />
            <Card className="border-dashed border-border/80 bg-card/80">
                <CardContent className="flex flex-col items-center px-6 py-12 text-center sm:py-16">
                    <div className="relative mb-5">
                        <div className={cn('flex size-16 items-center justify-center rounded-2xl border', accent.badgeBg)}>
                            <Icon className={cn('size-8', accent.iconText)} />
                        </div>
                        <span className="absolute -right-1.5 -bottom-1.5 flex size-7 items-center justify-center rounded-full border border-border bg-background shadow-sm">
                            <Lock className="size-3.5 text-muted-foreground" />
                        </span>
                    </div>

                    <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
                        {def && (
                            <Badge variant="outline" className="text-[11px] font-medium">
                                {pluginCategoryLabel(def.category)}
                            </Badge>
                        )}
                        <Badge variant="secondary" className="text-[11px] font-mono">
                            {pluginId}
                        </Badge>
                    </div>

                    <h2 className="text-lg font-semibold text-foreground">{t('plugins.lockedTitle', { 0: copy.name })}</h2>
                    <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{t('plugins.lockedDescription', { 0: guild.name })}</p>
                    <p className="mt-2 max-w-lg text-xs text-muted-foreground/90">{copy.description}</p>

                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                        <Button type="button" onClick={handleInstall} disabled={installing || install.isPending} className="gap-2">
                            {installing || install.isPending ? <Spinner className="size-4" /> : <PlugZap className="size-4" />}
                            {installing || install.isPending ? t('plugins.installing') : t('plugins.installNow')}
                        </Button>
                        <Link to="/servers/$guildId/plugins" params={{ guildId: guild.id }} className={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}>
                            {t('plugins.goToPlugins')}
                            <ArrowRight className="size-4" />
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
