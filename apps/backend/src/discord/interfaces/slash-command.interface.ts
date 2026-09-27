import type {
    ButtonInteraction,
    ChatInputCommandInteraction,
    ModalSubmitInteraction,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
    StringSelectMenuInteraction,
} from 'discord.js';

export type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;

// ตัวคำสั่ง (ชื่อ / คำอธิบาย / option) เป็น static — สคริปต์ลงทะเบียนคำสั่งอ่านได้โดยไม่ต้องสร้าง instance
export interface SlashCommandDefinition {
    readonly name: string;
    toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
}

export interface SlashCommandClass {
    readonly data: SlashCommandDefinition;
    // true = คำสั่งเฉพาะของเซิร์ฟเวอร์หลัก (DISCORD_GUILD_ID) — ลงทะเบียนแบบ guild command ที่เซิร์ฟเวอร์นั้นที่เดียว
    readonly homeGuildOnly?: boolean;
    new (...args: never[]): SlashCommandHandler;
}

export interface SlashCommandHandler {
    execute(interaction: ChatInputCommandInteraction): Promise<unknown>;
    // ปุ่ม / เมนู / pop-up ที่คำสั่งนี้สร้าง — ทุกคำสั่งได้รับทุก component แล้วเช็ค customId เอง
    handleComponent?(interaction: ComponentInteraction): Promise<unknown>;
}
