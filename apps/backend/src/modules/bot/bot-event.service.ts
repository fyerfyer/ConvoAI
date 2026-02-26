import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Bot, BotDocument, BotModel } from './schemas/bot.schema';
import { UserDocument } from '../user/schemas/user.schema';
import { ChatService } from '../chat/chat.service';
import { AgentRunner } from './runners/agent-runner.service';
import { MemoryService } from '../memory/services/memory.service';
import { AppLogger } from '../../common/configs/logger/logger.service';
import {
  BOT_STATUS,
  BOT_TRIGGER_TYPE,
  BOT_EVENT_SUB_TYPE,
  EVENT_ACTION_TYPE,
  EXECUTION_MODE,
  MEMORY_SCOPE,
  MEMBER_EVENT,
  MemberEventPayload,
  BotExecutionContext,
  BotEventSubTypeValue,
} from '@discord-platform/shared';

@Injectable()
export class BotEventService {
  constructor(
    @InjectModel(Bot.name) private readonly botModel: BotModel,
    private readonly chatService: ChatService,
    private readonly agentRunner: AgentRunner,
    private readonly memoryService: MemoryService,
    private readonly logger: AppLogger,
  ) {}

  @OnEvent(MEMBER_EVENT.MEMBER_JOINED)
  async handleMemberJoin(payload: MemberEventPayload): Promise<void> {
    await this.handleMemberEvent(BOT_EVENT_SUB_TYPE.MEMBER_JOIN, payload);
  }

  @OnEvent(MEMBER_EVENT.MEMBER_LEFT)
  async handleMemberLeave(payload: MemberEventPayload): Promise<void> {
    await this.handleMemberEvent(BOT_EVENT_SUB_TYPE.MEMBER_LEAVE, payload);
  }

  private async handleMemberEvent(
    eventType: string,
    payload: MemberEventPayload,
  ): Promise<void> {
    try {
      // 查找该 Guild 中订阅了此事件的活跃 Bot
      const bots = await this.botModel
        .find({
          guildId: payload.guildId,
          status: BOT_STATUS.ACTIVE,
          'eventSubscriptions.eventType': eventType,
          'eventSubscriptions.enabled': true,
        })
        .select('+llmConfig.apiKey +webhookSecret')
        .populate('userId', 'name avatar isBot')
        .exec();

      if (bots.length === 0) return;

      this.logger.log(
        `[BotEvent] ${eventType} event in guild ${payload.guildId}: ${bots.length} bot(s) subscribed`,
      );

      for (const bot of bots) {
        const subscriptions = (bot.eventSubscriptions || []).filter(
          (sub) => sub.eventType === eventType && sub.enabled,
        );

        for (const sub of subscriptions) {
          this.processEventSubscription(bot, sub, payload, eventType).catch(
            (err) => {
              const error = err instanceof Error ? err : new Error(String(err));
              this.logger.error(
                `[BotEvent] Failed to process ${eventType} for bot ${bot._id}: ${error.message}`,
                error.stack,
              );
            },
          );
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[BotEvent] Error handling ${eventType}: ${error.message}`,
        error.stack,
      );
    }
  }

  private async processEventSubscription(
    bot: BotDocument,
    sub: {
      eventType: string;
      channelId: string;
      action: { type: string; prompt?: string; message?: string };
    },
    payload: MemberEventPayload,
    eventType: string,
  ): Promise<void> {
    const botUser = bot.userId as unknown as UserDocument;
    const botUserId = botUser?._id
      ? botUser._id.toString()
      : String(bot.userId);
    const botName = botUser?.name || 'Bot';
    const channelId = sub.channelId;
    const guildId = payload.guildId;

    // 变量替换
    const replaceVars = (text: string): string =>
      text
        .replace(/\{user\}/g, payload.userName)
        .replace(/\{userId\}/g, payload.userId)
        .replace(/\{guild\}/g, guildId);

    // 静态消息：直接发送
    if (sub.action.type === EVENT_ACTION_TYPE.STATIC_MESSAGE) {
      const message = replaceVars(
        sub.action.message ||
          `${payload.userName} ${eventType === BOT_EVENT_SUB_TYPE.MEMBER_JOIN ? 'joined' : 'left'} the server`,
      );
      await this.chatService.createMessage(botUserId, {
        channelId,
        content: message,
      });
      return;
    }

    // Prompt 类型：通过 AgentRunner 处理
    if (sub.action.type === EVENT_ACTION_TYPE.PROMPT) {
      const prompt = replaceVars(
        sub.action.prompt ||
          `User ${payload.userName} has ${eventType === BOT_EVENT_SUB_TYPE.MEMBER_JOIN ? 'joined' : 'left'} the server. Please respond appropriately.`,
      );

      const memory = await this.memoryService.getMemoryContext(
        bot._id.toString(),
        channelId,
        guildId,
        MEMORY_SCOPE.CHANNEL,
      );

      const executionCtx: BotExecutionContext = {
        botId: bot._id.toString(),
        botUserId,
        botName,
        guildId,
        channelId,
        messageId: '',
        author: {
          id: payload.userId,
          name: payload.userName,
          avatar: payload.userAvatar || null,
        },
        content: prompt,
        rawContent: prompt,
        context: memory?.recentMessages || [],
        executionMode: bot.executionMode || EXECUTION_MODE.WEBHOOK,
        memoryScope: MEMORY_SCOPE.CHANNEL,
        memory,
        trigger: {
          type: BOT_TRIGGER_TYPE.EVENT,
          event: {
            eventType: eventType as BotEventSubTypeValue,
            userId: payload.userId,
            userName: payload.userName,
            userAvatar: payload.userAvatar,
          },
        },
      };

      await this.agentRunner.dispatch(bot, executionCtx);
    }
  }
}
