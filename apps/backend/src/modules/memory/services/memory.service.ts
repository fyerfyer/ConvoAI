import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import {
  BotMemory,
  BotMemoryDocument,
  BotMemoryModel,
} from '../schemas/bot-memory.schema';
import { SummaryService } from './summary.service';
import { ChatService } from '../../chat/chat.service';
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
    private readonly summaryService: SummaryService,
    private readonly chatService: ChatService,
    private readonly logger: AppLogger,
  ) {}

  // 获取 Bot 在特定 Channel 的记忆上下文
  // 返回的 MemoryContext 包含：
  // rollingSummary
  // recentMessages
  // summarizedMessageCount

  async getMemoryContext(
    botId: string,
    channelId: string,
    guildId: string,
    memoryScope: MemoryScopeValue = MEMORY_SCOPE.CHANNEL,
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

    return {
      rollingSummary: memory.rollingSummary || '',
      recentMessages,
      summarizedMessageCount: memory.summarizedMessageCount,
    };
  }

  async updateMemoryAfterInteraction(
    botId: string,
    channelId: string,
    guildId: string,
    botName: string,
    memoryScope: MemoryScopeValue = MEMORY_SCOPE.CHANNEL,
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
        // 异步执行摘要
        this.triggerSummaryUpdate(memory, botName).catch((err) => {
          this.logger.error(
            `[MemoryService] Background summary update failed for bot ${botId} in channel ${channelId}: ${err.message}`,
            err.stack,
          );
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
    this.logger.log(
      `[MemoryService] Cleared memory for bot ${botId} in channel ${channelId}`,
    );
  }

  async clearGuildMemory(botId: string, guildId: string): Promise<void> {
    const result = await this.botMemoryModel.deleteMany({ botId, guildId });
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
        messageId: msg._id.toString(),
        timestamp: msg.createdAt?.toISOString() || '',
      };
    });
  }

  // 触发滚动摘要更新
  private async triggerSummaryUpdate(
    memory: BotMemoryDocument,
    botName: string,
  ): Promise<void> {
    const channelId = String(memory.channelId);

    // 拉取更多消息用于摘要（短期窗口 + 待摘要的批量）
    const totalToFetch =
      MEMORY_DEFAULTS.SHORT_TERM_WINDOW_SIZE +
      MEMORY_DEFAULTS.SUMMARY_BATCH_SIZE;
    const allMessages = await this.getRecentMessages(channelId, totalToFetch);

    if (allMessages.length <= MEMORY_DEFAULTS.SHORT_TERM_WINDOW_SIZE) {
      // 消息不够多，不需要摘要
      memory.interactionsSinceSummary = 0;
      await memory.save();
      return;
    }

    const messagesToSummarize = allMessages.slice(
      0,
      allMessages.length - MEMORY_DEFAULTS.SHORT_TERM_WINDOW_SIZE,
    );

    if (messagesToSummarize.length === 0) {
      memory.interactionsSinceSummary = 0;
      await memory.save();
      return;
    }

    this.logger.debug(
      `[MemoryService] Summarizing ${messagesToSummarize.length} messages for bot ${memory.botId} in channel ${channelId}`,
    );

    // 调用 SummaryService 生成新的滚动摘要
    const newSummary = await this.summaryService.summarize(
      memory.rollingSummary,
      messagesToSummarize,
      botName,
    );

    // 更新记忆文档
    memory.rollingSummary = newSummary;
    memory.summarizedMessageCount += messagesToSummarize.length;
    memory.lastSummarizedMessageId =
      messagesToSummarize[messagesToSummarize.length - 1]?.messageId || '';
    memory.lastSummarizedAt = new Date();
    memory.interactionsSinceSummary = 0;
    await memory.save();

    this.logger.log(
      `[MemoryService] Rolling summary updated for bot ${memory.botId} in channel ${channelId} ` +
        `(${messagesToSummarize.length} new messages summarized, total: ${memory.summarizedMessageCount})`,
    );
  }
}
