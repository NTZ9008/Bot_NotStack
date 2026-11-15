export interface GrafanaSettings {
    defaultChannelId: string;
    labelChannels: Record<string, string>;
    webhookPath: string;
    webhookSecret: string;
}

export interface GrafanaStats {
    range: { from: string; to: string; days: number; timeZone: 'Asia/Bangkok' };
    totals: { firing: number; resolved: number; sent: number };
    daily: Array<{ label: string; firing: number; resolved: number; sent: number }>;
}

export interface UpdateGrafanaSettingsInput {
    defaultChannelId: string;
    labelChannels: Record<string, string>;
}
