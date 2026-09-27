import { z } from 'zod';
import { createZodDto } from '../../common/dto/create-zod-dto';

// แก้ได้ทีละหลายฟิลด์ (role, isActive, displayName, username, password, unlock) — ตรวจทีละฟิลด์ใน controller
// เพราะกฎขึ้นกับตัวผู้ใช้เป้าหมาย (เช่นแก้ role ของตัวเองไม่ได้)
export class UpdateUserDto extends createZodDto(z.record(z.string(), z.unknown())) {}
