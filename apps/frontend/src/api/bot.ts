import type {
    AccessRoom,
    ConfigRow,
    GrantAccessInput,
    GrantAccessResponse,
    LevelPage,
    LevelQuery,
    LogEventSetting,
    LogOptions,
    LogSettingsResponse,
    NewsInput,
    PrBotSecretResponse,
    PrBotSettings,
    RoomAccessItem,
    SuccessResponse,
    UpdateConfigInput,
    UpdateLogOptionsInput,
    UpdateLogSettingInput,
    UpdatePrBotInput,
    VoiceGuardChannel,
    VoiceGuardChannelInput,
    VoiceGuardMode,
    VoiceGuardUserInput,
} from '@notstack/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { guildKey } from './guilds';

// path ของ API ของเซิร์ฟเวอร์หนึ่ง
const g = (guildId: string, path = '') => `/guilds/${guildId}${path}`;

// ==========================================
// ⚙️ Configuration / 🏆 Levels
// ==========================================
export const configQuery = (guildId: string) => queryOptions({ queryKey: [...guildKey(guildId), 'config'], queryFn: () => api<ConfigRow[]>(g(guildId, '/config')) });
export const updateConfig = (guildId: string, input: UpdateConfigInput) => api<SuccessResponse>(g(guildId, '/config'), { body: input });

export const levelsQuery = (guildId: string, query: Partial<LevelQuery> = {}) => queryOptions({ queryKey: [...guildKey(guildId), 'levels', 'list', query], queryFn: ({ signal }) => api<LevelPage>(g(guildId, '/levels'), { query, signal }) });

// ==========================================
// 🗒️ ไฟล์ log ของบอท (ส่วนกลาง — ADMIN)
// ==========================================
export const logFilesQuery = queryOptions({ queryKey: ['logs'], queryFn: () => api<string[]>('/logs') });
export const logFileQuery = (name: string) =>
    queryOptions({
        queryKey: ['logs', name],
        queryFn: () => api<string>(`/logs/${encodeURIComponent(name)}`, { responseType: 'text' }),
        enabled: Boolean(name),
    });

// ==========================================
// 📰 News
// ==========================================
export const sendNews = (guildId: string, input: NewsInput) => api<SuccessResponse>(g(guildId, '/news'), { body: input });

// ==========================================
// 🎫 Room Access
// ==========================================
export const roomAccessQuery = (guildId: string) =>
    queryOptions({ queryKey: [...guildKey(guildId), 'room-access'], queryFn: () => api<RoomAccessItem[]>(g(guildId, '/room-access')) });
export const accessRoomsQuery = (guildId: string) =>
    queryOptions({ queryKey: [...guildKey(guildId), 'room-access', 'rooms'], queryFn: () => api<AccessRoom[]>(g(guildId, '/room-access/rooms')) });

export const roomAccessApi = {
    change: (guildId: string, input: GrantAccessInput) => api<GrantAccessResponse>(g(guildId, '/room-access'), { body: input }),
    addRoom: (guildId: string, channelId: string) => api<AccessRoom[]>(g(guildId, '/room-access/rooms'), { body: { channelId } }),
    removeRoom: (guildId: string, channelId: string) => api<AccessRoom[]>(g(guildId, '/room-access/rooms/delete'), { body: { channelId } }),
};

// ==========================================
// 🎙️ Voice Guard
// ==========================================
export const voiceGuardQuery = (guildId: string, mode: VoiceGuardMode) =>
    queryOptions({ queryKey: [...guildKey(guildId), 'voice-guard', mode], queryFn: () => api<VoiceGuardChannel[]>(g(guildId, `/${mode}`)) });

export const voiceGuardApi = {
    updateChannel: (guildId: string, mode: VoiceGuardMode, input: VoiceGuardChannelInput) => api<SuccessResponse>(g(guildId, `/${mode}/channel`), { body: input }),
    deleteChannel: (guildId: string, mode: VoiceGuardMode, channelId: string) =>
        api<SuccessResponse>(g(guildId, `/${mode}/channel/delete`), { body: { channelId } }),
    addUser: (guildId: string, mode: VoiceGuardMode, input: VoiceGuardUserInput) => api<SuccessResponse>(g(guildId, `/${mode}/user`), { body: input }),
    removeUser: (guildId: string, mode: VoiceGuardMode, input: VoiceGuardUserInput) => api<SuccessResponse>(g(guildId, `/${mode}/user/delete`), { body: input }),
};

// ==========================================
// 📋 Log Management
// ==========================================
export const logSettingsQuery = (guildId: string) =>
    queryOptions({ queryKey: [...guildKey(guildId), 'log-settings'], queryFn: () => api<LogSettingsResponse>(g(guildId, '/log-settings')) });

export const logSettingsApi = {
    update: (guildId: string, input: UpdateLogSettingInput) => api<{ success: true; setting: LogEventSetting }>(g(guildId, '/log-settings'), { body: input }),
    toggleSystem: (guildId: string, enabled: boolean) => api<{ success: true; systemEnabled: boolean }>(g(guildId, '/log-settings/system'), { body: { enabled } }),
    applyAll: (guildId: string, channelId: string) => api<{ success: true; events: LogEventSetting[] }>(g(guildId, '/log-settings/apply-all'), { body: { channelId } }),
    updateOptions: (guildId: string, input: UpdateLogOptionsInput) =>
        api<{ success: true; options: LogOptions; ignoredUserNames: Record<string, string> }>(g(guildId, '/log-settings/options'), { body: input }),
};

// ==========================================
// 🔀 PR Bot
// ==========================================
export const prBotQuery = (guildId: string) => queryOptions({ queryKey: [...guildKey(guildId), 'pr-bot'], queryFn: () => api<PrBotSettings>(g(guildId, '/pr-bot/settings')) });
export const updatePrBot = (guildId: string, input: UpdatePrBotInput) => api<PrBotSettings>(g(guildId, '/pr-bot/settings'), { body: input });
export const rotatePrBotSecret = (guildId: string) => api<PrBotSecretResponse>(g(guildId, '/pr-bot/secret'), { method: 'POST' });
