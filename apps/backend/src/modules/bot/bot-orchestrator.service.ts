import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { MessageDocument } from '../chat/schemas/message.schema';
import { Channel, ChannelModel } from '../channel/schemas/channel.schema';
import { ChatService } from '../chat/chat.service';
import { BotService } from './bot.service';
import { ChannelBotService } from './channel-bot.service';
import { MemoryService } from '../memory/services/memory.service';
import { UserDocument } from '../user/schemas/user.schema';
import { BotDocument } from './schemas/bot.schema';
import { ChannelBotDocument } from './schemas/channel-bot.schema';
import { AgentRunner } from './runners/agent-runner.service';

import {
  AgentContextMessage,
  BotExecutionContext,
  EXECUTION_MODE,
  BOT_SCOPE,
  MEMORY_SCOPE,
  LlmToolValue,
  MemoryScopeValue,
} from '@discord-platform/shared';
import { AppLogger } from '../../common/configs/logger/logger.service';

@Injectable()
export class BotOrchestratorService {
  constructor(
    private readonly botService: BotService,
    private readonly channelBotService: ChannelBotService,
    private readonly chatService: ChatService,
    private readonly memoryService: MemoryService,
    private readonly agentRunner: AgentRunner,
    private readonly logger: AppLogger,
    @InjectModel(Channel.name) private readonly channelModel: ChannelModel,
  ) {}

  // 记录已知的 Bot 用户 ID，防止 Bot 消息触发循环
  private botUserIds = new Set<string>();

  // 不使用 OnEvent 装饰器而是让 bullmq 调用
  async handleMessageForBotDetection(message: MessageDocument): Promise<void> {
    try {
      const sender = message.sender as UserDocument;

      // 防止 Bot 消息触发循环：检查 isBot 标志 + 已知 Bot 用户 ID 缓存
      const senderId = sender?._id
        ? sender._id.toString()
        : String(message.sender);
      if (sender?.isBot || this.botUserIds.has(senderId)) return;

      if (!message.content?.includes('@')) return;

      const channelId = String(message.channelId);
      const channel = await this.channelModel.findById(channelId);
      if (!channel) return;
      const guildId = String(channel.guild);

      // Channel-first 策略
      // 1. 加载该频道所有活跃的 Channel Bot 绑定
      // 2. 加载该 Guild 的所有 Guild-scope Bot
      // 3. 合并去重后匹配 @mention

      const [channelBindings, guildBots] = await Promise.all([
        this.channelBotService.findActiveBindingsByChannel(channelId),
        this.botService.findActiveBotsByGuild(guildId),
      ]);

      if (channelBindings.length === 0 && guildBots.length === 0) return;

      // 构建 channel 绑定 Bot 的 ID 集合
      const channelBoundBotIds = new Set(
        channelBindings.map((b) => String(b.botId)),
      );

      // 分离 Guild-scope Bot
      const guildScopeBots = guildBots.filter(
        (bot) =>
          bot.scope === BOT_SCOPE.GUILD &&
          !channelBoundBotIds.has(bot._id.toString()),
      );

      const channelBotDefs = await Promise.all(
        channelBindings.map(async (binding) => {
          const bot = guildBots.find(
            (b) => b._id.toString() === String(binding.botId),
          );
          if (bot) return { bot, binding };
          // 如果 guildBots 中没有（可能不是 active），再单独查
          try {
            const loadedBot = await this.botService.findActiveBotById(
              String(binding.botId),
            );
            return loadedBot ? { bot: loadedBot, binding } : null;
          } catch {
            return null;
          }
        }),
      );
      const validChannelBots = channelBotDefs.filter(
        (x): x is { bot: BotDocument; binding: ChannelBotDocument } =>
          x !== null,
      );

      const contentLower = message.content.toLowerCase();

      // 匹配 Channel-bound bots
      const mentionedChannelBots = validChannelBots.filter(({ bot }) => {
        const user = bot.userId as unknown as UserDocument;
        const botName = user?.name;
        if (!botName) return false;
        return contentLower.includes(`@${botName.toLowerCase()}`);
      });

      // 匹配 Guild-scope bots
      const mentionedGuildBots = guildScopeBots.filter((bot) => {
        const user = bot.userId as unknown as UserDocument;
        const botName = user?.name;
        if (!botName) return false;
        return contentLower.includes(`@${botName.toLowerCase()}`);
      });

      if (
        mentionedChannelBots.length === 0 &&
        mentionedGuildBots.length === 0
      ) {
        return;
      }

      const context = await this.buildContext(channelId);
      const currentMsgId = message._id.toString();
      const filteredContext = context.filter(
        (m) => m.messageId !== currentMsgId,
      );

      // Dispatch Channel-bound bots（带频道级覆盖配置）
      for (const { bot, binding } of mentionedChannelBots) {
        const botUser = bot.userId as unknown as UserDocument;
        const botName = botUser.name;

        this.logger.log(
          `[Channel Bot] "${botName}" mentioned in channel ${channelId}, dispatching (mode: ${bot.executionMode || 'webhook'}, memory: ${binding.memoryScope})`,
        );

        this.botUserIds.add(botUser._id.toString());
        const cleanContent = this.stripMention(message.content, botName);

        // 根据记忆范围获取记忆上下文
        const memoryScope = binding.memoryScope as MemoryScopeValue;
        const memory = await this.memoryService.getMemoryContext(
          bot._id.toString(),
          channelId,
          guildId,
          memoryScope,
        );

        // 构建带频道覆盖的上下文
        const contextMessages =
          memoryScope === MEMORY_SCOPE.EPHEMERAL
            ? [] // 临时模式不带历史上下文
            : filteredContext;

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
          context: contextMessages,
          executionMode: bot.executionMode || EXECUTION_MODE.WEBHOOK,
          // Channel 覆写
          channelBotId: binding._id.toString(),
          overrideSystemPrompt: binding.overridePrompt,
          overrideTools: binding.overrideTools as LlmToolValue[] | undefined,
          memoryScope,
          // 注入记忆上下文
          memory,
        };

        this.agentRunner
          .dispatch(bot, executionCtx)
          .catch((err) =>
            this.logger.error(
              `Failed to dispatch channel bot "${botName}": ${err.message}`,
              err.stack,
            ),
          );
      }

      // Dispatch
      for (const bot of mentionedGuildBots) {
        const botUser = bot.userId as unknown as UserDocument;
        const botName = botUser.name;

        this.logger.log(
          `[Guild Bot] "${botName}" mentioned in channel ${channelId}, dispatching (mode: ${bot.executionMode || 'webhook'})`,
        );

        this.botUserIds.add(botUser._id.toString());
        const cleanContent = this.stripMention(message.content, botName);

        // Guild-scope bots 使用 channel 记忆范围（每个频道独立记忆）
        const memory = await this.memoryService.getMemoryContext(
          bot._id.toString(),
          channelId,
          guildId,
          MEMORY_SCOPE.CHANNEL,
        );

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
          memoryScope: MEMORY_SCOPE.CHANNEL,
          // 注入记忆上下文
          memory,
        };

        this.agentRunner
          .dispatch(bot, executionCtx)
          .catch((err) =>
            this.logger.error(
              `Failed to dispatch guild bot "${botName}": ${err.message}`,
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
