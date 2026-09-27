import { Global, Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// บัญชีผู้ใช้ Dashboard (ส่วนกลาง) — AuthModule ใช้ UsersService ตรวจ login ทุก request
@Global()
@Module({
    controllers: [UsersController],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule {}
