import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  QUEUE_NAMES,
  MESSAGE_JOB,
} from '../../common/configs/queue/queue.constants';
import { ChatService } from '../chat/chat.service';
import { BotOrchestratorService } from '../bot/bot-orchestrator.service';
import { ChatGateway } from './gateway';
import { AppLogger } from '../../common/configs/logger/logger.service';
import { Inject, forwardRef } from '@nestjs/common';
import { SOCKET_EVENT } from '@discord-platform/shared';

export interface MessageBroadcastData {
  messageId: string;
  channelId: string;
}

@Processor(QUEUE_NAMES.MESSAGE)
export class MessageProcessor extends WorkerHost {
  constructor(
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => BotOrchestratorService))
    private readonly botOrchestrator: BotOrchestratorService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  async process(job: Job<MessageBroadcastData>): Promise<void> {
    switch (job.name) {
      case MESSAGE_JOB.BROADCAST:
        await this.handleBroadcast(job);
        break;
      case MESSAGE_JOB.BOT_DETECT:
        await this.handleBotDetect(job);
        break;
      default:
        this.logger.warn(`[MessageProcessor] Unknown job name: ${job.name}`);
    }
  }

  private async handleBroadcast(job: Job<MessageBroadcastData>): Promise<void> {
    const { messageId } = job.data;

    // Mongo 文档无法序列化，在这里再取一次
    const message = await this.chatService.findMessageById(messageId);
    if (!message) {
      this.logger.warn(
        `[MessageProcessor] Message ${messageId} not found, skipping broadcast`,
      );
      return;
    }

    const response = await this.chatService.toMessageResponse(message);
    const roomId = (message.channelId ?? '').toString();

    this.gateway.server.to(roomId).emit(SOCKET_EVENT.NEW_MESSAGE, response);

    this.logger.debug(
      `[MessageProcessor] Broadcast message ${messageId} to room ${roomId}`,
    );
  }

  private async handleBotDetect(job: Job<MessageBroadcastData>): Promise<void> {
    const { messageId } = job.data;

    const message = await this.chatService.findMessageById(messageId);
    if (!message) {
      this.logger.warn(
        `[MessageProcessor] Message ${messageId} not found, skipping bot detection`,
      );
      return;
    }

    await this.botOrchestrator.handleMessageForBotDetection(message);

    this.logger.debug(
      `[MessageProcessor] Bot detection completed for message ${messageId}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `[MessageProcessor] Job ${job.name}:${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${error.message}`,
      error.stack,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`[MessageProcessor] Job ${job.name}:${job.id} completed`);
  }
}
