import { Injectable, Logger } from '@nestjs/common';
import { Events, type Client, type Guild, type GuildMember, type PartialGuildMember } from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import { GuildAccessService } from '../guild-access.service';
import { GuildsService } from '../guilds.service';

// ==========================================
// 🔄 GUILD SYNC — เก็บรายชื่อเซิร์ฟเวอร์ที่บอทอยู่ให้ตรงกับ Discord เสมอ
// ==========================================
@Injectable()
export class GuildSyncListener {
    private readonly logger = new Logger('Guilds');

    constructor(
        private readonly guilds: GuildsService,
        private readonly access: GuildAccessService,
    ) {}

    @OnDiscord(Events.ClientReady, { once: true })
    async onReady(client: Client<true>): Promise<void> {
        await this.guilds.syncAll([...client.guilds.cache.values()]);
    }

    // ถูกเชิญเข้าเซิร์ฟเวอร์ใหม่
    @OnDiscord(Events.GuildCreate)
    async onJoin(guild: Guild): Promise<void> {
        this.logger.log(`➕ ถูกเชิญเข้าเซิร์ฟเวอร์ ${guild.name} (${guild.id})`);
        await this.guilds.upsert(guild);
    }

    // ถูกเตะ / เซิร์ฟเวอร์ถูกลบ (available = false คือ Discord ล่มชั่วคราว ไม่ใช่ถูกเตะ)
    @OnDiscord(Events.GuildDelete)
    async onLeave(guild: Guild): Promise<void> {
        if (!guild.available) return;
        this.logger.log(`➖ ออกจากเซิร์ฟเวอร์ ${guild.name} (${guild.id})`);
        await this.guilds.markLeft(guild.id);
    }

    @OnDiscord(Events.GuildUpdate)
    async onUpdate(_old: Guild, guild: Guild): Promise<void> {
        await this.guilds.upsert(guild);
    }

    // ยศเปลี่ยน / ออกจากเซิร์ฟเวอร์ → สิทธิ์ในหน้า Dashboard เปลี่ยนตามทันที
    @OnDiscord(Events.GuildMemberUpdate)
    onMemberUpdate(_old: GuildMember | PartialGuildMember, member: GuildMember): void {
        this.access.forget(member.id, member.guild.id);
    }

    @OnDiscord(Events.GuildMemberRemove)
    onMemberRemove(member: GuildMember | PartialGuildMember): void {
        this.access.forget(member.id, member.guild.id);
    }
}
