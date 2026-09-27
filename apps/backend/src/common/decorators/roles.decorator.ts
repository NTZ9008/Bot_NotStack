import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@notstack/shared';

// role ของบัญชี Dashboard ที่เรียก route นี้ได้ (ตรวจใน RolesGuard)
export const ROLES_KEY = 'auth:roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// ผู้ดูแลระบบเท่านั้น (จัดการผู้ใช้ / audit log ทั้งระบบ / ไฟล์ log)
export const AdminOnly = () => Roles('ADMIN');
