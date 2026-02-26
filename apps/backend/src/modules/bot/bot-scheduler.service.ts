import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
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
  EXECUTION_MODE,
  MEMORY_SCOPE,
  SCHEDULE_ACTION_TYPE,
  BotExecutionContext,
} from '@discord-platform/shared';

@Injectable()
export class BotSchedulerService implements OnModuleInit, OnModuleDestroy {
  // 格式: `bot-schedule:${botId}:${scheduleId}`
  private readonly managedJobs = new Set<string>();

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    @InjectModel(Bot.name) private readonly botModel: BotModel,
    private readonly chatService: ChatService,
    private readonly agentRunner: AgentRunner,
    private readonly memoryService: MemoryService,
    private readonly logger: AppLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    // 延迟加载，等其他模块初始化完成
    setTimeout(() => this.loadAllSchedules(), 3000);
  }

  onModuleDestroy(): void {
    this.clearAllJobs();
  }

  async loadAllSchedules(): Promise<void> {
    try {
      const bots = await this.botModel
        .find({
          status: BOT_STATUS.ACTIVE,
          'schedules.0': { $exists: true },
        })
        .select('+llmConfig.apiKey')
        .populate('userId', 'name avatar isBot')
        .exec();

      let jobCount = 0;
      for (const bot of bots) {
        for (const schedule of bot.schedules || []) {
          if (schedule.enabled) {
            this.registerCronJob(bot, schedule);
            jobCount++;
          }
        }
      }

      this.logger.log(
        `[BotScheduler] Loaded ${jobCount} scheduled jobs from ${bots.length} bots`,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[BotScheduler] Failed to load schedules: ${error.message}`,
        error.stack,
      );
    }
  }

  // 同步定时任务
  async syncBotSchedules(botId: string): Promise<void> {
    // 先清除该 Bot 的所有现有任务
    this.clearBotJobs(botId);

    const bot = await this.botModel
      .findById(botId)
      .select('+llmConfig.apiKey')
      .populate('userId', 'name avatar isBot')
      .exec();

    if (!bot || bot.status !== BOT_STATUS.ACTIVE) {
      this.logger.log(
        `[BotScheduler] syncBotSchedules: bot ${botId} not active or not found, skipping`,
      );
      return;
    }

    const schedules = bot.schedules || [];
    let registeredCount = 0;

    for (const schedule of schedules) {
      if (schedule.enabled) {
        this.registerCronJob(bot, schedule);
        registeredCount++;
      }
    }

    this.logger.log(
      `[BotScheduler] syncBotSchedules: registered ${registeredCount}/${schedules.length} jobs for bot ${botId}`,
    );
  }

  clearBotJobs(botId: string): void {
    const prefix = `bot-schedule:${botId}:`;
    // 先找出要删除的，避免边遍历边删除
    const toDelete = [...this.managedJobs].filter((jobName) =>
      jobName.startsWith(prefix),
    );
    for (const jobName of toDelete) {
      try {
        this.schedulerRegistry.deleteCronJob(jobName);
      } catch {
        // Job may not exist
      }
      this.managedJobs.delete(jobName);
    }
    if (toDelete.length > 0) {
      this.logger.log(
        `[BotScheduler] Cleared ${toDelete.length} jobs for bot ${botId}`,
      );
    }
  }

  private registerCronJob(
    bot: BotDocument,
    schedule: {
      id: string;
      cron: string;
      channelId: string;
      action: {
        type: string;
        prompt?: string;
        command?: string;
        message?: string;
      };
      timezone?: string;
      description?: string;
    },
  ): void {
    const jobName = `bot-schedule:${bot._id.toString()}:${schedule.id}`;

    // 如果已存在则先移除
    if (this.managedJobs.has(jobName)) {
      try {
        this.schedulerRegistry.deleteCronJob(jobName);
      } catch {
        // ignore
      }
      this.managedJobs.delete(jobName);
    }

    try {
      const job = new CronJob(
        schedule.cron,
        () => {
          this.executeScheduledTask(bot._id.toString(), schedule).catch(
            (err) => {
              const error = err instanceof Error ? err : new Error(String(err));
              this.logger.error(
                `[BotScheduler] Job ${jobName} execution failed: ${error.message}`,
                error.stack,
              );
            },
          );
        },
        null,
        true,
        schedule.timezone || 'UTC',
      );

      this.schedulerRegistry.addCronJob(jobName, job);
      this.managedJobs.add(jobName);

      this.logger.log(
        `[BotScheduler] Registered job ${jobName} (cron: ${schedule.cron}, timezone: ${schedule.timezone || 'UTC'})`,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[BotScheduler] Failed to register job ${jobName}: ${error.message}`,
        error.stack,
      );
    }
  }

  private async executeScheduledTask(
    botId: string,
    schedule: {
      id: string;
      cron: string;
      channelId: string;
      action: {
        type: string;
        prompt?: string;
        command?: string;
        message?: string;
      };
      description?: string;
    },
  ): Promise<void> {
    // 重新加载 Bot（确保最新状态）
    const bot = await this.botModel
      .findOne({
        _id: botId,
        status: BOT_STATUS.ACTIVE,
      })
      .select('+llmConfig.apiKey +webhookSecret')
      .populate('userId', 'name avatar isBot')
      .exec();

    if (!bot) {
      this.logger.warn(
        `[BotScheduler] Bot ${botId} no longer active, skipping scheduled task`,
      );
      return;
    }

    const botUser = bot.userId as unknown as UserDocument;
    const botUserId = botUser?._id
      ? botUser._id.toString()
      : String(bot.userId);
    const botName = botUser?.name || 'Bot';
    const channelId = schedule.channelId;
    const guildId = String(bot.guildId);

    this.logger.log(
      `[BotScheduler] Executing scheduled task for bot "${botName}" (schedule: ${schedule.id}) in channel ${channelId}`,
    );

    // 静态消息：直接发送，不经过 AgentRunner
    if (schedule.action.type === SCHEDULE_ACTION_TYPE.STATIC_MESSAGE) {
      const message = schedule.action.message || '(No message configured)';
      await this.chatService.createMessage(botUserId, {
        channelId,
        content: message,
      });
      return;
    }

    // Prompt / Template Command：构建执行上下文，走 AgentRunner
    const content =
      schedule.action.type === SCHEDULE_ACTION_TYPE.PROMPT
        ? schedule.action.prompt || ''
        : schedule.action.command || '';

    // 获取记忆上下文
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
      messageId: '', // 定时任务没有触发消息
      author: {
        id: 'system',
        name: 'Scheduler',
        avatar: null,
      },
      content,
      rawContent: content,
      context: memory?.recentMessages || [],
      executionMode: bot.executionMode || EXECUTION_MODE.WEBHOOK,
      memoryScope: MEMORY_SCOPE.CHANNEL,
      memory,
      trigger: {
        type: BOT_TRIGGER_TYPE.SCHEDULED,
        schedule: {
          scheduleId: schedule.id,
          cron: schedule.cron,
        },
      },
    };

    await this.agentRunner.dispatch(bot, executionCtx);
  }

  private clearAllJobs(): void {
    for (const jobName of this.managedJobs) {
      try {
        this.schedulerRegistry.deleteCronJob(jobName);
      } catch {
        // ignore
      }
    }
    this.managedJobs.clear();
  }
}
