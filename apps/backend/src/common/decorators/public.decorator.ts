import { SetMetadata } from '@nestjs/common';

// route ที่ไม่ต้อง login (ค่าเริ่มต้นทุก route ต้อง login — ตรวจใน JwtAuthGuard)
export const IS_PUBLIC_KEY = 'auth:public';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
