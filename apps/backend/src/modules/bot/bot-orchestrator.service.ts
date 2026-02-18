import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';

import { MessageDocument } from '../chat/schemas/message.schema';
import { Channel, ChannelModel } from '../channel/schemas/channel.schema';
import { ChatService } from '../chat/chat.service';
import { BotService } from './bot.service';
import { UserDocument } from '../user/schemas/user.schema';
import { BotDocument } from './schemas/bot.schema';
import { AgentRunner } from './runners/agent-runner.service';

import {
  MESSAGE_EVENT,
  AgentContextMessage,
  BotExecutionContext,
  EXECUTION_MODE,
} from '@discord-platform/shared';
import { AppLogger } from '../../common/configs/logger/logger.service';

@Injectable()
export class BotOrchestratorService {
  constructor(
    private readonly botService: BotService,
    private readonly chatService: ChatService,
    private readonly agentRunner: AgentRunner,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: AppLogger,
    @InjectModel(Channel.name) private readonly channelModel: ChannelModel,
  ) {}

  // 记录已知的 Bot 用户 ID，防止 Bot 消息触发循环
  private botUserIds = new Set<string>();

  // 监听所有创建的消息
  @OnEvent(MESSAGE_EVENT.CREATE_MESSAGE, { async: true })
  async handleMessageCreated(message: MessageDocument): Promise<void> {
    try {
      const sender = message.sender as UserDocument;

      // 防止 Bot 消息触发循环：检查 isBot 标志 + 已知 Bot 用户 ID 缓存
      const senderId = sender?._id
        ? sender._id.toString()
        : String(message.sender);
      if (sender?.isBot || this.botUserIds.has(senderId)) return;

      // Quick check: does the message contain @ at all?
      if (!message.content?.includes('@')) return;

      const channelId = String(message.channelId);
      const channel = await this.channelModel.findById(channelId);
      if (!channel) return;
      const guildId = String(channel.guild);

      // Load all active bots in the guild (single DB query)
      const activeBots = await this.botService.findActiveBotsByGuild(guildId);
      if (activeBots.length === 0) return;

      // Match multi-word bot names against message content (case-insensitive)
      const contentLower = message.content.toLowerCase();
      const mentionedBots = activeBots.filter((bot) => {
        const user = bot.userId as unknown as UserDocument;
        const botName = user?.name;
        if (!botName) return false;
        return contentLower.includes(`@${botName.toLowerCase()}`);
      });

      if (mentionedBots.length === 0) return;

      // Build context once for all dispatches (exclude current message to avoid duplication)
      const context = await this.buildContext(channelId);
      const currentMsgId = message._id.toString();
      const filteredContext = context.filter(
        (m) => m.messageId !== currentMsgId,
      );

      for (const bot of mentionedBots) {
        const botUser = bot.userId as unknown as UserDocument;
        const botName = botUser.name;

        this.logger.log(
          `Bot "${botName}" mentioned in channel ${channelId}, dispatching via AgentRunner (mode: ${bot.executionMode || 'webhook'})`,
        );

        // 缓存 Bot 用户 ID，防止后续 Bot 消息重入
        this.botUserIds.add(botUser._id.toString());
        const cleanContent = this.stripMention(message.content, botName);

        const executionCtx: BotExecutionContext = {
          botId: bot._id.toString(),
          botUserId: botUser._id.toString(),
          botName,
          guildId,
          channelId,
          messageId: message._id.toString(),
          author: {
            id: sender._id.toString(),
            name: sender.name,
            avatar: sender.avatar,
          },
          content: cleanContent,
          rawContent: message.content,
          context: filteredContext,
          executionMode: bot.executionMode || EXECUTION_MODE.WEBHOOK,
        };

        // 通过 AgentRunner 统一分发
        this.agentRunner
          .dispatch(bot, executionCtx)
          .catch((err) =>
            this.logger.error(
              `Failed to dispatch to agent "${botName}": ${err.message}`,
              err.stack,
            ),
          );
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`BotOrchestrator error: ${error.message}`, error.stack);
    }
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

  private stripMention(content: string, botName: string): string {
    const escaped = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`@${escaped}\\b`, 'gi');
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
}
