import { Injectable, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import {
  QUEUE_NAMES,
  BOT_STREAM_JOB,
  BOT_STREAM_PUBSUB_CHANNEL,
} from '../../common/configs/queue/queue.constants';
import {
  BotStreamStartPayload,
  BotStreamChunkPayload,
  BOT_INTERNAL_EVENT,
} from '@discord-platform/shared';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';

export interface BotStreamJobData {
  eventType: string;
  payload: BotStreamStartPayload | BotStreamChunkPayload;
}

// 关键事件（START / END）走 BullMQ 保证可靠交付
// 高频流式 chunk 走 Redis PubSub
@Injectable()
export class BotStreamProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.BOT_STREAM)
    private readonly botStreamQueue: Queue,
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
  ) {}

  async emitStreamStart(payload: BotStreamStartPayload): Promise<void> {
    await this.botStreamQueue.add(
      BOT_STREAM_JOB.STREAM_EVENT,
      {
        eventType: BOT_INTERNAL_EVENT.BOT_STREAM_START,
        payload,
      },
      {
        priority: 1,
        attempts: 1,
        removeOnComplete: { age: 60 },
        removeOnFail: { age: 300 },
      },
    );
  }

  async emitStreamChunk(payload: BotStreamChunkPayload): Promise<void> {
    // PubSub: 不落盘、不存储，仅内存广播，吞吐量远高于 BullMQ
    await this.redisClient.publish(
      BOT_STREAM_PUBSUB_CHANNEL,
      JSON.stringify(payload),
    );
  }

  async emitStreamEnd(payload: BotStreamChunkPayload): Promise<void> {
    await this.botStreamQueue.add(
      BOT_STREAM_JOB.STREAM_EVENT,
      {
        eventType: BOT_INTERNAL_EVENT.BOT_STREAM_END,
        payload,
      },
      {
        priority: 1,
        attempts: 1,
        removeOnComplete: { age: 60 },
        removeOnFail: { age: 300 },
      },
    );
  }
}
