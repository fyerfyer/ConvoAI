import { Injectable } from '@nestjs/common';

import { BotDocument } from '../schemas/bot.schema';
import { WebhookRunner } from './webhook-runner.service';
import { BuiltinRunner } from './builtin-runner.service';
import { LlmRunner } from './llm-runner.service';

import { AppLogger } from '../../../common/configs/logger/logger.service';

import { BotExecutionContext, EXECUTION_MODE } from '@discord-platform/shared';

// 统一执行入口，根据 Bot 配置分发到不同的 Runner
@Injectable()
export class AgentRunner {
  constructor(
    private readonly webhookRunner: WebhookRunner,
    private readonly builtinRunner: BuiltinRunner,
    private readonly llmRunner: LlmRunner,
    private readonly logger: AppLogger,
  ) {}

  async dispatch(bot: BotDocument, ctx: BotExecutionContext): Promise<void> {
    const mode = bot.executionMode || EXECUTION_MODE.WEBHOOK;

    this.logger.log(
      `[AgentRunner] Dispatching bot ${ctx.botId} (mode: ${mode}) in channel ${ctx.channelId}`,
    );

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
