import { BaseTemplate } from './base-template';
import {
  BotExecutionContext,
  AutoResponderTemplateConfig,
  AutoResponderRule,
  TEMPLATE_ID,
} from '@discord-platform/shared';

export class AutoResponderTemplate extends BaseTemplate {
  readonly id = TEMPLATE_ID.AUTO_RESPONDER;
  readonly name = '🔔 Auto-responder Bot';
  readonly description =
    'Keyword-based auto-responder, supports exact matching and regular expressions';
  readonly icon = '🔔';
  readonly category = 'utility' as const;

  async execute(
    ctx: BotExecutionContext,
    config: Record<string, unknown>,
  ): Promise<string | null> {
    const cfg = config as unknown as AutoResponderTemplateConfig;
    const { command, args } = this.parseCommand(ctx.content);

    switch (command) {
      case 'rules':
      case 'list':
        return this.listRules(cfg);
      case 'test':
        return this.testRules(cfg, args.join(' '));
      case 'help':
        return this.help();
    }

    if (!cfg.rules || cfg.rules.length === 0) {
      return this.help();
    }

    const matchedResponse = this.matchRules(ctx.rawContent, cfg.rules);
    if (matchedResponse) {
      return matchedResponse
        .replace(/{user}/g, ctx.author.name)
        .replace(/{content}/g, ctx.content);
    }

    return null;
  }

  private matchRules(
    content: string,
    rules: AutoResponderRule[],
  ): string | null {
    for (const rule of rules) {
      if (this.matchSingleRule(content, rule)) {
        return rule.response;
      }
    }
    return null;
  }

  private matchSingleRule(content: string, rule: AutoResponderRule): boolean {
    const testContent = rule.caseSensitive ? content : content.toLowerCase();

    if (rule.isRegex) {
      try {
        const flags = rule.caseSensitive ? '' : 'i';
        const regex = new RegExp(rule.trigger, flags);
        return regex.test(content);
      } catch {
        return false;
      }
    }

    const trigger = rule.caseSensitive
      ? rule.trigger
      : rule.trigger.toLowerCase();
    return testContent.includes(trigger);
  }

  private listRules(cfg: AutoResponderTemplateConfig): string {
    if (!cfg.rules || cfg.rules.length === 0) {
      return '🔔 No rules are currently configured. Please add rules in the Bot settings.';
    }

    const list = cfg.rules
      .map((rule, i) => {
        const type = rule.isRegex ? 'Regex' : 'Keyword';
        const cs = rule.caseSensitive ? 'Case Sensitive' : '';
        return `**${i + 1}.** [${type}${cs ? ' ' + cs : ''}] \`${rule.trigger}\` → ${rule.response.substring(0, 50)}${rule.response.length > 50 ? '...' : ''}`;
      })
      .join('\n');

    return `🔔 **Auto-responder Rules** (Total ${cfg.rules.length})\n\n${list}`;
  }

  private testRules(
    cfg: AutoResponderTemplateConfig,
    testContent: string,
  ): string {
    if (!testContent) {
      return '❌ Format: `@Bot test <test content>`';
    }

    if (!cfg.rules || cfg.rules.length === 0) {
      return '❌ No rules configured';
    }

    const matched = this.matchRules(testContent, cfg.rules);
    if (matched) {
      return `✅ Match successful! Response: ${matched}`;
    }

    return `❌ No rules matched`;
  }

  private help(): string {
    return [
      '**🔔 Auto-responder Bot**',
      '',
      'This Bot automatically responds to messages based on configured rules.',
      'Rules are configured in the Bot settings page, supporting keyword and regex matching.',
      '',
      '**Management Commands:**',
      '`@Bot rules` — View the current list of rules',
      '`@Bot test <content>` — Test rule matching',
      '`@Bot help` — Display this help message',
      '',
      '**Template Variables:**',
      "`{user}` — Message sender's name",
      '`{content}` — Message content',
    ].join('\n');
  }
}
