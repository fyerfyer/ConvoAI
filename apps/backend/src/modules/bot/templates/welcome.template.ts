import { BaseTemplate } from './base-template';
import {
  BotExecutionContext,
  WelcomeTemplateConfig,
  TEMPLATE_ID,
} from '@discord-platform/shared';

export class WelcomeTemplate extends BaseTemplate {
  readonly id = TEMPLATE_ID.WELCOME;
  readonly name = '🎉 Welcome Bot';
  readonly description =
    'Automatically send welcome messages, supports custom content and member count display';
  readonly icon = '🎉';
  readonly category = 'utility' as const;

  async execute(
    ctx: BotExecutionContext,
    config: Record<string, unknown>,
  ): Promise<string | null> {
    const cfg = config as unknown as WelcomeTemplateConfig;
    const { command } = this.parseCommand(ctx.content);

    switch (command) {
      case 'greet':
      case 'welcome':
      case 'hi':
      case 'hello':
      case '':
        return this.greet(ctx, cfg);
      case 'help':
        return this.help();
      default:
        return this.greet(ctx, cfg);
    }
  }

  private greet(ctx: BotExecutionContext, cfg: WelcomeTemplateConfig): string {
    const msg =
      cfg.welcomeMessage || `Welcome to the server, **${ctx.author.name}**! 🎉`;

    return msg
      .replace(/{user}/g, ctx.author.name)
      .replace(/{guild}/g, ctx.guildId)
      .replace(/{channel}/g, ctx.channelId);
  }

  private help(): string {
    return [
      '**🎉 Welcome Bot Commands**',
      '`@Bot` / `@Bot hello` — Send welcome message',
      '`@Bot help` — Show this help',
    ].join('\n');
  }
}
