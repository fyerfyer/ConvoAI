import {
  Controller,
  Post,
  Body,
  Param,
  Req,
  HttpStatus,
  UseGuards,
  Logger,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { Observable, Subject, filter, map } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ZodValidationPipe } from '../../common/pipes/validation.pipe';
import { WebhookGuard } from './webhook.guard';
import { BotOrchestratorService } from './bot-orchestrator.service';
import { BotDocument } from './schemas/bot.schema';
import {
  ApiResponse,
  MessageResponse,
  WebhookMessageDTO,
  webhookMessageDTOSchema,
  BOT_INTERNAL_EVENT,
  BotStreamChunkPayload,
  BotStreamStartPayload,
} from '@discord-platform/shared';
import { ChatService } from '../chat/chat.service';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  // 使用 RxJS Subject 来桥接内部事件与 SSE 流
  private readonly streamSubject = new Subject<{
    type: string;
    payload: BotStreamChunkPayload | BotStreamStartPayload;
  }>();

  constructor(
    private readonly orchestratorService: BotOrchestratorService,
    private readonly chatService: ChatService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.eventEmitter.on(
      BOT_INTERNAL_EVENT.BOT_STREAM_START,
      (payload: BotStreamStartPayload) =>
        this.streamSubject.next({ type: 'stream-start', payload }),
    );
    this.eventEmitter.on(
      BOT_INTERNAL_EVENT.BOT_STREAM_CHUNK,
      (payload: BotStreamChunkPayload) =>
        this.streamSubject.next({ type: 'stream-chunk', payload }),
    );
    this.eventEmitter.on(
      BOT_INTERNAL_EVENT.BOT_STREAM_END,
      (payload: BotStreamChunkPayload) =>
        this.streamSubject.next({ type: 'stream-end', payload }),
    );
  }

  @Throttle({
    short: { limit: 2, ttl: 1000 },
    medium: { limit: 20, ttl: 10000 },
  })
  @Post(':botId/:token/messages')
  @UseGuards(WebhookGuard)
  async postMessage(
    @Req() req: Request & { bot: BotDocument },
    @Body(new ZodValidationPipe(webhookMessageDTOSchema))
    dto: WebhookMessageDTO,
    @Body('channelId') channelId: string,
  ): Promise<ApiResponse<MessageResponse>> {
    const bot = req.bot;

    if (!channelId) {
      // channelId 通过 Body 传递
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'channelId is required in the request body',
      };
    }

    this.logger.log(
      `Webhook callback received for bot ${bot._id} → channel ${channelId}`,
    );

    const message = await this.orchestratorService.sendBotMessage(
      bot,
      channelId,
      dto.content,
    );

    const messageResponse = await this.chatService.toMessageResponse(message);

    return {
      data: messageResponse as MessageResponse,
      statusCode: HttpStatus.CREATED,
      message: 'Message sent',
    };
  }

  @SkipThrottle()
  // 与前端 SSE 连接，推送 Bot 事件流
  @Sse('stream/:channelId')
  streamBotEvents(
    @Param('channelId') channelId: string,
  ): Observable<MessageEvent> {
    return this.streamSubject.pipe(
      // 只推送 Bot 时间
      filter((event) => {
        const payload = event.payload as BotStreamChunkPayload & {
          channelId?: string;
        };
        return payload.channelId === channelId;
      }),
      map((event): MessageEvent => {
        return {
          type: event.type,
          data: event.payload,
        };
      }),
    );
  }
}
