import { Module } from '@nestjs/common';
import { CustomSummaryController } from './custom-summary.controller';
import { CustomSummaryPdfService } from './custom-summary-pdf.service';
import { CustomSummaryService } from './custom-summary.service';

@Module({
    controllers: [CustomSummaryController],
    providers: [CustomSummaryService, CustomSummaryPdfService],
    exports: [CustomSummaryService, CustomSummaryPdfService],
})
export class CustomSummaryModule {}
