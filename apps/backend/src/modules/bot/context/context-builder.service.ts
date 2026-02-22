import { Injectable } from '@nestjs/common';

import { BotExecutionContext, MemoryContext } from '@discord-platform/shared';
import { LlmConfigEmbedded } from '../schemas/bot.schema';
import { AppLogger } from '../../../common/configs/logger/logger.service';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
}
@Injectable()
export class ContextBuilder {
  constructor(private readonly logger: AppLogger) {}

  buildMessages(
    config: LlmConfigEmbedded,
    ctx: BotExecutionContext,
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // 1. System Prompt
    const systemPrompt = this.buildSystemPrompt(config, ctx);
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // 2. Rolling Summary（作为 system 消息注入长期记忆）
    if (ctx.memory?.rollingSummary) {
      messages.push({
        role: 'system',
        content: this.formatRollingSummary(ctx.memory.rollingSummary),
      });
    }

    // 3. Short-term Window（最近的完整消息）
    const recentMessages = this.buildRecentContext(ctx);
    messages.push(...recentMessages);

    // 4. Current User Message
    messages.push({
      role: 'user',
      content: ctx.content,
    });

    this.logger.debug(
      `[ContextBuilder] Built ${messages.length} messages for bot ${ctx.botId} ` +
        `(summary: ${ctx.memory?.rollingSummary ? 'yes' : 'no'}, ` +
        `recent: ${recentMessages.length}, ` +
        `summarized: ${ctx.memory?.summarizedMessageCount ?? 0})`,
    );

    return messages;
  }

  /**
   * 构建增强版 System Prompt
   *
   * 层次结构：
   * 1. Base Identity - Bot 的基本身份和能力描述
   * 2. User Prompt   - 用户/管理员定义的行为指令
   * 3. Tool Guide    - 工具使用指导（有工具时）
   * 4. Context Info   - 环境信息（guild、channel）
   * 5. Behavioral Rules - 行为准则
   */
  private buildSystemPrompt(
    config: LlmConfigEmbedded,
    ctx: BotExecutionContext,
  ): string {
    const sections: string[] = [];

    // ── Base Identity ──
    sections.push(this.buildIdentitySection(ctx));

    // ── User-defined System Prompt ──
    const userPrompt = ctx.overrideSystemPrompt ?? config.systemPrompt;
    if (userPrompt && userPrompt !== 'You are a helpful assistant.') {
      sections.push(`## Your Role & Instructions\n${userPrompt}`);
    }

    // ── Tool Usage Guide ──
    const toolNames = ctx.overrideTools ?? config.tools;
    if (toolNames && toolNames.length > 0) {
      sections.push(this.buildToolGuide(toolNames));
    }

    // ── Context Info ──
    sections.push(this.buildContextInfo(ctx));

    // ── Memory Info ──
    if (ctx.memory && ctx.memory.summarizedMessageCount > 0) {
      sections.push(this.buildMemoryInfo(ctx.memory));
    }

    // ── Behavioral Rules ──
    sections.push(this.buildBehavioralRules());

    return sections.join('\n\n');
  }

  /**
   * 构建 Bot 身份描述
   */
  private buildIdentitySection(ctx: BotExecutionContext): string {
    return (
      `## Identity\n` +
      `You are "${ctx.botName}", an AI assistant in a Discord-like platform.\n` +
      `You are currently active in a guild (server) and responding to messages in a channel.`
    );
  }

  /**
   * 构建工具使用指导
   */
  private buildToolGuide(toolNames: string[]): string {
    const toolDescriptions: Record<string, string> = {
      'web-search':
        'Search the web for current information when users ask about recent events or facts.',
      'code-execution':
        'Evaluate simple math expressions when calculation is needed.',
      'summarize-user':
        "Retrieve and summarize a specific user's recent messages in the channel.",
      'channel-history':
        'Get recent channel message history for conversation context.',
      'guild-info':
        'Get information about the current guild/server (name, members, channels).',
      'member-list':
        'List all members currently in the guild with their display names.',
    };

    const guides = toolNames
      .map(
        (name) =>
          `- **${name}**: ${toolDescriptions[name] || 'Available for use.'}`,
      )
      .join('\n');

    return (
      `## Available Tools\n` +
      `You have access to the following tools. Use them proactively when they would help answer the user's question:\n` +
      `${guides}\n\n` +
      `Guidelines:\n` +
      `- Use tools when the user's question requires information you don't have\n` +
      `- Prefer tools over guessing when factual/real-time information is needed\n` +
      `- You may call multiple tools in sequence if needed\n` +
      `- Always explain what you found from tools in a natural, conversational way`
    );
  }

  /**
   * 构建环境上下文信息
   */
  private buildContextInfo(ctx: BotExecutionContext): string {
    const lines = [
      `## Current Context`,
      `- **Guild ID**: ${ctx.guildId}`,
      `- **Channel ID**: ${ctx.channelId}`,
      `- **Current user**: ${ctx.author.name} (ID: ${ctx.author.id})`,
    ];

    return lines.join('\n');
  }

  /**
   * 构建记忆信息提示
   */
  private buildMemoryInfo(memory: MemoryContext): string {
    return (
      `## Memory\n` +
      `You have long-term memory of this conversation. A summary of ${memory.summarizedMessageCount} earlier messages ` +
      `is provided below. Use this context to maintain continuity, recall user preferences, ` +
      `and reference past discussions when relevant. Do not explicitly mention that you have a "summary" — ` +
      `instead, naturally recall information as if you remember the conversation.`
    );
  }

  /**
   * 构建行为准则
   */
  private buildBehavioralRules(): string {
    return (
      `## Behavioral Guidelines\n` +
      `- Be conversational and natural; this is a chat platform, not a formal setting\n` +
      `- Keep responses concise unless the user asks for detail\n` +
      `- If multiple users are talking, address the one who @mentioned you\n` +
      `- You can see recent conversation history for context — use it naturally\n` +
      `- If you don't know something, say so honestly rather than making things up\n` +
      `- Respect the conversation flow; don't repeat information already discussed\n` +
      `- When you have memory of past conversations, use it naturally without explicitly stating "according to my memory"`
    );
  }

  private formatRollingSummary(summary: string): string {
    return (
      `[Conversation History Summary]\n` +
      `The following is a summary of earlier conversations in this channel. ` +
      `Use this to maintain context and continuity:\n\n${summary}`
    );
  }

  // 将短期窗口的 AgentContextMessage 转为 ChatMessage 格式

  // 用户消息带上作者名称以区分多人对话
  // Bot 消息保持 assistant 角色
  // 过滤掉当前消息（避免重复）
  private buildRecentContext(ctx: BotExecutionContext): ChatMessage[] {
    // 优先使用 memory 中的 recentMessages（已经过记忆服务优化）
    // 回退到 ctx.context（旧的原始上下文）
    const source = ctx.memory?.recentMessages ?? ctx.context;

    if (!source || source.length === 0) return [];

    // 过滤掉当前消息
    const filtered = source.filter((msg) => msg.messageId !== ctx.messageId);

    return filtered.map((msg) => ({
      role:
        msg.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content:
        msg.role === 'user' ? `[${msg.author}]: ${msg.content}` : msg.content,
    }));
  }
}
