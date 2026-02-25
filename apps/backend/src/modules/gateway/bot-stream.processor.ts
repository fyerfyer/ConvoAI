import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, forwardRef } from '@nestjs/common';
import {
  QUEUE_NAMES,
  BOT_STREAM_JOB,
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

// BullMQ 工作进程，处理机器人流事件并将其转发

// 同时重新向 EventEmitter2 发出事件，以便 
// WebhookController SSE Gateway 桥继续工作。
@Processor(QUEUE_NAMES.BOT_STREAM)
export class BotStreamProcessor extends WorkerHost {
  constructor(
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: AppLogger,
  ) {
    super();
  }

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

      case BOT_INTERNAL_EVENT.BOT_STREAM_CHUNK: {
        const chunkPayload = payload as BotStreamChunkPayload;
        this.gateway.server
          .to(chunkPayload.channelId)
          .emit(SOCKET_EVENT.BOT_STREAM_CHUNK, chunkPayload);
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
