import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/mongoose';
import { Readable } from 'stream';

import { MessageDocument } from '../chat/schemas/message.schema';
import { Channel, ChannelModel } from '../channel/schemas/channel.schema';
import { ChatService } from '../chat/chat.service';
import { BotService } from './bot.service';
import { UserDocument } from '../user/schemas/user.schema';
import { BotDocument } from './schemas/bot.schema';

import {
  MESSAGE_EVENT,
  BOT_INTERNAL_EVENT,
  BOT_STATUS,
  AGENT_EVENT_TYPE,
  AgentPayload,
  AgentContextMessage,
  AgentResponse,
  BotStreamStartPayload,
  BotStreamChunkPayload,
} from '@discord-platform/shared';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { createHmac } from 'crypto';
import { AppLogger } from '../../common/configs/logger/logger.service';

@Injectable()
export class BotOrchestratorService {
  constructor(
    private readonly botService: BotService,
    private readonly chatService: ChatService,
    private readonly httpService: HttpService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
    @InjectModel(Channel.name) private readonly channelModel: ChannelModel,
  ) {}

  // 监听所有创建的消息
  @OnEvent(MESSAGE_EVENT.CREATE_MESSAGE, { async: true })
  async handleMessageCreated(message: MessageDocument): Promise<void> {
    try {
      const sender = message.sender as UserDocument;
      if (sender?.isBot) return;

      // 从 @ 中检查是否有 Bot 被提及
      const mentionedNames = this.extractMentions(message.content);
      if (mentionedNames.length === 0) return;

      const channelId = String(message.channelId);
      const channel = await this.channelModel.findById(channelId);
      if (!channel) return;
      const guildId = String(channel.guild);

      for (const name of mentionedNames) {
        const bot = await this.botService.findBotByNameInGuild(name, guildId);
        if (!bot || bot.status !== BOT_STATUS.ACTIVE) continue;

        this.logger.log(
          `Bot "${name}" mentioned in channel ${channelId}, dispatching to agent`,
        );

        // 并发处理每个提及的 Bot
        this.dispatchToAgent(bot, message, channelId, guildId).catch((err) =>
          this.logger.error(
            `Failed to dispatch to agent "${name}": ${err.message}`,
            err.stack,
          ),
        );
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`BotOrchestrator error: ${error.message}`, error.stack);
    }
  }

  // 分发消息到 Agent
  private async dispatchToAgent(
    bot: BotDocument,
    message: MessageDocument,
    channelId: string,
    guildId: string,
  ): Promise<void> {
    const sender = message.sender as UserDocument;
    const botUser = bot.userId as UserDocument;

    // TODO：引入轻量RAG或者记忆处理机制？
    const context = await this.buildContext(channelId);
    const cleanContent = this.stripMention(message.content, botUser.name);

    // 创建回调URL
    const baseUrl =
      this.configService.get<string>('API_BASE_URL') || 'http://localhost:3000';
    const webhookCallbackUrl = `${baseUrl}/api/webhooks/${bot._id}/${bot.webhookToken}/messages`;

    const payload: AgentPayload = {
      event: AGENT_EVENT_TYPE.AGENT_MENTION,
      botId: bot._id.toString(),
      guildId,
      channelId,
      messageId: message._id.toString(),
      author: {
        id: sender._id.toString(),
        name: sender.name,
        avatar: sender.avatar,
      },
      content: cleanContent,
      context,
      webhookCallbackUrl,
    };

    const signature = this.signPayload(payload, bot);

    this.logger.debug(
      `Sending payload to ${bot.webhookUrl} for bot ${bot._id}`,
    );

    // 给 Webhook 发送 POST 请求
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
          timeout: 120_000, // 2 minutes max
          validateStatus: (status) => status < 500,
        },
      );

      const contentType = response.headers['content-type'] || '';

      if (contentType.includes('text/event-stream')) {
        await this.handleStreamingResponse(
          response.data as Readable,
          bot,
          channelId,
        );
      } else {
        // 作为 JSON 直接响应处理
        const body = await this.readStreamToString(response.data as Readable);
        const agentResponse: AgentResponse = JSON.parse(body);
        await this.handleDirectResponse(agentResponse, bot, channelId);
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Agent request failed for bot ${bot._id}: ${error.message}`,
        error.stack,
      );

      await this.sendBotMessage(
        bot,
        channelId,
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

  // SSE 流式响应处理
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
    this.eventEmitter.emit(BOT_INTERNAL_EVENT.BOT_STREAM_START, startPayload);

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
              this.eventEmitter.emit(
                BOT_INTERNAL_EVENT.BOT_STREAM_END,
                chunkPayload,
              );
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
              this.eventEmitter.emit(
                BOT_INTERNAL_EVENT.BOT_STREAM_CHUNK,
                chunkPayload,
              );
            } catch {
              // 作为纯文本增量处理
              accumulatedContent += data;
              const chunkPayload: BotStreamChunkPayload = {
                botId: bot._id.toString(),
                channelId,
                content: data,
                done: false,
              };
              this.eventEmitter.emit(
                BOT_INTERNAL_EVENT.BOT_STREAM_CHUNK,
                chunkPayload,
              );
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
          `SSE stream error for bot ${bot._id}: ${err.message}`,
        );
        reject(err);
      });
    });
  }

  async sendBotMessage(
    bot: BotDocument,
    channelId: string,
    content: string,
  ): Promise<MessageDocument> {
    const botUser = bot.userId as unknown as UserDocument;
    const botUserId = botUser?._id
      ? botUser._id.toString()
      : String(bot.userId);

    return this.chatService.createMessage(botUserId, {
      channelId,
      content,
    });
  }

  private extractMentions(content: string): string[] {
    const regex = /@([a-zA-Z0-9_-]+)/g;
    const mentions: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      mentions.push(match[1]);
    }
    return mentions;
  }

  private stripMention(content: string, botName: string): string {
    const regex = new RegExp(`@${botName}\\b`, 'gi');
    return content.replace(regex, '').trim();
  }

  private async buildContext(
    channelId: string,
    limit = 50,
  ): Promise<AgentContextMessage[]> {
    const messages = await this.chatService.getMessages(channelId, limit);
    return messages.reverse().map((msg) => {
      const sender = msg.sender as unknown as UserDocument;
      return {
        role: sender?.isBot ? ('assistant' as const) : ('user' as const),
        content: msg.content,
        author: sender?.name || 'Unknown',
        messageId: msg._id.toString(),
        timestamp: msg.createdAt?.toISOString() || '',
      };
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
