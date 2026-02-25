import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { createHmac, randomBytes } from 'crypto';

import { BotDocument } from '../schemas/bot.schema';
import { ChatService } from '../../chat/chat.service';
import { UserDocument } from '../../user/schemas/user.schema';
import { AppLogger } from '../../../common/configs/logger/logger.service';
import { BotStreamProducer } from '../bot-stream.producer';

import {
  BotExecutionContext,
  AgentPayload,
  AgentResponse,
  AGENT_EVENT_TYPE,
  BotStreamStartPayload,
  BotStreamChunkPayload,
} from '@discord-platform/shared';

@Injectable()
export class WebhookRunner {
  constructor(
    private readonly httpService: HttpService,
    private readonly chatService: ChatService,
    private readonly botStreamProducer: BotStreamProducer,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  async execute(bot: BotDocument, ctx: BotExecutionContext): Promise<void> {
    if (!bot.webhookUrl) {
      this.logger.warn(`Bot ${ctx.botId} has no webhookUrl configured`);
      return;
    }

    const baseUrl =
      this.configService.get<string>('API_BASE_URL') || 'http://localhost:3000';
    const webhookCallbackUrl = `${baseUrl}/api/webhooks/${bot._id}/${bot.webhookToken}/messages`;

    const payload: AgentPayload = {
      event: AGENT_EVENT_TYPE.AGENT_MENTION,
      botId: ctx.botId,
      guildId: ctx.guildId,
      channelId: ctx.channelId,
      messageId: ctx.messageId,
      author: ctx.author,
      content: ctx.content,
      context: ctx.context,
      webhookCallbackUrl,
    };

    const signature = this.signPayload(payload, bot);

    this.logger.debug(
      `[WebhookRunner] Sending payload to ${bot.webhookUrl} for bot ${ctx.botId}`,
    );

    try {
      const response = await this.httpService.axiosRef.post(
        bot.webhookUrl,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            Accept: 'text/event-stream, application/json',
          },
          responseType: 'stream',
          timeout: 120_000,
          validateStatus: (status) => status < 500,
        },
      );

      const contentType = response.headers['content-type'] || '';

      if (contentType.includes('text/event-stream')) {
        await this.handleStreamingResponse(
          response.data as Readable,
          bot,
          ctx.channelId,
        );
      } else {
        const body = await this.readStreamToString(response.data as Readable);
        const agentResponse: AgentResponse = JSON.parse(body);
        await this.handleDirectResponse(agentResponse, bot, ctx.channelId);
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[WebhookRunner] Agent request failed for bot ${ctx.botId}: ${error.message}`,
        error.stack,
      );

      await this.sendBotMessage(
        bot,
        ctx.channelId,
        `⚠️ Agent is currently unavailable. Please try again later.`,
      );
    }
  }

  private async handleDirectResponse(
    agentResponse: AgentResponse,
    bot: BotDocument,
    channelId: string,
  ): Promise<void> {
    if (!agentResponse.content) return;
    await this.sendBotMessage(bot, channelId, agentResponse.content);
  }

  private async handleStreamingResponse(
    stream: Readable,
    bot: BotDocument,
    channelId: string,
  ): Promise<void> {
    const streamId = randomBytes(8).toString('hex');
    let accumulatedContent = '';

    const startPayload: BotStreamStartPayload = {
      botId: bot._id.toString(),
      channelId,
      streamId,
    };
    await this.botStreamProducer.emitStreamStart(startPayload);

    return new Promise<void>((resolve, reject) => {
      let buffer = '';

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);

            if (data === '[DONE]') {
              const chunkPayload: BotStreamChunkPayload = {
                botId: bot._id.toString(),
                channelId,
                content: accumulatedContent,
                done: true,
              };
              this.botStreamProducer.emitStreamEnd(chunkPayload);
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const textDelta = parsed.content || parsed.delta || '';
              accumulatedContent += textDelta;
              const chunkPayload: BotStreamChunkPayload = {
                botId: bot._id.toString(),
                channelId,
                content: textDelta,
                done: false,
              };
              this.botStreamProducer.emitStreamChunk(chunkPayload);
            } catch {
              accumulatedContent += data;
              const chunkPayload: BotStreamChunkPayload = {
                botId: bot._id.toString(),
                channelId,
                content: data,
                done: false,
              };
              this.botStreamProducer.emitStreamChunk(chunkPayload);
            }
          }
        }
      });

      stream.on('end', async () => {
        if (accumulatedContent.trim()) {
          await this.sendBotMessage(bot, channelId, accumulatedContent);
        }
        resolve();
      });

      stream.on('error', (err) => {
        this.logger.error(
          `[WebhookRunner] SSE stream error for bot ${bot._id}: ${err.message}`,
        );
        reject(err);
      });
    });
  }

  async sendBotMessage(
    bot: BotDocument,
    channelId: string,
    content: string,
  ): Promise<void> {
    const botUser = bot.userId as unknown as UserDocument;
    const botUserId = botUser?._id
      ? botUser._id.toString()
      : String(bot.userId);

    await this.chatService.createMessage(botUserId, {
      channelId,
      content,
    });
  }

  private signPayload(payload: AgentPayload, bot: BotDocument): string {
    const secret = (bot as BotDocument & { webhookSecret?: string })
      .webhookSecret;
    if (!secret) {
      this.logger.warn(
        `No webhook secret for bot ${bot._id}, skipping signature`,
      );
      return '';
    }
    return createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  private readStreamToString(stream: Readable): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      stream.on('error', reject);
    });
  }
}
