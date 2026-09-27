import type { PublicUser } from '@notstack/shared';
import type { User } from '../generated/prisma/client';

// ชื่อที่ใช้แสดงผล
export const nameOf = (user: Pick<User, 'id' | 'displayName' | 'username' | 'discordUsername'>) =>
    user.displayName || user.username || user.discordUsername || `user#${user.id}`;

// ข้อมูลที่ส่งออกไปหน้าเว็บได้ (ไม่มี passwordHash / tokenVersion)
export function publicUser(user: User): PublicUser {
    return {
        id: user.id,
        username: user.username,
        displayName: nameOf(user),
        avatarUrl: user.avatarUrl,
        role: user.role,
        isActive: user.isActive,
        discordId: user.discordId,
        discordUsername: user.discordUsername,
        hasPassword: Boolean(user.passwordHash),
        lockedUntil: user.lockedUntil && user.lockedUntil > new Date() ? user.lockedUntil.toISOString() : null,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
    };
}
