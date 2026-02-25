import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  MESSAGE_JOB,
} from '../../common/configs/queue/queue.constants';
import { AppLogger } from '../../common/configs/logger/logger.service';

@Injectable()
export class MessageProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.MESSAGE) private readonly messageQueue: Queue,
    private readonly logger: AppLogger,
  ) {}

  async publishMessageCreated(
    messageId: string,
    channelId: string,
  ): Promise<void> {
    await this.messageQueue.add(
      MESSAGE_JOB.BROADCAST,
      { messageId, channelId },
      {
        priority: 1,
        attempts: 2,
        backoff: { type: 'fixed', delay: 500 },
        removeOnComplete: { age: 600 },
      },
    );

    await this.messageQueue.add(
      MESSAGE_JOB.BOT_DETECT,
      { messageId, channelId },
      {
        priority: 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    );

    this.logger.debug(
      `[MessageProducer] Enqueued broadcast + bot-detect for message ${messageId}`,
    );
  }
}
