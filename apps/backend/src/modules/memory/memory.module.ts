import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';

import { BotMemory, botMemorySchema } from './schemas/bot-memory.schema';
import {
  UserKnowledge,
  userKnowledgeSchema,
} from './schemas/user-knowledge.schema';
import { MemoryService } from './services/memory.service';
import { SummaryService } from './services/summary.service';
import { EmbeddingService } from './services/embedding.service';
import { QdrantService } from './services/qdrant.service';
import { EntityExtractionService } from './services/entity-extraction.service';
import { RagService } from './services/rag.service';
import { MemoryFilterService } from './services/memory-filter.service';
import { MemoryProducer } from './memory.producer';
import { MemoryProcessor } from './memory.processor';
import { ChatModule } from '../chat/chat.module';
import { MemoryMaintenanceService } from './memory-maintenance.service';
import { MemberModule } from '../member/member.module';
import { Bot, botSchema } from '../bot/schemas/bot.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BotMemory.name, schema: botMemorySchema },
      { name: UserKnowledge.name, schema: userKnowledgeSchema },
      { name: Bot.name, schema: botSchema },
    ]),
    HttpModule.register({
      timeout: 30_000,
      maxRedirects: 3,
    }),
    ChatModule,
    MemberModule,
  ],
  providers: [
    MemoryService,
    SummaryService,
    EmbeddingService,
    QdrantService,
    EntityExtractionService,
    RagService,
    MemoryFilterService,
    MemoryProducer,
    MemoryProcessor,
    MemoryMaintenanceService,
  ],
  exports: [
    MemoryService,
    SummaryService,
    EntityExtractionService,
    RagService,
    MemoryFilterService,
    MemoryProducer,
  ],
})
export class MemoryModule {}
