import { Global, Module } from '@nestjs/common';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';

// เหตุการณ์สดของลูกโลก 3D — Activity Log และ PR Bot ส่งเหตุการณ์เข้ามาที่ LiveService
@Global()
@Module({
    controllers: [LiveController],
    providers: [LiveService],
    exports: [LiveService],
})
export class LiveModule {}
