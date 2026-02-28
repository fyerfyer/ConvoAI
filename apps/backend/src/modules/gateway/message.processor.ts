import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  QUEUE_NAMES,
  MESSAGE_JOB,
} from '../../common/configs/queue/queue.constants';
import { ChatService } from '../chat/chat.service';
import { BotOrchestratorService } from '../bot/bot-orchestrator.service';
import { UnreadService } from '../unread/unread.service';
import { MemberService } from '../member/member.service';
import { ChatGateway } from './gateway';
import { AppLogger } from '../../common/configs/logger/logger.service';
import { Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { SOCKET_EVENT } from '@discord-platform/shared';
import { UserDocument } from '../user/schemas/user.schema';
import { ChannelService } from '../channel/channel.service';
import { HealthRegistry } from '../health/health.registry';

export interface MessageBroadcastData {
  messageId: string;
  channelId: string;
}

@Processor(QUEUE_NAMES.MESSAGE)
export class MessageProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => BotOrchestratorService))
    private readonly botOrchestrator: BotOrchestratorService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
    private readonly unreadService: UnreadService,
    private readonly memberService: MemberService,
    private readonly channelService: ChannelService,
    private readonly logger: AppLogger,
    private readonly healthRegistry: HealthRegistry,
  ) {
    super();
  }

  onModuleInit(): void {
    this.healthRegistry.register({
      name: 'MessageProcessor',
      queue: QUEUE_NAMES.MESSAGE,
      status: 'started',
      startedAt: new Date().toISOString(),
      details: 'Handles message.broadcast & message.bot-detect jobs',
    });
    this.logger.log(
      `[MessageProcessor] Worker started for queue "${QUEUE_NAMES.MESSAGE}"`,
    );
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

    try {
      const sender = message.sender as UserDocument;
      const senderId = sender?._id?.toString() || String(message.sender);

      const channel = await this.channelService.getChannelById(roomId);
      if (channel) {
        const guildId = String(channel.guild);
        const members = await this.memberService.getGuildMembers(guildId);
        const memberUserIds = members.map((m) => String(m.user));

        await this.unreadService.incrementUnread(
          roomId,
          messageId,
          message.createdAt?.toISOString() || new Date().toISOString(),
          memberUserIds,
          senderId,
        );

        // 在每个 room 中广播未读消息更新
        for (const userId of memberUserIds) {
          if (userId === senderId) continue;
          const unread = await this.unreadService.getUnreadForChannel(
            userId,
            roomId,
          );
          this.gateway.server
            .to(`user:${userId}`)
            .emit(SOCKET_EVENT.UNREAD_UPDATE, {
              channelId: roomId,
              count: unread.count,
              lastMessageId: messageId,
              lastMessageAt:
                message.createdAt?.toISOString() || new Date().toISOString(),
            });
        }
      }
    } catch (err) {
      this.logger.warn(
        `[MessageProcessor] Unread tracking failed for message ${messageId}: ${err}`,
      );
    }

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
