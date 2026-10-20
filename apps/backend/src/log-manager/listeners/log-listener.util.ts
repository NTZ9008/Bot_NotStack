import type { AnyThreadChannel, DMChannel, Guild, Message, NonThreadGuildBasedChannel, PartialMessage, PermissionOverwriteManager } from 'discord.js';
import type { ExecutorInfo } from '../services/log-dispatcher.service';

export type AnyMessage = Message | PartialMessage;
export type AnyChannel = DMChannel | NonThreadGuildBasedChannel;
// อ่าน property ที่มีเฉพาะบางชนิดห้อง (topic / bitrate / rtcRegion ...) โดยไม่ต้องแยก type ทีละแบบ
export type LooseChannel = Record<string, unknown> & { name?: string; parent?: { name?: string } | null };

// ข้อมูลผู้ดำเนินการจาก audit log ที่เก็บลง Activity Log
export const auditRecord = (info: ExecutorInfo | null, extra: Record<string, unknown> = {}) => ({
    executor: info?.executor ?? null,
    reason: info?.reason ?? null,
    ...extra,
});

export const guildOf = (channel: AnyChannel | AnyThreadChannel): Guild | null => ('guild' in channel ? channel.guild : null);

// เทียบว่ากฎสิทธิ์ในช่องเปลี่ยนไปจริงไหม (จำนวน / allow / deny ของแต่ละ overwrite)
export function permissionsChanged(oldPerms: PermissionOverwriteManager['cache'], newPerms: PermissionOverwriteManager['cache']): boolean {
    if (oldPerms.size !== newPerms.size) return true;
    for (const [id, oldOverwrite] of oldPerms) {
        const newOverwrite = newPerms.get(id);
        if (!newOverwrite) return true;
        if (oldOverwrite.allow.bitfield !== newOverwrite.allow.bitfield) return true;
        if (oldOverwrite.deny.bitfield !== newOverwrite.deny.bitfield) return true;
    }
    return false;
}
