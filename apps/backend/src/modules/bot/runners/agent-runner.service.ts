import { Injectable } from '@nestjs/common';

import { BotDocument } from '../schemas/bot.schema';
import { WebhookRunner } from './webhook-runner.service';
import { BuiltinRunner } from './builtin-runner.service';
import { LlmRunner } from './llm-runner.service';
import { BotStreamProducer } from '../bot-stream.producer';

import { AppLogger } from '../../../common/configs/logger/logger.service';

import {
  BotExecutionContext,
  BotStreamStartPayload,
  EXECUTION_MODE,
} from '@discord-platform/shared';
import { randomBytes } from 'crypto';

// 统一执行入口，根据 Bot 配置分发到不同的 Runner
@Injectable()
export class AgentRunner {
  constructor(
    private readonly webhookRunner: WebhookRunner,
    private readonly builtinRunner: BuiltinRunner,
    private readonly llmRunner: LlmRunner,
    private readonly botStreamProducer: BotStreamProducer,
    private readonly logger: AppLogger,
  ) {}

  async dispatch(bot: BotDocument, ctx: BotExecutionContext): Promise<void> {
    const mode = bot.executionMode || EXECUTION_MODE.WEBHOOK;

    this.logger.log(
      `[AgentRunner] Dispatching bot ${ctx.botId} (mode: ${mode}) in channel ${ctx.channelId}`,
    );

    // 对 MANAGED_LLM 模式发送 "thinking" 信号（立即返回前端）
    if (mode === EXECUTION_MODE.MANAGED_LLM) {
      const streamId = randomBytes(8).toString('hex');
      const startPayload: BotStreamStartPayload = {
        botId: ctx.botId,
        channelId: ctx.channelId,
        streamId,
      };
      await this.botStreamProducer.emitStreamStart(startPayload);
    }

    // 异步执行，不阻塞调用方
    this.executeRunner(bot, ctx, mode).catch((err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[AgentRunner] Runner execution failed for bot ${ctx.botId}: ${error.message}`,
        error.stack,
      );
    });
  }

  private async executeRunner(
    bot: BotDocument,
    ctx: BotExecutionContext,
    mode: string,
  ): Promise<void> {
    switch (mode) {
      case EXECUTION_MODE.WEBHOOK:
        return this.webhookRunner.execute(bot, ctx);

      case EXECUTION_MODE.BUILTIN:
        return this.builtinRunner.execute(bot, ctx);

      case EXECUTION_MODE.MANAGED_LLM:
        return this.llmRunner.execute(bot, ctx);

      default:
        this.logger.warn(
          `[AgentRunner] Unknown execution mode "${mode}" for bot ${ctx.botId}, falling back to webhook`,
        );
        return this.webhookRunner.execute(bot, ctx);
    }
  }
}
