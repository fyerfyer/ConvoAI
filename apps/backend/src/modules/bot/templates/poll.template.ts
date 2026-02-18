import { BaseTemplate } from './base-template';
import {
  BotExecutionContext,
  PollTemplateConfig,
  TEMPLATE_ID,
} from '@discord-platform/shared';

interface PollData {
  question: string;
  options: string[];
  votes: Map<number, number>; // optionIndex -> count
  voters: Map<string, number>; // voterId -> optionIndex (prevents duplicate voting)
  createdAt: number;
  duration: number; // seconds
  channelId: string;
  creatorId: string;
}

export class PollTemplate extends BaseTemplate {
  readonly id = TEMPLATE_ID.POLL;
  readonly name = '📊 Poll Bot';
  readonly description =
    'Create polls, vote counting, supports multiple options and timing';
  readonly icon = '📊';
  readonly category = 'utility' as const;

  private polls = new Map<string, Map<string, PollData>>();
  private pollCounter = 0;

  async execute(
    ctx: BotExecutionContext,
    config: Record<string, unknown>,
  ): Promise<string | null> {
    const cfg = config as unknown as PollTemplateConfig;
    const { command, args } = this.parseCommand(ctx.content);

    switch (command) {
      case 'create':
      case 'poll':
        return this.createPoll(ctx, args, cfg);
      case 'vote':
        return this.vote(ctx, args);
      case 'results':
      case 'result':
        return this.results(ctx, args);
      case 'end':
      case 'close':
        return this.endPoll(ctx, args);
      case 'list':
        return this.listPolls(ctx);
      case 'help':
        return this.help();
      default:
        return this.help();
    }
  }

  private createPoll(
    ctx: BotExecutionContext,
    args: string[],
    cfg: PollTemplateConfig,
  ): string {
    if (args.length < 3) {
      return '❌ Format: `@Bot create "Question" "Option1" "Option2" ...`\nAt least one question and two options are required';
    }

    const maxOptions = cfg.maxOptions || 6;
    const question = args[0];
    const options = args.slice(1, maxOptions + 1);

    if (options.length < 2) {
      return '❌ At least 2 options are required';
    }

    const pollId = `poll-${++this.pollCounter}`;
    const pollData: PollData = {
      question,
      options,
      votes: new Map(),
      voters: new Map(),
      createdAt: Date.now(),
      duration: cfg.defaultDuration || 3600,
      channelId: ctx.channelId,
      creatorId: ctx.author.id,
    };

    options.forEach((_, i) => pollData.votes.set(i, 0));

    if (!this.polls.has(ctx.channelId)) {
      this.polls.set(ctx.channelId, new Map());
    }
    this.polls.get(ctx.channelId)?.set(pollId, pollData);

    const optionList = options
      .map((opt, i) => `  **${i + 1}.** ${opt}`)
      .join('\n');

    return [
      `📊 **Poll Created!** (ID: \`${pollId}\`)`,
      '',
      `**${question}**`,
      '',
      optionList,
      '',
      `Vote: \`@Bot vote ${pollId} <number>\``,
      `View results: \`@Bot results ${pollId}\``,
      `End poll: \`@Bot end ${pollId}\``,
    ].join('\n');
  }

  private vote(ctx: BotExecutionContext, args: string[]): string {
    if (args.length < 2) {
      return '❌ Format: `@Bot vote <pollID> <option number>`';
    }

    const pollId = args[0];
    const optionIndex = parseInt(args[1], 10) - 1;

    const channelPolls = this.polls.get(ctx.channelId);
    const poll = channelPolls?.get(pollId);

    if (!poll) {
      return `❌ Could not find poll \`${pollId}\`. Use \`@Bot list\` to see active polls`;
    }

    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      return `❌ Invalid option. Please choose 1-${poll.options.length}`;
    }

    const previousVote = poll.voters.get(ctx.author.id);
    if (previousVote !== undefined) {
      poll.votes.set(previousVote, (poll.votes.get(previousVote) || 1) - 1);
    }

    poll.voters.set(ctx.author.id, optionIndex);
    poll.votes.set(optionIndex, (poll.votes.get(optionIndex) || 0) + 1);

    const action = previousVote !== undefined ? 'changed vote to' : 'voted for';
    return `✅ **${ctx.author.name}** ${action}: **${poll.options[optionIndex]}**`;
  }

  private results(ctx: BotExecutionContext, args: string[]): string {
    const pollId = args[0];
    const channelPolls = this.polls.get(ctx.channelId);

    if (!pollId) {
      if (!channelPolls || channelPolls.size === 0) {
        return '📊 No active polls in this channel';
      }
      const lastPollId = Array.from(channelPolls.keys()).pop();
      if (!lastPollId) {
        return '📊 No active polls in this channel';
      }

      const lastPoll = channelPolls.get(lastPollId);
      if (!lastPoll) {
        return '📊 No active polls in this channel';
      }
      return this.formatResults(lastPollId, lastPoll);
    }

    const poll = channelPolls?.get(pollId);
    if (!poll) return `❌ Could not find poll \`${pollId}\``;

    return this.formatResults(pollId, poll);
  }

  private formatResults(pollId: string, poll: PollData): string {
    const totalVotes = Array.from(poll.votes.values()).reduce(
      (sum, v) => sum + v,
      0,
    );

    const bars = poll.options
      .map((opt, i) => {
        const count = poll.votes.get(i) || 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const bar =
          '█'.repeat(Math.round(pct / 5)) +
          '░'.repeat(20 - Math.round(pct / 5));
        return `  **${i + 1}.** ${opt}\n  ${bar} ${pct}% (${count} votes)`;
      })
      .join('\n');

    return [
      `📊 **Poll Results** (\`${pollId}\`)`,
      '',
      `**${poll.question}**`,
      '',
      bars,
      '',
      `Total votes: **${totalVotes}**`,
    ].join('\n');
  }

  private endPoll(ctx: BotExecutionContext, args: string[]): string {
    const pollId = args[0];
    if (!pollId) return '❌ Format: `@Bot end <pollID>`';

    const channelPolls = this.polls.get(ctx.channelId);
    const poll = channelPolls?.get(pollId);
    if (!poll) return `❌ Could not find poll \`${pollId}\``;

    if (poll.creatorId !== ctx.author.id) {
      return '❌ Only the poll creator can end the poll';
    }

    const results = this.formatResults(pollId, poll);
    channelPolls?.delete(pollId);

    return `🏁 **Poll Ended!**\n\n${results}`;
  }

  private listPolls(ctx: BotExecutionContext): string {
    const channelPolls = this.polls.get(ctx.channelId);
    if (!channelPolls || channelPolls.size === 0) {
      return '📊 No active polls in this channel';
    }

    const list = Array.from(channelPolls.entries())
      .map(([id, poll]) => `• \`${id}\` — ${poll.question}`)
      .join('\n');

    return `📊 **Active Polls List**\n\n${list}`;
  }

  private help(): string {
    return [
      '**📊 Poll Bot Commands**',
      '`@Bot create "Question" "Option1" "Option2" ...` — Create a poll',
      '`@Bot vote <ID> <number>` — Vote',
      '`@Bot results [ID]` — View results',
      '`@Bot end <ID>` — End a poll',
      '`@Bot list` — List active polls',
      '`@Bot help` — Show this help',
    ].join('\n');
  }
}
