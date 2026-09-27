import { changePasswordSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

// รับค่าดิบไว้ก่อน — ตรวจรหัสผ่านปัจจุบันก่อนแล้วค่อยตรวจกฎของรหัสใหม่ (ข้อความ error จะได้ถูกลำดับ)
export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
