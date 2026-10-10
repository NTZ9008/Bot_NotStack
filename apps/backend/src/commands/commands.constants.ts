import type { SlashCommandClass } from '../discord/interfaces/slash-command.interface';
import { AddRolesCommand } from './slash/add-roles.command';
import { AdminInfoCommand } from './slash/admin-info.command';
import { BotInfoCommand } from './slash/bot-info.command';
import { HelpCommand } from './slash/help.command';
import { LeaderboardCommand } from './slash/leaderboard.command';
import { PingCommand } from './slash/ping.command';
import { PollCommand } from './slash/poll.command';
import { RandomCommand } from './slash/random.command';
import { RankCommand } from './slash/rank.command';
import { RankCardCommand } from './slash/rankcard.command';
import { ServerInfoCommand } from './slash/server-info.command';
import { SetupRolesCommand } from './slash/setup-roles.command';
import { UserInfoCommand } from './slash/user-info.command';
import { VerifyCommand } from './slash/verify.command';
import { WeatherCommand } from './slash/weather.command';
import { XpCommand } from './slash/xp.command';

// คำสั่ง / ทั้งหมดของบอท — เพิ่มคำสั่งใหม่: สร้างคลาสที่มี @SlashCommand() ใน slash/ แล้วใส่ในรายการนี้
// (ลงทะเบียนกับ Discord ด้วย pnpm discord:deploy-commands)
export const COMMANDS = [
    AddRolesCommand,
    AdminInfoCommand,
    BotInfoCommand,
    HelpCommand,
    LeaderboardCommand,
    PingCommand,
    PollCommand,
    RandomCommand,
    RankCommand,
    RankCardCommand,
    ServerInfoCommand,
    SetupRolesCommand,
    UserInfoCommand,
    VerifyCommand,
    WeatherCommand,
    XpCommand,
] satisfies SlashCommandClass[];
