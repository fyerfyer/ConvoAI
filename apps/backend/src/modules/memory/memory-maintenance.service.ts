import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { BotMemory, BotMemoryModel } from './schemas/bot-memory.schema';
import { Bot, BotModel } from '../bot/schemas/bot.schema';
import {
  UserKnowledge,
  UserKnowledgeModel,
} from './schemas/user-knowledge.schema';
import { ChatService } from '../chat/chat.service';
import { MemoryProducer } from './memory.producer';
import { RagService } from './services/rag.service';
import { EntityExtractionService } from './services/entity-extraction.service';
import { MemoryFilterService } from './services/memory-filter.service';
import { QdrantService } from './services/qdrant.service';
import { AppLogger } from '../../common/configs/logger/logger.service';
import {
  AgentContextMessage,
  MEMORY_DEFAULTS,
  MEMORY_SCOPE,
} from '@discord-platform/shared';
import { UserDocument } from '../user/schemas/user.schema';

@Injectable()
export class MemoryMaintenanceService implements OnModuleInit {
  private readonly maxBootstrapMemories = 200;
  private readonly maxEntityUsersPerChannel = 3;
  private readonly maxMessagesPerUser = 6;

  constructor(
    @InjectModel(BotMemory.name)
    private readonly botMemoryModel: BotMemoryModel,
    @InjectModel(Bot.name)
    private readonly botModel: BotModel,
    @InjectModel(UserKnowledge.name)
    private readonly userKnowledgeModel: UserKnowledgeModel,
    private readonly chatService: ChatService,
    private readonly memoryProducer: MemoryProducer,
    private readonly ragService: RagService,
    private readonly entityExtractionService: EntityExtractionService,
    private readonly memoryFilterService: MemoryFilterService,
    private readonly qdrantService: QdrantService,
    private readonly logger: AppLogger,
  ) {}

  async onModuleInit() {
    void this.bootstrapMemoryWorkers().catch((err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.warn(
        `[MemoryMaintenance] Bootstrap failed: ${error.message}`,
        error.stack,
      );
    });
  }

  private async bootstrapMemoryWorkers(): Promise<void> {
    const memories = await this.botMemoryModel
      .find()
      .sort({ updatedAt: -1 })
      .limit(this.maxBootstrapMemories)
      .lean();

    if (memories.length === 0) return;

    this.logger.log(
      `[MemoryMaintenance] Bootstrapping ${memories.length} memory records`,
    );

    const botNameCache = new Map<string, string>();

    for (const memory of memories) {
      await this.resumeSummaries(memory, botNameCache);
      await this.resumeRagIndex(memory);
      await this.resumeEntityExtraction(memory);
    }

    this.logger.log('[MemoryMaintenance] Bootstrap complete');
  }

  private async resumeSummaries(
    memory: BotMemory,
    botNameCache: Map<string, string>,
  ): Promise<void> {
    if (
      memory.interactionsSinceSummary <
      MEMORY_DEFAULTS.SUMMARY_TRIGGER_THRESHOLD
    ) {
      return;
    }

    const botId = String(memory.botId);
    let botName = botNameCache.get(botId);
    if (!botName) {
      const bot = await this.botModel
        .findById(botId)
        .select('name')
        .lean<{ name?: string }>();
      botName = bot?.name || 'Bot';
      botNameCache.set(botId, botName);
    }

    await this.memoryProducer.enqueueSummarize({
      botId,
      channelId: String(memory.channelId),
      guildId: String(memory.guildId),
      botName,
      memoryScope: MEMORY_SCOPE.CHANNEL,
    });
  }

  private async resumeRagIndex(memory: BotMemory): Promise<void> {
    if (!this.ragService.isEnabled()) return;

    const botId = String(memory.botId);
    const channelId = String(memory.channelId);
    const guildId = String(memory.guildId);

    const existing = await this.qdrantService.countByFilter({
      botId,
      channelId,
      guildId,
    });
    if (existing > 0) return;

    const rawMessages = await this.getRecentMessages(
      channelId,
      MEMORY_DEFAULTS.SHORT_TERM_WINDOW_SIZE + 10,
    );

    const filtered = await this.memoryFilterService.filterMessages(rawMessages);
    const recentMessages = this.memoryFilterService.sanitizePII(filtered);

    if (recentMessages.length === 0) return;

    await this.memoryProducer.enqueueEmbedConversation(
      {
        botId,
        channelId,
        guildId,
        messages: recentMessages,
      },
      {
        jobId: `bootstrap-embed_${botId}_${channelId}_${
          recentMessages[recentMessages.length - 1]?.messageId || 'latest'
        }`,
      },
    );
  }

  private async resumeEntityExtraction(memory: BotMemory): Promise<void> {
    if (!this.entityExtractionService.isEnabled()) return;

    const botId = String(memory.botId);
    const guildId = String(memory.guildId);

    const channelId = String(memory.channelId);
    const rawMessages = await this.getRecentMessages(channelId, 30);

    // 内容质量过滤
    const recentMessages =
      await this.memoryFilterService.filterMessages(rawMessages);
    if (recentMessages.length === 0) return;

    const userBuckets = new Map<
      string,
      { name: string; messages: AgentContextMessage[] }
    >();

    for (const msg of recentMessages) {
      if (msg.role !== 'user' || !msg.authorId) continue;
      if (!userBuckets.has(msg.authorId)) {
        userBuckets.set(msg.authorId, { name: msg.author, messages: [] });
      }
      const bucket = userBuckets.get(msg.authorId);
      if (bucket && bucket.messages.length < this.maxMessagesPerUser) {
        bucket.messages.push(msg);
      }
    }

    const entries = Array.from(userBuckets.entries()).slice(
      0,
      this.maxEntityUsersPerChannel,
    );

    for (const [userId, entry] of entries) {
      if (entry.messages.length === 0) continue;

      // 语义密度校验，避免对 "hi", "ok", "bye" 浪费 LLM 调用
      if (!(await this.memoryFilterService.hasSemanticDensity(entry.messages)))
        continue;

      const existing = await this.userKnowledgeModel.countDocuments({
        botId,
        userId,
      });
      if (existing > 0) continue;
      await this.memoryProducer.enqueueExtractEntities(
        {
          botId,
          channelId,
          guildId,
          userId,
          userName: entry.name,
          messages: entry.messages,
        },
        {
          jobId: `bootstrap-entities_${botId}_${channelId}_${userId}`,
        },
      );
    }
  }

  private async getRecentMessages(
    channelId: string,
    limit: number,
  ): Promise<AgentContextMessage[]> {
    const messages = await this.chatService.getMessages(channelId, limit);

    return messages.reverse().map((msg) => {
      const sender = msg.sender as UserDocument;
      return {
        role: sender?.isBot ? ('assistant' as const) : ('user' as const),
        content: msg.content,
        author: sender?.name || 'Unknown',
        authorId: sender?._id?.toString(),
        messageId: msg._id.toString(),
        timestamp: msg.createdAt?.toISOString() || '',
      };
    });
  }
}
