import { BaseTemplate } from './base-template';
import {
  BotExecutionContext,
  GameTemplateConfig,
  TEMPLATE_ID,
} from '@discord-platform/shared';

interface GuessSession {
  target: number;
  attempts: number;
  maxAttempts: number;
  range: { min: number; max: number };
}

export class GameTemplate extends BaseTemplate {
  readonly id = TEMPLATE_ID.GAME;
  readonly name = '🎮 Game Bot';
  readonly description =
    'Fun mini-games: 8ball fortune-telling, dice roll, guess the number, rock-paper-scissors';
  readonly icon = '🎮';
  readonly category = 'fun' as const;

  private guessSessions = new Map<string, GuessSession>();

  private readonly eightBallResponses = [
    '🎱 It is certain.',
    '🎱 It is decidedly so.',
    '🎱 Without a doubt.',
    '🎱 Yes definitely.',
    '🎱 You may rely on it.',
    '🎱 As I see it, yes.',
    '🎱 Most likely.',
    '🎱 Outlook good.',
    '🎱 Yes.',
    '🎱 Signs point to yes.',
    '🎱 Reply hazy, try again.',
    '🎱 Ask again later.',
    '🎱 Better not tell you now.',
    '🎱 Cannot predict now.',
    '🎱 Concentrate and ask again.',
    "🎱 Don't count on it.",
    '🎱 My reply is no.',
    '🎱 My sources say no.',
    '🎱 Outlook not so good.',
    '🎱 Very doubtful.',
  ];

  private readonly rpsEmoji: Record<string, string> = {
    rock: '🪨',
    paper: '📄',
    scissors: '✂️',
  };

  async execute(
    ctx: BotExecutionContext,
    config: Record<string, unknown>,
  ): Promise<string | null> {
    const cfg = (config as unknown as GameTemplateConfig) || {};
    const enabled = cfg.enabledGames || ['8ball', 'roll', 'guess', 'rps'];
    const { command, args } = this.parseCommand(ctx.content);

    if (
      /^\d+$/.test(ctx.content.trim()) &&
      this.guessSessions.has(ctx.author.id)
    ) {
      return this.processGuess(ctx, parseInt(ctx.content.trim(), 10));
    }

    switch (command) {
      case '8ball':
        return enabled.includes('8ball')
          ? this.eightBall(args.join(' '))
          : '❌ 8ball game is not enabled';
      case 'roll':
      case 'dice':
        return enabled.includes('roll')
          ? this.roll(args[0])
          : '❌ Dice roll game is not enabled';
      case 'guess':
      case 'guessstart':
        return enabled.includes('guess')
          ? this.startGuess(ctx, cfg)
          : '❌ Guess the number game is not enabled';
      case 'rps':
        return enabled.includes('rps')
          ? this.rps(ctx, args[0])
          : '❌ Rock-paper-scissors game is not enabled';
      case 'help':
        return this.help(enabled);
      default:
        return this.help(enabled);
    }
  }

  private eightBall(question: string): string {
    if (!question.trim()) {
      return '❌ Please ask a question! Format: `@Bot 8ball Will I have good luck today?`';
    }
    const idx = Math.floor(Math.random() * this.eightBallResponses.length);
    return `> ${question}\n\n${this.eightBallResponses[idx]}`;
  }

  private roll(notation?: string): string {
    const diceStr = notation || '1d6';
    const match = diceStr.match(/^(\d+)?d(\d+)$/i);

    if (!match) {
      return '❌ Format: `@Bot roll [number]d<sides>` e.g., `2d6`, `1d20`';
    }

    const count = Math.min(parseInt(match[1] || '1', 10), 20);
    const sides = Math.min(parseInt(match[2], 10), 1000);

    if (count < 1 || sides < 2) {
      return '❌ At least 1 die, each with at least 2 sides';
    }

    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * sides) + 1);
    }

    const total = rolls.reduce((s, r) => s + r, 0);
    const detail = rolls.length > 1 ? ` (${rolls.join(' + ')})` : '';

    return `🎲 **${count}d${sides}** → **${total}**${detail}`;
  }

  private startGuess(
    ctx: BotExecutionContext,
    cfg: GameTemplateConfig,
  ): string {
    const range = cfg.guessRange || { min: 1, max: 100 };
    const target =
      Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
    const maxAttempts = Math.ceil(Math.log2(range.max - range.min + 1)) + 2;

    this.guessSessions.set(ctx.author.id, {
      target,
      attempts: 0,
      maxAttempts,
      range,
    });

    return [
      `🔢 **Guess the Number Game Started!**`,
      `I'm thinking of a number between **${range.min}~${range.max}**`,
      `You have **${maxAttempts}** chances. Just send the number directly`,
    ].join('\n');
  }

  private processGuess(ctx: BotExecutionContext, guess: number): string {
    const session = this.guessSessions.get(ctx.author.id);
    if (!session) return '';

    session.attempts++;

    if (guess === session.target) {
      this.guessSessions.delete(ctx.author.id);
      return `🎉 **Congratulations!** You guessed it in **${session.attempts}** tries! The answer was **${session.target}**`;
    }

    if (session.attempts >= session.maxAttempts) {
      this.guessSessions.delete(ctx.author.id);
      return `💀 **Game Over!** You've used all ${session.maxAttempts} chances. The answer was **${session.target}**`;
    }

    const remaining = session.maxAttempts - session.attempts;
    const hint = guess < session.target ? '**Higher** ⬆️' : '**Lower** ⬇️';

    return `${hint} (${remaining} tries left)`;
  }

  private rps(ctx: BotExecutionContext, choice?: string): string {
    if (!choice) {
      return '❌ Format: `@Bot rps <rock|paper|scissors>`';
    }

    const normalized = choice.toLowerCase();
    const mapping: Record<string, string> = {
      rock: 'rock',
      paper: 'paper',
      scissors: 'scissors',
      r: 'rock',
      p: 'paper',
      s: 'scissors',
    };

    const playerChoice = mapping[normalized];
    if (!playerChoice) {
      return '❌ Please choose: rock / paper / scissors';
    }

    const choices = ['rock', 'paper', 'scissors'];
    const botChoice = choices[Math.floor(Math.random() * 3)];

    const playerEmoji = this.rpsEmoji[playerChoice] || playerChoice;
    const botEmoji = this.rpsEmoji[botChoice] || botChoice;

    if (playerChoice === botChoice) {
      return `${playerEmoji} vs ${botEmoji} — **Tie!** 🤝`;
    }

    const wins: Record<string, string> = {
      rock: 'scissors',
      paper: 'rock',
      scissors: 'paper',
    };

    if (wins[playerChoice] === botChoice) {
      return `${playerEmoji} vs ${botEmoji} — **You win!** 🎉`;
    }

    return `${playerEmoji} vs ${botEmoji} — **You lose!** 😔`;
  }

  private help(enabled: string[]): string {
    const lines = ['**🎮 Game Bot Commands**'];
    if (enabled.includes('8ball'))
      lines.push('`@Bot 8ball <question>` — 8-Ball fortune telling');
    if (enabled.includes('roll'))
      lines.push('`@Bot roll [NdM]` — Roll dice (default 1d6)');
    if (enabled.includes('guess'))
      lines.push('`@Bot guess` — Start guess the number game');
    if (enabled.includes('rps'))
      lines.push('`@Bot rps <choice>` — Rock-paper-scissors');
    lines.push('`@Bot help` — Show this help');
    return lines.join('\n');
  }
}
