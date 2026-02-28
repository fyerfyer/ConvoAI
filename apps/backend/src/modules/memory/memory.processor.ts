import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { OnModuleInit } from '@nestjs/common';
import { QUEUE_NAMES } from '../../common/configs/queue/queue.constants';
import { SummaryService } from './services/summary.service';
import { EntityExtractionService } from './services/entity-extraction.service';
import { RagService } from './services/rag.service';
import { MemoryFilterService } from './services/memory-filter.service';
import { ChatService } from '../chat/chat.service';
import { AppLogger } from '../../common/configs/logger/logger.service';
import { UserDocument } from '../user/schemas/user.schema';
import {
  MEMORY_JOB,
  MEMORY_DEFAULTS,
  AgentContextMessage,
  SummarizeJobPayload,
  ExtractEntitiesJobPayload,
  EmbedConversationJobPayload,
} from '@discord-platform/shared';
import { InjectModel } from '@nestjs/mongoose';
import { BotMemory, BotMemoryModel } from './schemas/bot-memory.schema';
import { HealthRegistry } from '../health/health.registry';

@Processor(QUEUE_NAMES.MEMORY, {
  concurrency: 3, // 最多同时处理 3 个任务
  limiter: {
    max: 5,
    duration: 60_000,
  },
})
export class MemoryProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    private readonly summaryService: SummaryService,
    private readonly entityExtractionService: EntityExtractionService,
    private readonly ragService: RagService,
    private readonly memoryFilterService: MemoryFilterService,
    private readonly chatService: ChatService,
    @InjectModel(BotMemory.name)
    private readonly botMemoryModel: BotMemoryModel,
    private readonly logger: AppLogger,
    private readonly healthRegistry: HealthRegistry,
  ) {
    super();
  }

  onModuleInit(): void {
    this.healthRegistry.register({
      name: 'MemoryProcessor',
      queue: QUEUE_NAMES.MEMORY,
      status: 'started',
      startedAt: new Date().toISOString(),
      details:
        'concurrency=3, rate=5/60s; handles summarize, extract-entities, embed-conversation, decay-entities',
    });
    this.logger.log(
      `[MemoryProcessor] Worker started for queue "${QUEUE_NAMES.MEMORY}" (concurrency=3, rate=5/60s)`,
    );
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case MEMORY_JOB.SUMMARIZE:
        await this.handleSummarize(job);
        break;
      case MEMORY_JOB.EXTRACT_ENTITIES:
        await this.handleExtractEntities(job);
        break;
      case MEMORY_JOB.EMBED_CONVERSATION:
        await this.handleEmbedConversation(job);
        break;
      case MEMORY_JOB.DECAY_ENTITIES:
        await this.handleDecayEntities(job);
        break;
      default:
        this.logger.warn(`[MemoryProcessor] Unknown job: ${job.name}`);
    }
  }

  private async handleSummarize(job: Job<SummarizeJobPayload>): Promise<void> {
    const { botId, channelId, guildId, botName } = job.data;

    this.logger.log(
      `[MemoryProcessor] Processing summarize for bot ${botId} in channel ${channelId}`,
    );

    const memory = await this.botMemoryModel.findOne({ botId, channelId });
    if (!memory) {
      this.logger.warn(
        `[MemoryProcessor] No memory found for bot ${botId} in channel ${channelId}`,
      );
      return;
    }

    // 需要总结的消息
    const totalToFetch =
      MEMORY_DEFAULTS.SHORT_TERM_WINDOW_SIZE +
      MEMORY_DEFAULTS.SUMMARY_BATCH_SIZE;
    const rawMessages = await this.getRecentMessages(channelId, totalToFetch);

    // 内容质量过滤 + PII 脱敏
    const allMessages = this.memoryFilterService.sanitizePII(
      await this.memoryFilterService.filterMessages(rawMessages),
    );

    if (allMessages.length <= MEMORY_DEFAULTS.SHORT_TERM_WINDOW_SIZE) {
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

    const newSummary = await this.summaryService.summarize(
      memory.rollingSummary,
      messagesToSummarize,
      botName,
      guildId,
      channelId,
    );

    memory.rollingSummary = newSummary;
    memory.summarizedMessageCount += messagesToSummarize.length;
    memory.lastSummarizedMessageId =
      messagesToSummarize[messagesToSummarize.length - 1]?.messageId || '';
    memory.lastSummarizedAt = new Date();
    memory.interactionsSinceSummary = 0;
    await memory.save();

    this.logger.log(
      `[MemoryProcessor] Summary updated for bot ${botId} in channel ${channelId} ` +
        `(${messagesToSummarize.length} messages, total: ${memory.summarizedMessageCount})`,
    );
  }

  private async handleExtractEntities(
    job: Job<ExtractEntitiesJobPayload>,
  ): Promise<void> {
    const { botId, guildId, userId, userName, messages } = job.data;

    this.logger.log(
      `[MemoryProcessor] Extracting entities for user ${userName} (bot: ${botId})`,
    );

    await this.entityExtractionService.extractAndSave(
      botId,
      guildId,
      userId,
      userName,
      messages,
    );
  }

  private async handleEmbedConversation(
    job: Job<EmbedConversationJobPayload>,
  ): Promise<void> {
    const { botId, channelId, guildId, messages } = job.data;

    this.logger.log(
      `[MemoryProcessor] Embedding ${messages.length} messages for bot ${botId} in channel ${channelId}`,
    );

    await this.ragService.indexConversation(
      botId,
      channelId,
      guildId,
      messages,
    );
  }

  private async handleDecayEntities(
    job: Job<{ botId: string }>,
  ): Promise<void> {
    const { botId } = job.data;

    const decayed = await this.entityExtractionService.decayScores(botId);
    const pruned = await this.entityExtractionService.pruneStaleEntities(botId);

    this.logger.log(
      `[MemoryProcessor] Decay for bot ${botId}: ${decayed} scores decayed, ${pruned} stale entities pruned`,
    );
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

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `[MemoryProcessor] Job ${job.name}:${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${error.message}`,
      error.stack,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`[MemoryProcessor] Job ${job.name}:${job.id} completed`);
  }
}
