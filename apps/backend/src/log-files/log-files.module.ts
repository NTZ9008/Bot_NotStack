import { Global, Module } from '@nestjs/common';
import { LogFilesController } from './log-files.controller';
import { LogFilesService } from './log-files.service';

@Global()
@Module({
    controllers: [LogFilesController],
    providers: [LogFilesService],
    exports: [LogFilesService],
})
export class LogFilesModule {}
