import type { LucideIcon } from 'lucide-react';
import type { PluginCategory, PluginIconName, PluginId } from '@notstack/shared';
import { Activity, CalendarClock, Coins, GitPullRequest, HeartPulse, Sparkles, Ticket } from '@/components/icons';
import { tr } from '@/lib/i18n';

const ICON_BY_NAME: Record<PluginIconName, LucideIcon> = {
    GitPullRequest,
    Activity,
    Ticket,
    Coins,
    HeartPulse,
    CalendarClock,
    Sparkles,
};

const ICON_BY_ID: Record<PluginId, LucideIcon> = {
    'github-pr': GitPullRequest,
    'grafana-alert': Activity,
    'jira-card': Ticket,
    'savings-goal': Coins,
    'uptime-monitor': HeartPulse,
    'scheduled-reminders': CalendarClock,
    'reaction-roles': Sparkles,
};

export interface PluginAccentStyle {
    badgeBg: string;
    iconText: string;
    borderHover: string;
}

const ACCENT_BY_ID: Record<PluginId, PluginAccentStyle> = {
    'github-pr': {
        badgeBg: 'bg-purple-500/12 border-purple-500/25',
        iconText: 'text-purple-500 dark:text-purple-400',
        borderHover: 'hover:border-purple-500/40',
    },
    'grafana-alert': {
        badgeBg: 'bg-sky-500/12 border-sky-500/25',
        iconText: 'text-sky-500 dark:text-sky-400',
        borderHover: 'hover:border-sky-500/40',
    },
    'jira-card': {
        badgeBg: 'bg-amber-500/12 border-amber-500/25',
        iconText: 'text-amber-500 dark:text-amber-400',
        borderHover: 'hover:border-amber-500/40',
    },
    'savings-goal': {
        badgeBg: 'bg-emerald-500/12 border-emerald-500/25',
        iconText: 'text-emerald-500 dark:text-emerald-400',
        borderHover: 'hover:border-emerald-500/40',
    },
    'uptime-monitor': {
        badgeBg: 'bg-rose-500/12 border-rose-500/25',
        iconText: 'text-rose-500 dark:text-rose-400',
        borderHover: 'hover:border-rose-500/40',
    },
    'scheduled-reminders': {
        badgeBg: 'bg-teal-500/12 border-teal-500/25',
        iconText: 'text-teal-500 dark:text-teal-400',
        borderHover: 'hover:border-teal-500/40',
    },
    'reaction-roles': {
        badgeBg: 'bg-violet-500/12 border-violet-500/25',
        iconText: 'text-violet-500 dark:text-violet-400',
        borderHover: 'hover:border-violet-500/40',
    },
};

export function pluginIcon(idOrIcon: PluginId | PluginIconName): LucideIcon {
    if (idOrIcon in ICON_BY_ID) return ICON_BY_ID[idOrIcon as PluginId];
    return ICON_BY_NAME[idOrIcon as PluginIconName];
}

export function pluginAccent(id: PluginId): PluginAccentStyle {
    return ACCENT_BY_ID[id];
}

export function pluginCopy(id: PluginId): { name: string; description: string } {
    switch (id) {
        case 'github-pr':
            return { name: tr('plugins.featureGithubPrName'), description: tr('plugins.featureGithubPrDesc') };
        case 'grafana-alert':
            return { name: tr('plugins.featureGrafanaAlertName'), description: tr('plugins.featureGrafanaAlertDesc') };
        case 'jira-card':
            return { name: tr('plugins.featureJiraCardName'), description: tr('plugins.featureJiraCardDesc') };
        case 'savings-goal':
            return { name: tr('plugins.featureSavingsGoalName'), description: tr('plugins.featureSavingsGoalDesc') };
        case 'uptime-monitor':
            return { name: tr('plugins.featureUptimeMonitorName'), description: tr('plugins.featureUptimeMonitorDesc') };
        case 'scheduled-reminders':
            return { name: tr('plugins.featureScheduledRemindersName'), description: tr('plugins.featureScheduledRemindersDesc') };
        case 'reaction-roles':
            return { name: tr('plugins.featureReactionRolesName'), description: tr('plugins.featureReactionRolesDesc') };
    }
}

export function pluginCategoryLabel(category: PluginCategory): string {
    switch (category) {
        case 'devops':
            return tr('plugins.categoryDevops');
        case 'productivity':
            return tr('plugins.categoryProductivity');
        case 'finance':
            return tr('plugins.categoryFinance');
        case 'community':
            return tr('plugins.categoryCommunity');
    }
}
