import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';

import { BotMemory, botMemorySchema } from './schemas/bot-memory.schema';
import { MemoryService } from './services/memory.service';
import { SummaryService } from './services/summary.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BotMemory.name, schema: botMemorySchema },
    ]),
    HttpModule.register({
      timeout: 30_000,
      maxRedirects: 3,
    }),
    ChatModule,
  ],
  providers: [MemoryService, SummaryService],
  exports: [MemoryService, SummaryService],
})
export class MemoryModule {}
