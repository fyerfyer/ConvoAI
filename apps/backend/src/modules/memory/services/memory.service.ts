import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import {
  BotMemory,
  BotMemoryDocument,
  BotMemoryModel,
} from '../schemas/bot-memory.schema';
import { ChatService } from '../../chat/chat.service';
import { EntityExtractionService } from './entity-extraction.service';
import { RagService } from './rag.service';
import { MemoryProducer } from '../memory.producer';
import { UserDocument } from '../../user/schemas/user.schema';

import {
  AgentContextMessage,
  MemoryContext,
  MEMORY_DEFAULTS,
  MEMORY_SCOPE,
  MemoryScopeValue,
} from '@discord-platform/shared';
import { AppLogger } from '../../../common/configs/logger/logger.service';

@Injectable()
export class MemoryService {
  constructor(
    @InjectModel(BotMemory.name)
    private readonly botMemoryModel: BotMemoryModel,
    private readonly chatService: ChatService,
    private readonly entityExtractionService: EntityExtractionService,
    private readonly ragService: RagService,
    private readonly memoryProducer: MemoryProducer,
    private readonly logger: AppLogger,
  ) {}

  // 获取 Bot 在特定 Channel 的记忆上下文
  // 返回的 MemoryContext 包含：
  // rollingSummary, recentMessages, summarizedMessageCount
  // userKnowledge (per-user facts), ragContext (vector search results)
  async getMemoryContext(
    botId: string,
    channelId: string,
    guildId: string,
    memoryScope: MemoryScopeValue = MEMORY_SCOPE.CHANNEL,
    userId?: string,
    query?: string,
  ): Promise<MemoryContext> {
    // 临时模式：不持久化记忆
    if (memoryScope === MEMORY_SCOPE.EPHEMERAL) {
      return {
        rollingSummary: '',
        recentMessages: [],
        summarizedMessageCount: 0,
      };
    }

    const memory = await this.getOrCreateMemory(botId, channelId, guildId);

    const recentMessages = await this.getRecentMessages(
      channelId,
      MEMORY_DEFAULTS.SHORT_TERM_WINDOW_SIZE,
    );

    const ctx: MemoryContext = {
      rollingSummary: memory.rollingSummary || '',
      recentMessages,
      summarizedMessageCount: memory.summarizedMessageCount,
    };

    // 获取用户相关知识
    if (userId) {
      try {
        const userKnowledge =
          await this.entityExtractionService.getUserKnowledge(
            botId,
            userId,
            MEMORY_DEFAULTS.RAG_TOP_K,
          );
        if (userKnowledge.length > 0) {
          ctx.userKnowledge = userKnowledge.map((uk) => ({
            fact: uk.fact,
            entityType: uk.entityType,
            source: uk.source,
            relevanceScore: uk.relevanceScore,
            extractedAt: uk.createdAt?.toISOString() || '',
            expiresAt: uk.expiresAt?.toISOString(),
          }));
        }
      } catch (err) {
        this.logger.warn(
          `[MemoryService] Failed to fetch user knowledge: ${err}`,
        );
      }
    }

    // RAG
    if (query) {
      try {
        const ragResults = await this.ragService.searchRelevantContext(
          query,
          botId,
          guildId,
          undefined,
          MEMORY_DEFAULTS.RAG_TOP_K,
        );
        if (ragResults.length > 0) {
          ctx.ragContext = ragResults;
        }
      } catch (err) {
        this.logger.warn(
          `[MemoryService] Failed to search RAG context: ${err}`,
        );
      }
    }

    return ctx;
  }

  // 交互后通过 BullMQ 异步更新记忆
  async updateMemoryAfterInteraction(
    botId: string,
    channelId: string,
    guildId: string,
    botName: string,
    memoryScope: MemoryScopeValue = MEMORY_SCOPE.CHANNEL,
    userId?: string,
    userName?: string,
  ): Promise<void> {
    if (memoryScope === MEMORY_SCOPE.EPHEMERAL) return;

    try {
      const memory = await this.getOrCreateMemory(botId, channelId, guildId);
      memory.interactionsSinceSummary += 1;
      await memory.save();

      if (
        memory.interactionsSinceSummary >=
        MEMORY_DEFAULTS.SUMMARY_TRIGGER_THRESHOLD
      ) {
        await this.memoryProducer.enqueueSummarize({
          botId,
          channelId,
          guildId,
          botName,
          memoryScope,
        });
      }

      // 获取最近的消息用于 Entity Extraction 和 RAG
      const recentMessages = await this.getRecentMessages(channelId, 10);

      if (userId && userName && recentMessages.length > 0) {
        const userMessages = recentMessages.filter(
          (m) => m.role === 'user' && m.author === userName,
        );
        if (userMessages.length > 0) {
          await this.memoryProducer.enqueueExtractEntities({
            botId,
            channelId,
            guildId,
            userId,
            userName,
            messages: userMessages,
          });
        }
      }

      if (recentMessages.length > 0) {
        await this.memoryProducer.enqueueEmbedConversation({
          botId,
          channelId,
          guildId,
          messages: recentMessages,
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[MemoryService] Failed to update memory for bot ${botId}: ${error.message}`,
        error.stack,
      );
    }
  }

  async clearMemory(botId: string, channelId: string): Promise<void> {
    await this.botMemoryModel.deleteOne({ botId, channelId });
    await this.ragService.deleteByChannel(botId, channelId).catch(() => {});
    this.logger.log(
      `[MemoryService] Cleared memory for bot ${botId} in channel ${channelId}`,
    );
  }

  async clearGuildMemory(botId: string, guildId: string): Promise<void> {
    const result = await this.botMemoryModel.deleteMany({ botId, guildId });
    await this.ragService.deleteByBot(botId).catch(() => {});
    this.logger.log(
      `[MemoryService] Cleared ${result.deletedCount} memory records for bot ${botId} in guild ${guildId}`,
    );
  }

  private async getOrCreateMemory(
    botId: string,
    channelId: string,
    guildId: string,
  ): Promise<BotMemoryDocument> {
    let memory = await this.botMemoryModel.findOne({ botId, channelId });

    if (!memory) {
      memory = await this.botMemoryModel.create({
        botId,
        channelId,
        guildId,
        rollingSummary: '',
        summarizedMessageCount: 0,
        interactionsSinceSummary: 0,
      });
    }

    return memory;
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
