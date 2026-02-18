import { BotExecutionContext } from '@discord-platform/shared';

// 内置模板抽象基类
// 每个模板实现 execute() 方法，根据上下文和用户配置返回回复内容
export abstract class BaseTemplate {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly icon: string;
  abstract readonly category: 'utility' | 'fun' | 'moderation' | 'ai';

  abstract execute(
    ctx: BotExecutionContext,
    config: Record<string, unknown>,
  ): Promise<string | null>;

  // 解析命令字符串
  // e.g. "poll \"Lunch?\" \"Pizza\" \"Burger\"" → { command: 'poll', args: ['Lunch?', 'Pizza', 'Burger'] }
  protected parseCommand(content: string): {
    command: string;
    args: string[];
    raw: string;
  } {
    const trimmed = content.trim();
    const parts = this.tokenize(trimmed);
    const command = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);
    return { command, args, raw: trimmed };
  }

  // 分词：支持引号包裹的多词参数
  // "create \"My Poll\" option1 option2" → ['create', 'My Poll', 'option1', 'option2']
  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (const char of input) {
      if (!inQuote && (char === '"' || char === "'")) {
        inQuote = true;
        quoteChar = char;
      } else if (inQuote && char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote && char === ' ') {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
    if (current) tokens.push(current);
    return tokens;
  }
}
