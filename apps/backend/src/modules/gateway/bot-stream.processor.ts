import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  Inject,
  forwardRef,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import {
  QUEUE_NAMES,
  BOT_STREAM_JOB,
  BOT_STREAM_PUBSUB_CHANNEL,
} from '../../common/configs/queue/queue.constants';
import { ChatGateway } from './gateway';
import { AppLogger } from '../../common/configs/logger/logger.service';
import {
  BOT_INTERNAL_EVENT,
  SOCKET_EVENT,
  BotStreamStartPayload,
  BotStreamChunkPayload,
} from '@discord-platform/shared';
import { BotStreamJobData } from '../bot/bot-stream.producer';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { REDIS_SUBSCRIBER } from '../../common/configs/redis/redis.module';

// BullMQ 工作进程，处理机器人关键流事件（START / END）并将其转发到 WebSocket

// BOT_STREAM_CHUNK 迁移至 Redis PubSub
// 跳过队列存储和磁盘 IO，追求更高吞吐量；
// BOT_STREAM_START / BOT_STREAM_END 仍走 BullMQ 保证可靠交付。
@Processor(QUEUE_NAMES.BOT_STREAM)
export class BotStreamProcessor
  extends WorkerHost
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: AppLogger,
    @Inject(REDIS_SUBSCRIBER)
    private readonly redisSub: Redis,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.redisSub.subscribe(BOT_STREAM_PUBSUB_CHANNEL);

    this.redisSub.on('message', (channel: string, message: string) => {
      if (channel !== BOT_STREAM_PUBSUB_CHANNEL) return;
      try {
        const chunkPayload = JSON.parse(message) as BotStreamChunkPayload;
        this.gateway.server
          .to(chunkPayload.channelId)
          .emit(SOCKET_EVENT.BOT_STREAM_CHUNK, chunkPayload);
        this.eventEmitter.emit(
          BOT_INTERNAL_EVENT.BOT_STREAM_CHUNK,
          chunkPayload,
        );
      } catch (err) {
        this.logger.error(
          '[BotStreamProcessor] Failed to parse PubSub chunk message',
          err instanceof Error ? err.stack : String(err),
        );
      }
    });

    this.logger.log(
      `[BotStreamProcessor] Subscribed to Redis PubSub channel: ${BOT_STREAM_PUBSUB_CHANNEL}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.redisSub.unsubscribe(BOT_STREAM_PUBSUB_CHANNEL);
  }

  // bullmq 仅负责 START / END 可靠事件
  async process(job: Job<BotStreamJobData>): Promise<void> {
    if (job.name !== BOT_STREAM_JOB.STREAM_EVENT) {
      this.logger.warn(`[BotStreamProcessor] Unknown job name: ${job.name}`);
      return;
    }

    const { eventType, payload } = job.data;

    switch (eventType) {
      case BOT_INTERNAL_EVENT.BOT_STREAM_START: {
        const startPayload = payload as BotStreamStartPayload;
        this.gateway.server
          .to(startPayload.channelId)
          .emit(SOCKET_EVENT.BOT_STREAM_START, startPayload);
        break;
      }

      case BOT_INTERNAL_EVENT.BOT_STREAM_END: {
        const endPayload = payload as BotStreamChunkPayload;
        this.gateway.server
          .to(endPayload.channelId)
          .emit(SOCKET_EVENT.BOT_STREAM_END, endPayload);
        break;
      }

      default:
        this.logger.warn(
          `[BotStreamProcessor] Unknown event type: ${eventType}`,
        );
        return;
    }

    this.eventEmitter.emit(eventType, payload);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `[BotStreamProcessor] Job ${job.id} failed: ${error.message}`,
      error.stack,
    );
  }
}
