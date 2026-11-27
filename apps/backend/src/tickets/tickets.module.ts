import { Module } from '@nestjs/common';
import { TicketInteractionListener } from './listeners/ticket-interaction.listener';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
    controllers: [TicketsController],
    providers: [TicketsService, TicketInteractionListener],
    exports: [TicketsService],
})
export class TicketsModule {}
