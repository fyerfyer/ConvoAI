import { BaseTemplate } from './base-template';
import {
  BotExecutionContext,
  ReminderTemplateConfig,
  TEMPLATE_ID,
} from '@discord-platform/shared';

interface Reminder {
  id: string;
  userId: string;
  userName: string;
  botUserId: string;
  channelId: string;
  message: string;
  triggerAt: number; // timestamp ms
  timer: ReturnType<typeof setTimeout>;
}

export class ReminderTemplate extends BaseTemplate {
  readonly id = TEMPLATE_ID.REMINDER;
  readonly name = '⏰ Reminder Bot';
  readonly description = 'Set timed reminders, supports flexible time formats';
  readonly icon = '⏰';
  readonly category = 'utility' as const;

  // userId -> Reminder[]
  private reminders = new Map<string, Reminder[]>();
  private reminderCounter = 0;

  public onReminderFire?: (
    botUserId: string,
    channelId: string,
    content: string,
  ) => Promise<void>;

  async execute(
    ctx: BotExecutionContext,
    config: Record<string, unknown>,
  ): Promise<string | null> {
    const cfg = (config as unknown as ReminderTemplateConfig) || {};
    const { command, args } = this.parseCommand(ctx.content);

    switch (command) {
      case 'remind':
      case 'set':
      case 'add':
        return this.setReminder(ctx, args, cfg);
      case 'list':
      case 'reminders':
        return this.listReminders(ctx);
      case 'cancel':
      case 'remove':
      case 'delete':
        return this.cancelReminder(ctx, args);
      case 'help':
        return this.help();
      default:
        if (ctx.content.trim()) {
          return this.setReminder(ctx, [ctx.content.trim()], cfg);
        }
        return this.help();
    }
  }

  private setReminder(
    ctx: BotExecutionContext,
    args: string[],
    cfg: ReminderTemplateConfig,
  ): string {
    if (args.length === 0) {
      return '❌ Format: `@Bot remind <time> <message>`\nExample: `@Bot remind 30m meeting`';
    }

    const timeStr = args[0];
    const durationMs = this.parseTimeString(timeStr);

    if (durationMs === null) {
      return '❌ Could not parse time. Supported formats:\n`30s` / `5m` / `2h` / `1d`\nExample: `@Bot remind 30m remember to drink water`';
    }

    const maxDuration = (cfg.maxDuration || 86400) * 1000;
    if (durationMs > maxDuration) {
      return `❌ Maximum reminder time: ${this.formatDuration(maxDuration)}`;
    }

    const maxPerUser = cfg.maxRemindersPerUser || 10;
    const userReminders = this.reminders.get(ctx.author.id) || [];
    if (userReminders.length >= maxPerUser) {
      return `❌ Maximum ${maxPerUser} active reminders per user. Use \`@Bot list\` to view or \`@Bot cancel <ID>\` to cancel`;
    }

    const message = args.slice(1).join(' ') || "⏰ Time's up!";
    const reminderId = `r-${++this.reminderCounter}`;
    const triggerAt = Date.now() + durationMs;

    const timer = setTimeout(() => {
      this.fireReminder(
        ctx.botUserId,
        ctx.channelId,
        ctx.author.name,
        reminderId,
        message,
      );
    }, durationMs);

    const reminder: Reminder = {
      id: reminderId,
      userId: ctx.author.id,
      userName: ctx.author.name,
      botUserId: ctx.botUserId,
      channelId: ctx.channelId,
      message,
      triggerAt,
      timer,
    };

    if (!this.reminders.has(ctx.author.id)) {
      this.reminders.set(ctx.author.id, []);
    }
    this.reminders.get(ctx.author.id)?.push(reminder);

    const when = this.formatDuration(durationMs);
    return `⏰ Reminder set! (ID: \`${reminderId}\`)\nI'll remind you in **${when}**: ${message}`;
  }

  private fireReminder(
    botUserId: string,
    channelId: string,
    userName: string,
    reminderId: string,
    message: string,
  ): void {
    for (const [userId, reminders] of this.reminders) {
      const idx = reminders.findIndex((r) => r.id === reminderId);
      if (idx !== -1) {
        reminders.splice(idx, 1);
        if (reminders.length === 0) this.reminders.delete(userId);
        break;
      }
    }

    const content = `⏰ **Reminder for @${userName}**: ${message}`;

    if (this.onReminderFire) {
      this.onReminderFire(botUserId, channelId, content).catch(() => {
        /* Silent handling */
      });
    }
  }

  private listReminders(ctx: BotExecutionContext): string {
    const userReminders = this.reminders.get(ctx.author.id);
    if (!userReminders || userReminders.length === 0) {
      return '⏰ You have no active reminders';
    }

    const list = userReminders
      .map((r) => {
        const remaining = Math.max(0, r.triggerAt - Date.now());
        return `• \`${r.id}\` — in ${this.formatDuration(remaining)} — ${r.message}`;
      })
      .join('\n');

    return `⏰ **Your Reminders**\n\n${list}`;
  }

  private cancelReminder(ctx: BotExecutionContext, args: string[]): string {
    const reminderId = args[0];
    if (!reminderId) {
      return '❌ Format: `@Bot cancel <reminderID>`';
    }

    const userReminders = this.reminders.get(ctx.author.id);
    if (!userReminders) return '❌ Could not find that reminder';

    const idx = userReminders.findIndex((r) => r.id === reminderId);
    if (idx === -1)
      return "❌ Could not find that reminder, or it doesn't belong to you";

    clearTimeout(userReminders[idx].timer);
    const removed = userReminders.splice(idx, 1)[0];
    if (userReminders.length === 0) this.reminders.delete(ctx.author.id);

    return `✅ Cancelled reminder \`${removed.id}\`: ${removed.message}`;
  }

  private parseTimeString(str: string): number | null {
    const match = str.match(
      /^(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|hour|d|day)s?$/i,
    );
    if (!match) return null;

    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers: Record<string, number> = {
      s: 1000,
      sec: 1000,
      m: 60_000,
      min: 60_000,
      h: 3_600_000,
      hr: 3_600_000,
      hour: 3_600_000,
      d: 86_400_000,
      day: 86_400_000,
    };

    const mult = multipliers[unit];
    if (!mult) return null;

    return Math.round(value * mult);
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return m > 0 ? `${h} hours ${m} minutes` : `${h} hours`;
    }
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    return h > 0 ? `${d} days ${h} hours` : `${d} days`;
  }

  private help(): string {
    return [
      '**⏰ Reminder Bot Commands**',
      '`@Bot remind <time> <message>` — Set a reminder',
      '  Time formats: `30s` / `5m` / `2h` / `1d`',
      '`@Bot list` — View your reminders',
      '`@Bot cancel <ID>` — Cancel a reminder',
      '`@Bot help` — Show this help',
      '',
      'Example: `@Bot remind 30m remember to drink water`',
    ].join('\n');
  }
}
