import { byLang, tr } from '../../lib/i18n';
// ==========================================
// 📄 เนื้อหาหน้า landing — ความสามารถ / คำสั่ง / ทีมผู้พัฒนา (อัปเดตที่นี่ที่เดียวเมื่อเพิ่มฟีเจอร์หรือคำสั่งใหม่)
// ==========================================

export interface Feature {
    title: string;
    description: string;
}

export interface FeatureGroup {
    id: string;
    label: string;
    intro: string;
    features: Feature[];
}

export const FEATURE_GROUPS = byLang((): FeatureGroup[] => [
    {
        id: 'security',
        label: tr('landing.groupSecurity'),
        intro: tr('landing.groupSecurityIntro'),
        features: [
            { title: 'Voice Monitor', description: tr('landing.featVoiceMonitor') },
            { title: 'Voice Guard', description: tr('landing.featVoiceGuard') },
            { title: 'Anti-spam', description: tr('landing.featAntiSpam') },
            { title: tr('landing.featProfanityFilter'), description: tr('landing.featProfanityFilterDesc') },
            { title: 'Room Access', description: tr('landing.featRoomAccess') },
        ],
    },
    {
        id: 'community',
        label: tr('landing.groupCommunity'),
        intro: tr('landing.groupCommunityIntro'),
        features: [
            { title: tr('landing.featLevels'), description: tr('landing.featLevelsDesc') },
            { title: tr('landing.featAiChat'), description: tr('landing.featAiChatDesc') },
            { title: tr('landing.featWelcome'), description: tr('landing.featWelcomeDesc') },
            { title: tr('landing.featNews'), description: tr('landing.featNewsDesc') },
            { title: tr('landing.featWeather'), description: tr('landing.featWeatherDesc') },
            { title: tr('landing.featPollRandom'), description: tr('landing.featPollRandomDesc') },
        ],
    },
    {
        id: 'team',
        label: tr('landing.groupTeam'),
        intro: tr('landing.groupTeamIntro'),
        features: [
            { title: tr('landing.featGithubPr'), description: tr('landing.featGithubPrDesc') },
            { title: tr('landing.featJira'), description: tr('landing.featJiraDesc') },
            { title: tr('landing.featFunds'), description: tr('landing.featFundsDesc') },
        ],
    },
    {
        id: 'logs',
        label: tr('landing.groupLogs'),
        intro: tr('landing.groupLogsIntro'),
        features: [
            { title: 'Log Manager', description: tr('landing.featLogManagerDesc') },
            { title: tr('landing.featOverview'), description: tr('landing.featOverviewDesc') },
            { title: tr('landing.featAudit'), description: tr('landing.featAuditDesc') },
        ],
    },
]);

export type CommandCategory = 'level' | 'tool' | 'info' | 'home';

export const COMMAND_CATEGORIES = byLang((): { id: CommandCategory; label: string }[] => [
    { id: 'level', label: tr('landing.catLevel') },
    { id: 'tool', label: tr('landing.catTool') },
    { id: 'info', label: tr('landing.catInfo') },
    { id: 'home', label: tr('landing.catHome') },
]);

export interface CommandOption {
    name: string;
    required?: boolean;
    description: string;
}

export interface Command {
    name: string;
    category: CommandCategory;
    summary: string;
    detail: string;
    options?: CommandOption[];
    example?: string;
    notes?: string[];
    // คำค้นเพิ่ม (ไทย/อังกฤษ) ที่ไม่ได้อยู่ในชื่อหรือคำอธิบาย
    keywords?: string;
}

