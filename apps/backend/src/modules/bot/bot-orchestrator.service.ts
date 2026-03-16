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
  MEMORY_SCOPE,
  BOT_TRIGGER_TYPE,
  LlmToolValue,
  MemoryScopeValue,
} from '@discord-platform/shared';
import { AppLogger } from '../../common/configs/logger/logger.service';

// 标准 mention 格式：<@userId>
const MENTION_PATTERN = /<@([a-f0-9]{24})>/gi;

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

      const content = message.content || '';
      const isSlashCommand = content.startsWith('/');
      // 支持标准 mention <@userId> 和旧式 @Name
      const hasMention = content.includes('@') || MENTION_PATTERN.test(content);

      this.logger.log(
        `[BotOrchestrator] Message ${message._id} from user ${senderId}: isSlashCommand=${isSlashCommand}, hasMention=${hasMention}, content="${content.slice(0, 80)}"`,
      );

      // 如果既没有 @mention 也不是 slash command，跳过
      if (!isSlashCommand && !hasMention) {
        this.logger.log(
          `[BotOrchestrator] Skipping message ${message._id} — no @mention and not a slash command. To trigger a bot, use @BotName or /command.`,
        );
        return;
      }

      const channelId = String(message.channelId);
      const channel = await this.channelModel.findById(channelId);
      if (!channel) return;
      const guildId = String(channel.guild);

      // Channel-first 策略
      const [channelBindings, guildBots] = await Promise.all([
        this.channelBotService.findActiveBindingsByChannel(channelId),
        this.botService.findActiveBotsByGuild(guildId),
      ]);

      this.logger.log(
        `[BotOrchestrator] Channel ${channelId}: ${channelBindings.length} binding(s), ${guildBots.length} guild-wide bot(s)`,
      );

      if (channelBindings.length === 0 && guildBots.length === 0) {
        this.logger.log(
          `[BotOrchestrator] No bots found for channel ${channelId} / guild ${guildId} — skipping`,
        );
        return;
      }

      // 构建 channel 绑定 Bot 的 ID 集合
      const channelBoundBotIds = new Set(
        channelBindings.map((b) => String(b.botId)),
      );

      // 所有未通过 ChannelBot 绑定到本频道的 Bot（不限 scope）
      // 不管 scope 是 GUILD 还是 CHANNEL，只要用户 @ 或使用 slash command 都应该能响应
      const guildScopeBots = guildBots.filter(
        (bot) => !channelBoundBotIds.has(bot._id.toString()),
      );

      const channelBotDefs = await Promise.all(
        channelBindings.map(async (binding) => {
          const bot = guildBots.find(
            (b) => b._id.toString() === String(binding.botId),
          );
          if (bot) return { bot, binding };
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

      // Slash Command 检测
      if (isSlashCommand) {
        const parsed = this.parseSlashCommand(content);
        if (parsed) {
          await this.handleSlashCommand(
            parsed,
            message,
            sender,
            channelId,
            guildId,
            validChannelBots,
            guildScopeBots,
          );
          return; // slash command 处理完毕，不再走 @mention 流程
        }
      }

      if (!hasMention) return;

      // 解析标准 mention: <@userId> 格式
      const mentionedUserIds = this.parseMentionIds(content);
      const contentLower = content.toLowerCase();

      // 优先按 userId 匹配（标准 mention 协议），退而使用 @Name 匹配（向后兼容）
      const mentionedChannelBots = validChannelBots.filter(({ bot }) => {
        const user = bot.userId as unknown as UserDocument;
        const userId = user?._id?.toString();
        if (userId && mentionedUserIds.has(userId)) return true;
        // 回退: @Name 匹配
        const botName = user?.name;
        if (!botName) return false;
        return contentLower.includes(`@${botName.toLowerCase()}`);
      });

      const mentionedGuildBots = guildScopeBots.filter((bot) => {
        const user = bot.userId as unknown as UserDocument;
        const userId = user?._id?.toString();
        if (userId && mentionedUserIds.has(userId)) return true;
        // 回退: @Name 匹配
        const botName = user?.name;
        if (!botName) return false;
        return contentLower.includes(`@${botName.toLowerCase()}`);
      });

      if (
        mentionedChannelBots.length === 0 &&
        mentionedGuildBots.length === 0
      ) {
        const availableNames = [
          ...validChannelBots.map(({ bot }) => {
            const u = bot.userId as unknown as UserDocument;
            return u?.name || '?';
          }),
          ...guildScopeBots.map((bot) => {
            const u = bot.userId as unknown as UserDocument;
            return u?.name || '?';
          }),
        ];
        this.logger.log(
          `[BotOrchestrator] No bot was @mentioned in message ${message._id}. Available bots: [${availableNames.join(', ')}]. Use @BotName to trigger.`,
        );
        return;
      }

      const context = await this.buildContext(channelId);
      const currentMsgId = message._id.toString();
      const filteredContext = context.filter(
        (m) => m.messageId !== currentMsgId,
      );

      for (const { bot, binding } of mentionedChannelBots) {
        const botUser = bot.userId as unknown as UserDocument;
        const botName = botUser.name;

        this.logger.log(
          `[Channel Bot] "${botName}" mentioned in channel ${channelId}, dispatching (mode: ${bot.executionMode || 'webhook'}, memory: ${binding.memoryScope})`,
        );

        this.botUserIds.add(botUser._id.toString());
        const cleanContent = this.stripMention(message.content, botName);

        const memoryScope = binding.memoryScope as MemoryScopeValue;
        const memory = await this.memoryService.getMemoryContext(
          bot._id.toString(),
          channelId,
          guildId,
          memoryScope,
          sender._id.toString(),
          cleanContent,
        );

        const contextMessages =
          memoryScope === MEMORY_SCOPE.EPHEMERAL ? [] : filteredContext;

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
          channelBotId: binding._id.toString(),
          overrideSystemPrompt: binding.overridePrompt,
          overrideTools: binding.overrideTools as LlmToolValue[] | undefined,
          memoryScope,
          memory,
          policy: binding.policy
            ? {
                canSummarize: binding.policy.canSummarize ?? true,
                canUseTools: binding.policy.canUseTools ?? true,
                maxTokensPerRequest: binding.policy.maxTokensPerRequest ?? 2048,
              }
            : undefined,
          trigger: { type: BOT_TRIGGER_TYPE.MENTION },
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

      // 分发 Guild-scope bots
      for (const bot of mentionedGuildBots) {
        const botUser = bot.userId as unknown as UserDocument;
        const botName = botUser.name;

        this.logger.log(
          `[Guild Bot] "${botName}" mentioned in channel ${channelId}, dispatching (mode: ${bot.executionMode || 'webhook'})`,
        );

        this.botUserIds.add(botUser._id.toString());
        const cleanContent = this.stripMention(message.content, botName);

        const memory = await this.memoryService.getMemoryContext(
          bot._id.toString(),
          channelId,
          guildId,
          MEMORY_SCOPE.CHANNEL,
          sender._id.toString(),
          cleanContent,
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
          memory,
          trigger: { type: BOT_TRIGGER_TYPE.MENTION },
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

  private parseSlashCommand(
    content: string,
  ): { name: string; args: Record<string, string>; raw: string } | null {
    const trimmed = content.trim();
    if (!trimmed.startsWith('/')) return null;

    const parts = trimmed.slice(1).split(/\s+/);
    const name = parts[0]?.toLowerCase();
    if (!name || name.length === 0) return null;

    const args: Record<string, string> = {};
    const positionalArgs: string[] = [];

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const colonIdx = part.indexOf(':');
      if (colonIdx > 0) {
        // 命名参数: key:value
        const key = part.slice(0, colonIdx);
        const value = part.slice(colonIdx + 1);
        args[key] = value;
      } else {
        // 位置参数
        positionalArgs.push(part);
      }
    }

    // 将位置参数存为 _0, _1, ... 并将整体存为 _positional
    positionalArgs.forEach((val, idx) => {
      args[`_${idx}`] = val;
    });
    if (positionalArgs.length > 0) {
      args['_positional'] = positionalArgs.join(' ');
    }

    return { name, args, raw: trimmed };
  }

  private async handleSlashCommand(
    parsed: { name: string; args: Record<string, string>; raw: string },
    message: MessageDocument,
    sender: UserDocument,
    channelId: string,
    guildId: string,
    validChannelBots: Array<{ bot: BotDocument; binding: ChannelBotDocument }>,
    guildScopeBots: BotDocument[],
  ): Promise<void> {
    // 在 channel-bound bots 中查找匹配的命令
    for (const { bot, binding } of validChannelBots) {
      const matchedCmd = (bot.commands || []).find(
        (cmd) => cmd.name === parsed.name,
      );
      if (!matchedCmd) continue;

      const botUser = bot.userId as unknown as UserDocument;
      const botName = botUser?.name || 'Bot';

      this.logger.log(
        `[SlashCmd] "/${parsed.name}" matched bot "${botName}" in channel ${channelId}`,
      );

      this.botUserIds.add(botUser._id.toString());

      // 如果 handler 是 prompt 类型，渲染模板；否则使用位置参数作为内容（去掉 /command 前缀）
      let content = parsed.args['_positional'] || parsed.raw;
      if (
        matchedCmd.handler?.type === 'prompt' &&
        matchedCmd.handler.promptTemplate
      ) {
        content = this.renderPromptTemplate(
          matchedCmd.handler.promptTemplate,
          parsed.args,
          matchedCmd.params || [],
        );
      }

      const memoryScope = binding.memoryScope as MemoryScopeValue;
      const memory = await this.memoryService.getMemoryContext(
        bot._id.toString(),
        channelId,
        guildId,
        memoryScope,
        sender._id.toString(),
        content,
      );

      const context = await this.buildContext(channelId);
      const filteredContext = context.filter(
        (m) => m.messageId !== message._id.toString(),
      );
      const contextMessages =
        memoryScope === MEMORY_SCOPE.EPHEMERAL ? [] : filteredContext;

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
        content,
        rawContent: message.content,
        context: contextMessages,
        executionMode: bot.executionMode || EXECUTION_MODE.WEBHOOK,
        channelBotId: binding._id.toString(),
        overrideSystemPrompt: binding.overridePrompt,
        overrideTools:
          matchedCmd.handler?.type === 'tool' && matchedCmd.handler.toolId
            ? [matchedCmd.handler.toolId as LlmToolValue]
            : (binding.overrideTools as LlmToolValue[] | undefined),
        memoryScope,
        memory,
        policy: binding.policy
          ? {
              canSummarize: binding.policy.canSummarize ?? true,
              canUseTools: binding.policy.canUseTools ?? true,
              maxTokensPerRequest: binding.policy.maxTokensPerRequest ?? 2048,
            }
          : undefined,
        trigger: {
          type: BOT_TRIGGER_TYPE.SLASH_COMMAND,
          slashCommand: {
            name: parsed.name,
            args: parsed.args,
            raw: parsed.raw,
          },
        },
      };

      this.agentRunner
        .dispatch(bot, executionCtx)
        .catch((err) =>
          this.logger.error(
            `Failed to dispatch slash cmd "/${parsed.name}" for bot "${botName}": ${err.message}`,
            err.stack,
          ),
        );
      return; // 一个 slash command 只匹配第一个 bot
    }

    // 在 guild-scope bots 中查找匹配的命令
    for (const bot of guildScopeBots) {
      const matchedCmd = (bot.commands || []).find(
        (cmd) => cmd.name === parsed.name,
      );
      if (!matchedCmd) continue;

      const botUser = bot.userId as unknown as UserDocument;
      const botName = botUser?.name || 'Bot';

      this.logger.log(
        `[SlashCmd] "/${parsed.name}" matched guild bot "${botName}" in channel ${channelId}`,
      );

      this.botUserIds.add(botUser._id.toString());

      // 如果 handler 是 prompt 类型，渲染模板；否则使用位置参数作为内容（去掉 /command 前缀）
      let content = parsed.args['_positional'] || parsed.raw;
      if (
        matchedCmd.handler?.type === 'prompt' &&
        matchedCmd.handler.promptTemplate
      ) {
        content = this.renderPromptTemplate(
          matchedCmd.handler.promptTemplate,
          parsed.args,
          matchedCmd.params || [],
        );
      }

      const memory = await this.memoryService.getMemoryContext(
        bot._id.toString(),
        channelId,
        guildId,
        MEMORY_SCOPE.CHANNEL,
        sender._id.toString(),
        content,
      );

      const context = await this.buildContext(channelId);
      const filteredContext = context.filter(
        (m) => m.messageId !== message._id.toString(),
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
        content,
        rawContent: message.content,
        context: filteredContext,
        executionMode: bot.executionMode || EXECUTION_MODE.WEBHOOK,
        memoryScope: MEMORY_SCOPE.CHANNEL,
        memory,
        trigger: {
          type: BOT_TRIGGER_TYPE.SLASH_COMMAND,
          slashCommand: {
            name: parsed.name,
            args: parsed.args,
            raw: parsed.raw,
          },
        },
      };

      this.agentRunner
        .dispatch(bot, executionCtx)
        .catch((err) =>
          this.logger.error(
            `Failed to dispatch slash cmd "/${parsed.name}" for guild bot "${botName}": ${err.message}`,
            err.stack,
          ),
        );
      return;
    }

    // 没有匹配的 slash command，忽略
    this.logger.debug(
      `[SlashCmd] No bot matched command "/${parsed.name}" in channel ${channelId}`,
    );
  }

  private renderPromptTemplate(
    template: string,
    args: Record<string, string>,
    params: Array<{ name: string }>,
  ): string {
    let result = template;
    // 替换命名参数
    for (const [key, value] of Object.entries(args)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    // 替换按定义顺序的位置参数
    params.forEach((param, idx) => {
      let positionalValue: string | undefined;
      if (idx === params.length - 1) {
        // 最后一个参数收集从当前索引开始的所有剩余位置参数
        const remaining: string[] = [];
        for (let i = idx; ; i++) {
          if (args[`_${i}`] !== undefined) {
            remaining.push(args[`_${i}`]);
          } else {
            break;
          }
        }
        positionalValue =
          remaining.length > 0 ? remaining.join(' ') : undefined;
      } else {
        positionalValue = args[`_${idx}`];
      }
      if (positionalValue) {
        result = result.replace(
          new RegExp(`\\{${param.name}\\}`, 'g'),
          positionalValue,
        );
      }
    });
    return result;
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
    // 先去除标准 mention 格式 <@userId>
    let cleaned = content.replace(MENTION_PATTERN, '');
    // 再去除 @Name 格式（向后兼容）
    const escaped = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`@${escaped}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
    return cleaned.trim();
  }

  // 从消息内容中解析标准 mention: <@userId> 格式
  private parseMentionIds(content: string): Set<string> {
    const ids = new Set<string>();
    let match: RegExpExecArray | null;
    const pattern = new RegExp(MENTION_PATTERN.source, 'gi');
    while ((match = pattern.exec(content)) !== null) {
      ids.add(match[1]);
    }
    return ids;
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
        authorId: sender?._id?.toString(),
        messageId: msg._id.toString(),
        timestamp: msg.createdAt?.toISOString() || '',
      };
    });
  }
}
