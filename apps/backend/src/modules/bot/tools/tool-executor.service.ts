import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { Types } from 'mongoose';

import { ChatService } from '../../chat/chat.service';
import { Channel, ChannelModel } from '../../channel/schemas/channel.schema';
import { Guild, GuildModel } from '../../guild/schemas/guild.schema';
import { Member, MemberModel } from '../../member/schemas/member.schema';
import { UserDocument } from '../../user/schemas/user.schema';
import { BotExecutionContext, LLM_TOOL } from '@discord-platform/shared';
import { AppLogger } from '../../../common/configs/logger/logger.service';

// OpenAI function-tool 格式
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// 集中管理所有 LLM Agent 可用工具的定义与执行
@Injectable()
export class ToolExecutorService {
  constructor(
    private readonly chatService: ChatService,
    private readonly httpService: HttpService,
    private readonly logger: AppLogger,
    @InjectModel(Channel.name) private readonly channelModel: ChannelModel,
    @InjectModel(Guild.name) private readonly guildModel: GuildModel,
    @InjectModel(Member.name) private readonly memberModel: MemberModel,
  ) {}

  private static readonly TOOL_DEFINITIONS: Record<string, OpenAITool> = {
    // 通用工具
    [LLM_TOOL.WEB_SEARCH]: {
      type: 'function',
      function: {
        name: 'web_search',
        description:
          'Search the web for current information. Use when users ask about recent events, facts, or anything requiring up-to-date knowledge.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query',
            },
          },
          required: ['query'],
        },
      },
    },
    [LLM_TOOL.CODE_EXECUTION]: {
      type: 'function',
      function: {
        name: 'execute_code',
        description:
          'Evaluate a code snippet and return the result. Supports simple JavaScript math expressions.',
        parameters: {
          type: 'object',
          properties: {
            language: {
              type: 'string',
              enum: ['javascript', 'python'],
              description: 'Programming language',
            },
            code: { type: 'string', description: 'Code to evaluate' },
          },
          required: ['language', 'code'],
        },
      },
    },
    // Guild / Channel 工具
    [LLM_TOOL.SUMMARIZE_USER]: {
      type: 'function',
      function: {
        name: 'summarize_user_messages',
        description:
          'Retrieve recent messages sent by a specific user in this channel so you can summarize what they said. Provide the user name (not ID).',
        parameters: {
          type: 'object',
          properties: {
            userName: {
              type: 'string',
              description:
                'The display name (or nickname) of the user whose messages to fetch',
            },
            limit: {
              type: 'number',
              description:
                'Maximum number of messages to retrieve (default 30, max 100)',
            },
          },
          required: ['userName'],
        },
      },
    },
    [LLM_TOOL.CHANNEL_HISTORY]: {
      type: 'function',
      function: {
        name: 'get_channel_history',
        description:
          'Get the most recent messages in the current channel. Useful for understanding the conversation context.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description:
                'Number of recent messages to retrieve (default 20, max 50)',
            },
          },
        },
      },
    },
    [LLM_TOOL.GUILD_INFO]: {
      type: 'function',
      function: {
        name: 'get_guild_info',
        description:
          'Get information about the current guild/server: name, member count, channel list, creation date, etc.',
        parameters: { type: 'object', properties: {} },
      },
    },
    [LLM_TOOL.MEMBER_LIST]: {
      type: 'function',
      function: {
        name: 'get_member_list',
        description:
          'List all members (users) currently in the guild, with their display names.',
        parameters: { type: 'object', properties: {} },
      },
    },
  };

  resolveTools(toolIds?: string[]): OpenAITool[] {
    if (!toolIds || toolIds.length === 0) return [];
    return toolIds
      .map((id) => ToolExecutorService.TOOL_DEFINITIONS[id])
      .filter((t): t is OpenAITool => !!t);
  }

  async execute(
    functionName: string,
    argsString: string,
    ctx: BotExecutionContext,
  ): Promise<string> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsString);
    } catch {
      return JSON.stringify({ error: 'Failed to parse tool arguments' });
    }

    try {
      switch (functionName) {
        // 通用工具
        case 'web_search':
          return await this.toolWebSearch(args.query as string);
        case 'execute_code':
          return this.toolCodeExecution(
            args.language as string,
            args.code as string,
          );

        // Guild / Channel 工具
        case 'summarize_user_messages':
          return await this.toolSummarizeUser(
            ctx.channelId,
            args.userName as string,
            (args.limit as number) || 30,
          );
        case 'get_channel_history':
          return await this.toolChannelHistory(
            ctx.channelId,
            (args.limit as number) || 20,
          );
        case 'get_guild_info':
          return await this.toolGuildInfo(ctx.guildId);
        case 'get_member_list':
          return await this.toolMemberList(ctx.guildId);

        default:
          return JSON.stringify({ error: `Unknown tool: ${functionName}` });
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[ToolExecutor] Tool "${functionName}" failed: ${error.message}`,
        error.stack,
      );
      return JSON.stringify({ error: error.message });
    }
  }

  private async toolWebSearch(query: string): Promise<string> {
    try {
      const response = await this.httpService.axiosRef.get(
        'https://api.duckduckgo.com/',
        {
          params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
          timeout: 10_000,
        },
      );

      const data = response.data;
      const results: string[] = [];

      if (data.AbstractText) {
        results.push(`**Summary:** ${data.AbstractText}`);
        if (data.AbstractSource) results.push(`Source: ${data.AbstractSource}`);
      }

      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        const topics = data.RelatedTopics.slice(0, 5)
          .filter((t: Record<string, unknown>) => t.Text)
          .map((t: Record<string, unknown>) => `- ${t.Text}`);
        if (topics.length > 0)
          results.push(`\n**Related:**\n${topics.join('\n')}`);
      }

      if (results.length === 0) {
        return JSON.stringify({
          result: `No instant results found for "${query}". Answer based on your training data.`,
        });
      }

      return JSON.stringify({ result: results.join('\n') });
    } catch {
      return JSON.stringify({
        result: `Web search for "${query}" is temporarily unavailable.`,
      });
    }
  }

  private toolCodeExecution(language: string, code: string): string {
    if (language === 'javascript') {
      try {
        const safePattern = /^[\d\s+\-*/().%]+$/;
        if (safePattern.test(code) && code.length <= 200) {
          const result = new Function(`"use strict"; return (${code})`)();
          return JSON.stringify({ result: String(result), executed: true });
        }
      } catch {
        // fall through
      }
    }

    return JSON.stringify({
      result: `Code (${language}):\n\`\`\`${language}\n${code}\n\`\`\`\nNote: Only simple math expressions can be evaluated. Please analyze the code manually.`,
      executed: false,
    });
  }

  private async toolSummarizeUser(
    channelId: string,
    userName: string,
    limit: number,
  ): Promise<string> {
    const cappedLimit = Math.min(limit, 100);

    // 拉取较大范围消息（因为需要按发送者过滤）
    const messages = await this.chatService.getMessages(
      channelId,
      cappedLimit * 3,
    );

    const userMessages = messages.filter((msg) => {
      const sender = msg.sender as unknown as UserDocument;
      return sender?.name?.toLowerCase() === userName.toLowerCase();
    });

    if (userMessages.length === 0) {
      return JSON.stringify({
        result: `No recent messages found from user "${userName}" in this channel.`,
        messageCount: 0,
      });
    }

    const formatted = userMessages
      .reverse()
      .slice(0, cappedLimit)
      .map((msg) => {
        const ts = msg.createdAt
          ? new Date(msg.createdAt).toLocaleString()
          : '';
        return `[${ts}] ${msg.content}`;
      });

    return JSON.stringify({
      result: formatted.join('\n'),
      userName,
      messageCount: formatted.length,
      instruction:
        'Summarize these messages in a clear, concise way for the user who asked.',
    });
  }

  private async toolChannelHistory(
    channelId: string,
    limit: number,
  ): Promise<string> {
    const cappedLimit = Math.min(limit, 50);
    const messages = await this.chatService.getMessages(channelId, cappedLimit);

    const formatted = messages.reverse().map((msg) => {
      const sender = msg.sender as unknown as UserDocument;
      const ts = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : '';
      return `[${ts}] ${sender?.name || 'Unknown'}: ${msg.content}`;
    });

    return JSON.stringify({
      result: formatted.join('\n'),
      messageCount: formatted.length,
    });
  }

  private async toolGuildInfo(guildId: string): Promise<string> {
    const guild = await this.guildModel
      .findById(new Types.ObjectId(guildId))
      .populate('owner', 'name')
      .lean();
    if (!guild) return JSON.stringify({ error: 'Guild not found' });

    const memberCount = await this.memberModel.countDocuments({
      guild: new Types.ObjectId(guildId),
    });

    const channels = await this.channelModel
      .find({ guild: new Types.ObjectId(guildId) })
      .select('name type')
      .lean();

    const owner = guild.owner as unknown as { name: string };

    return JSON.stringify({
      name: guild.name,
      owner: owner?.name || 'Unknown',
      memberCount,
      channelCount: channels.length,
      channels: channels.map((c) => ({
        name: c.name,
        type: c.type,
      })),
      createdAt: guild.createdAt
        ? new Date(guild.createdAt as unknown as string).toISOString()
        : '',
    });
  }

  private async toolMemberList(guildId: string): Promise<string> {
    const members = await this.memberModel
      .find({ guild: new Types.ObjectId(guildId) })
      .populate('user', 'name avatar isBot')
      .lean();

    const formatted = members.map((m) => {
      const user = m.user as unknown as {
        name: string;
        isBot?: boolean;
      };
      return {
        name: user?.name || 'Unknown',
        nickname: m.nickName || null,
        isBot: user?.isBot || false,
      };
    });

    return JSON.stringify({
      memberCount: formatted.length,
      members: formatted,
    });
  }
}
