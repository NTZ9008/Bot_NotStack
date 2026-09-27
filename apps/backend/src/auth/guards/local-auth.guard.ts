import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { badRequest } from '../../common/exceptions/api.exception';
import { LOCAL_STRATEGY } from '../auth.constants';

// login ด้วย username/password — strategy โยน error ที่มีข้อความให้ผู้ใช้อ่านอยู่แล้ว
// เหลือกรณีเดียวที่ passport-local ตอบเอง: ไม่ได้ส่ง username / password มา
@Injectable()
export class LocalAuthGuard extends AuthGuard(LOCAL_STRATEGY) {
    override handleRequest<TUser>(err: unknown, user: TUser | false): TUser {
        if (err) throw err;
        if (!user) throw badRequest('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
        return user;
    }
}
