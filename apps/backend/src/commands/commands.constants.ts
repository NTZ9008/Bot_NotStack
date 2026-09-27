import type { SlashCommandClass } from '../discord/interfaces/slash-command.interface';
import { AddRolesCommand } from './slash/add-roles.command';
import { AdminInfoCommand } from './slash/admin-info.command';
import { BotInfoCommand } from './slash/bot-info.command';
import { HelpCommand } from './slash/help.command';
import { PingCommand } from './slash/ping.command';
import { PollCommand } from './slash/poll.command';
import { RandomCommand } from './slash/random.command';
import { RankCommand } from './slash/rank.command';
import { ServerInfoCommand } from './slash/server-info.command';
import { SetupRolesCommand } from './slash/setup-roles.command';
import { UserInfoCommand } from './slash/user-info.command';
import { VerifyCommand } from './slash/verify.command';
import { WeatherCommand } from './slash/weather.command';

// คำสั่ง / ทั้งหมดของบอท — เพิ่มคำสั่งใหม่: สร้างคลาสที่มี @SlashCommand() ใน slash/ แล้วใส่ในรายการนี้
// (ลงทะเบียนกับ Discord ด้วย pnpm discord:deploy-commands)
export const COMMANDS = [
    AddRolesCommand,
    AdminInfoCommand,
    BotInfoCommand,
    HelpCommand,
    PingCommand,
    PollCommand,
    RandomCommand,
    RankCommand,
    ServerInfoCommand,
    SetupRolesCommand,
    UserInfoCommand,
    VerifyCommand,
    WeatherCommand,
] satisfies SlashCommandClass[];
