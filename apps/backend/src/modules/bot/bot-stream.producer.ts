import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  BOT_STREAM_JOB,
} from '../../common/configs/queue/queue.constants';
import {
  BotStreamStartPayload,
  BotStreamChunkPayload,
  BOT_INTERNAL_EVENT,
} from '@discord-platform/shared';

export interface BotStreamJobData {
  eventType: string;
  payload: BotStreamStartPayload | BotStreamChunkPayload;
}

// 使用 bullmq 而不是 EventEmitter2 来发布事件
@Injectable()
export class BotStreamProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.BOT_STREAM)
    private readonly botStreamQueue: Queue,
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
    await this.botStreamQueue.add(
      BOT_STREAM_JOB.STREAM_EVENT,
      {
        eventType: BOT_INTERNAL_EVENT.BOT_STREAM_CHUNK,
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
