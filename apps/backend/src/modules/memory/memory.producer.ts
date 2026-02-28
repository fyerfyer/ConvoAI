import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../common/configs/queue/queue.constants';
import {
  MEMORY_JOB,
  SummarizeJobPayload,
  ExtractEntitiesJobPayload,
  EmbedConversationJobPayload,
} from '@discord-platform/shared';
import { AppLogger } from '../../common/configs/logger/logger.service';

@Injectable()
export class MemoryProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.MEMORY) private readonly memoryQueue: Queue,
    private readonly logger: AppLogger,
  ) {}

  async enqueueSummarize(
    payload: SummarizeJobPayload,
    options?: { jobId?: string },
  ): Promise<void> {
    try {
      await this.memoryQueue.add(MEMORY_JOB.SUMMARIZE, payload, {
        priority: 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
        // 通过 jobId 去重，确保同一时间只有一个 summarize 任务在处理同一 bot 和 channel 的数据
        jobId:
          options?.jobId ?? `summarize_${payload.botId}_${payload.channelId}`,
      });

      this.logger.debug(
        `[MemoryProducer] Enqueued summarize for bot ${payload.botId} in channel ${payload.channelId}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Job') && message.includes('already exists')) {
        this.logger.debug(
          `[MemoryProducer] Summarize job already exists for bot ${payload.botId} in channel ${payload.channelId}`,
        );
        return;
      }
      throw err;
    }
  }

  async enqueueExtractEntities(
    payload: ExtractEntitiesJobPayload,
    options?: { jobId?: string; priority?: number },
  ): Promise<void> {
    try {
      await this.memoryQueue.add(MEMORY_JOB.EXTRACT_ENTITIES, payload, {
        priority: options?.priority ?? 10,
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
        jobId: options?.jobId,
      });

      this.logger.debug(
        `[MemoryProducer] Enqueued entity extraction for user ${payload.userName} (bot: ${payload.botId})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Job') && message.includes('already exists')) {
        this.logger.debug(
          `[MemoryProducer] Entity extraction job already exists for user ${payload.userName} (bot: ${payload.botId})`,
        );
        return;
      }
      throw err;
    }
  }

  async enqueueEmbedConversation(
    payload: EmbedConversationJobPayload,
    options?: { jobId?: string; priority?: number },
  ): Promise<void> {
    try {
      await this.memoryQueue.add(MEMORY_JOB.EMBED_CONVERSATION, payload, {
        priority: options?.priority ?? 15,
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
        jobId: options?.jobId,
      });

      this.logger.debug(
        `[MemoryProducer] Enqueued embed for bot ${payload.botId} in channel ${payload.channelId} (${payload.messages.length} messages)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Job') && message.includes('already exists')) {
        this.logger.debug(
          `[MemoryProducer] Embed job already exists for bot ${payload.botId} in channel ${payload.channelId}`,
        );
        return;
      }
      throw err;
    }
  }

  async enqueueDecayEntities(botId: string): Promise<void> {
    await this.memoryQueue.add(
      MEMORY_JOB.DECAY_ENTITIES,
      { botId },
      {
        priority: 20,
        attempts: 1,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
        jobId: `decay_${botId}`,
      },
    );
  }
}
