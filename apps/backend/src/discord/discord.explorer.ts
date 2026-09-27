import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { Collection } from 'discord.js';
import { DISCORD_LISTENERS, type DiscordListenerMeta } from './decorators/on-discord.decorator';
import { SlashCommand } from './decorators/slash-command.decorator';
import { DiscordService } from './discord.service';
import type { SlashCommandClass, SlashCommandHandler } from './interfaces/slash-command.interface';

export interface RegisteredCommand {
    handler: SlashCommandHandler;
    homeGuildOnly: boolean;
}

// ==========================================
// 🔎 EXPLORER — หา @OnDiscord / @SlashCommand จากทุก provider แล้วผูกเข้ากับ client
// ==========================================
@Injectable()
export class DiscordExplorer implements OnModuleInit {
    private readonly logger = new Logger('Discord');
    readonly commands = new Collection<string, RegisteredCommand>();

    constructor(
        private readonly discovery: DiscoveryService,
        private readonly scanner: MetadataScanner,
        private readonly discord: DiscordService,
    ) {}

    onModuleInit(): void {
        let listenerCount = 0;
        for (const wrapper of this.discovery.getProviders()) {
            const instance = wrapper.instance as Record<string, unknown> | undefined;
            if (!instance || typeof instance !== 'object' || !wrapper.isDependencyTreeStatic()) continue;
            const prototype = Object.getPrototypeOf(instance) as object | null;
            if (!prototype) continue;

            for (const methodName of this.scanner.getAllMethodNames(prototype)) {
                const method = instance[methodName];
                if (typeof method !== 'function') continue;
                const metas: DiscordListenerMeta[] = Reflect.getMetadata(DISCORD_LISTENERS, method) ?? [];
                for (const meta of metas) {
                    const name = `${wrapper.name}.${methodName}`;
                    // error ใน event handler ห้ามทำให้โปรเซสล้ม — log ไว้แล้วไปต่อ
                    const handler = (...args: unknown[]) => {
                        Promise.resolve()
                            .then(() => (method as (...a: unknown[]) => unknown).apply(instance, args))
                            .catch((err: unknown) => this.logger.error(`${name} (${String(meta.event)}): ${err instanceof Error ? err.stack : String(err)}`));
                    };
                    if (meta.once) this.discord.client.once(meta.event, handler);
                    else this.discord.client.on(meta.event, handler);
                    listenerCount++;
                }
            }
        }

        for (const wrapper of this.discovery.getProviders({ metadataKey: SlashCommand.KEY })) {
            const handler = wrapper.instance as SlashCommandHandler | undefined;
            const metatype = wrapper.metatype as SlashCommandClass | null;
            if (!handler || !metatype?.data) continue;
            this.commands.set(metatype.data.name, { handler, homeGuildOnly: Boolean(metatype.homeGuildOnly) });
        }

        this.logger.log(`ผูก event ${listenerCount} ตัว และคำสั่ง ${this.commands.size} คำสั่ง`);
    }
}