export const COMMANDS = byLang((): Command[] => [
    {
        name: 'rank',
        category: 'level',
        summary: tr('landing.cmdRankSummary'),
        detail: tr('landing.cmdRankDetail'),
        options: [{ name: 'target', description: tr('landing.optTargetMember') }],
        example: tr('landing.exRank'),
        keywords: 'level xp การ์ด อันดับ',
    },
    {
        name: 'leaderboard',
        category: 'level',
        summary: tr('landing.cmdLeaderboardSummary'),
        detail: tr('landing.cmdLeaderboardDetail'),
        options: [{ name: 'page', description: tr('landing.optPage') }],
        example: '/leaderboard page:2',
        notes: [tr('landing.noteLeaderboardCooldown')],
        keywords: 'top ranking อันดับ',
    },
    {
        name: 'rankcard',
        category: 'level',
        summary: tr('landing.cmdRankcardSummary'),
        detail: tr('landing.cmdRankcardDetail'),
        notes: [tr('landing.noteRankcardColor'), tr('landing.noteRankcardDisabled')],
        keywords: 'theme สี พื้นหลัง customize',
    },
    {
        name: 'xp history',
        category: 'level',
        summary: tr('landing.cmdXpHistorySummary'),
        detail: tr('landing.cmdXpHistoryDetail'),
        options: [{ name: 'member', description: tr('landing.optXpHistoryMember') }],
        example: '/xp history',
        notes: [tr('landing.noteXpHistoryRetention')],
        keywords: 'ประวัติ log',
    },
    {
        name: 'weather',
        category: 'tool',
        summary: tr('landing.cmdWeatherSummary'),
        detail: tr('landing.cmdWeatherDetail'),
        options: [{ name: 'city', description: tr('landing.optWeatherCity') }],
        example: tr('landing.exWeather'),
        notes: [tr('landing.noteWeatherCooldown')],
        keywords: 'อากาศ ฝน pm2.5 ฝุ่น forecast rain',
    },
    {
        name: 'poll',
        category: 'tool',
        summary: tr('landing.cmdPollSummary'),
        detail: tr('landing.cmdPollDetail'),
        options: [
            { name: 'question', required: true, description: tr('landing.optPollQuestion') },
            { name: 'choices', required: true, description: tr('landing.optPollChoices') },
        ],
        example: tr('landing.exPoll'),
        keywords: 'vote โหวต',
    },
    {
        name: 'random',
        category: 'tool',
        summary: tr('landing.cmdRandomSummary'),
        detail: tr('landing.cmdRandomDetail'),
        options: [{ name: 'items', required: true, description: tr('landing.optRandomItems') }],
        example: tr('landing.exRandom'),
        keywords: 'สุ่ม random pick',
    },
    {
        name: 'gethelp',
        category: 'info',
        summary: tr('landing.cmdGethelpSummary'),
        detail: tr('landing.cmdGethelpDetail'),
        keywords: 'help ช่วยเหลือ คำสั่ง',
    },
    {
        name: 'userinfo',
        category: 'info',
        summary: tr('landing.cmdUserinfoSummary'),
        detail: tr('landing.cmdUserinfoDetail'),
        options: [{ name: 'target', description: tr('landing.optTargetMember') }],
        example: tr('landing.exUserinfo'),
        keywords: 'user profile',
    },
    {
        name: 'serverinfo',
        category: 'info',
        summary: tr('landing.cmdServerinfoSummary'),
        detail: tr('landing.cmdServerinfoDetail'),
        keywords: 'server guild',
    },
    {
        name: 'botinfo',
        category: 'info',
        summary: tr('landing.cmdBotinfoSummary'),
        detail: tr('landing.cmdBotinfoDetail'),
        keywords: 'uptime status ram cpu',
    },
    {
        name: 'ping',
        category: 'info',
        summary: tr('landing.cmdPingSummary'),
        detail: tr('landing.cmdPingDetail'),
        keywords: 'latency lag แลค',
    },
    {
        name: 'verify',
        category: 'home',
        summary: tr('landing.cmdVerifySummary'),
        detail: tr('landing.cmdVerifyDetail'),
        notes: [tr('landing.notePasswordLockout')],
        keywords: 'ยืนยันตัวตน รุ่น',
    },
    {
        name: 'addroles',
        category: 'home',
        summary: tr('landing.cmdAddrolesSummary'),
        detail: tr('landing.cmdAddrolesDetail'),
        notes: [tr('landing.notePasswordLockout')],
        keywords: 'vip ยศ role',
    },
    {
        name: 'setuproles',
        category: 'home',
        summary: tr('landing.cmdSetuprolesSummary'),
        detail: tr('landing.cmdSetuprolesDetail'),
        keywords: 'reaction role ยศ',
    },
    {
        name: 'admininfo',
        category: 'home',
        summary: tr('landing.cmdAdmininfoSummary'),
        detail: tr('landing.cmdAdmininfoDetail'),
        keywords: 'admin ผู้สร้าง',
    },
]);

export interface TeamMember {
    name: string;
    github: string;
    role: string;
    description: string;
}

export const TEAM = byLang((): TeamMember[] => [
    {
        name: 'Arlif Thongrakjan',
        github: 'NTZ9008',
        role: tr('landing.teamFounderRole'),
        description: tr('landing.teamFounderDesc'),
    },
    {
        name: 'โปรแกรมเมอร์แต่งของแทร่ลู่ๆกันอยู่',
        github: 'boatngin',
        role: tr('landing.teamContributorRole'),
        description: tr('landing.teamContributorDesc'),
    },
]);
