import { Injectable } from '@nestjs/common';

import { BotDocument } from '../schemas/bot.schema';
import { TemplateRegistry } from '../templates/template-registry';
import { ReminderTemplate } from '../templates/reminder.template';
import { ChatService } from '../../chat/chat.service';
import { UserDocument } from '../../user/schemas/user.schema';
import { BotExecutionContext } from '@discord-platform/shared';
import { AppLogger } from '../../../common/configs/logger/logger.service';

// 内置模板 Runner
@Injectable()
export class BuiltinRunner {
  constructor(
    private readonly templateRegistry: TemplateRegistry,
    private readonly chatService: ChatService,
    private readonly logger: AppLogger,
  ) {
    // 为 ReminderTemplate 注入消息发送回调
    this.initReminderCallbacks();
  }

  async execute(bot: BotDocument, ctx: BotExecutionContext): Promise<void> {
    const templateId = bot.templateId;
    if (!templateId) {
      this.logger.warn(`Bot ${ctx.botId} has no templateId configured`);
      return;
    }

    const template = this.templateRegistry.get(templateId);
    if (!template) {
      this.logger.warn(`Template "${templateId}" not found in registry`);
      await this.sendBotMessage(
        bot,
        ctx.channelId,
        `⚠️ Template "${templateId}" not found. Please check the bot configuration.`,
      );
      return;
    }

    try {
      const config = bot.templateConfig || {};
      const response = await template.execute(ctx, config);

      if (response) {
        await this.sendBotMessage(bot, ctx.channelId, response);
      }
      // response === null 表示模板选择不回复（例如自动回复 Bot 没有匹配到规则）
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[BuiltinRunner] Template "${templateId}" execution error: ${error.message}`,
        error.stack,
      );
      await this.sendBotMessage(
        bot,
        ctx.channelId,
        `⚠️ Bot execution error. Please try again later.`,
      );
    }
  }

  private async sendBotMessage(
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

  // 初始化需要异步调用的模板
  private initReminderCallbacks(): void {
    const reminderTemplate = this.templateRegistry.get('reminder') as
      | ReminderTemplate
      | undefined;

    if (reminderTemplate) {
      reminderTemplate.onReminderFire = async (
        botUserId: string,
        channelId: string,
        content: string,
      ) => {
        try {
          await this.chatService.createMessage(botUserId, {
            channelId,
            content,
          });
          this.logger.log(
            `[ReminderCallback] Sent reminder in channel ${channelId}`,
          );
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.logger.error(
            `[ReminderCallback] Failed to send reminder: ${error.message}`,
            error.stack,
          );
        }
      };
    }
  }
}
