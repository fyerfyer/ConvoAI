import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

import {
  AgentContextMessage,
  MEMORY_DEFAULTS,
  PERMISSIONS,
  PermissionUtil,
} from '@discord-platform/shared';
import { AppLogger } from '../../../common/configs/logger/logger.service';
import { MemberService } from '../../member/member.service';

interface SummarySource {
  name: string;
  id?: string;
}

interface SummaryItem {
  type: 'fact' | 'instruction';
  content: string;
  sources: SummarySource[];
}

@Injectable()
export class SummaryService implements OnModuleInit {
  private baseUrl!: string;
  private apiKey!: string;
  private model!: string;
  private enabled = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly memberService: MemberService,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit() {
    this.baseUrl = (
      this.configService.get<string>('SUMMARY_LLM_BASE_URL') || ''
    ).replace(/\/$/, '');
    this.apiKey = this.configService.get<string>('SUMMARY_LLM_API_KEY') || '';
    this.model =
      this.configService.get<string>('SUMMARY_LLM_MODEL') || 'deepseek-chat';

    this.enabled = !!(this.baseUrl && this.apiKey);

    if (this.enabled) {
      this.logger.log(
        `[SummaryService] Initialized with model "${this.model}" at ${this.baseUrl}`,
      );
    } else {
      this.logger.warn(
        '[SummaryService] No SUMMARY_LLM_BASE_URL/SUMMARY_LLM_API_KEY configured. ' +
          'Rolling summary will use fallback truncation strategy.',
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async summarize(
    existingSummary: string,
    newMessages: AgentContextMessage[],
    botName: string,
    guildId: string,
    channelId: string,
  ): Promise<string> {
    if (newMessages.length === 0) return existingSummary;

    if (!this.enabled) {
      return this.fallbackSummarize(existingSummary, newMessages);
    }

    try {
      const items = await this.llmSummarize(
        existingSummary,
        newMessages,
        botName,
      );
      if (items.length === 0) {
        return this.fallbackSummarize(existingSummary, newMessages);
      }

      const validated = await this.validateSummaryItems(
        items,
        guildId,
        channelId,
      );

      if (validated.length === 0) {
        this.logger.warn(
          '[SummaryService] Validation removed all summary items; returning empty summary.',
        );
        return '';
      }

      const formatted = this.formatSummary(validated);
      return formatted.length > MEMORY_DEFAULTS.SUMMARY_MAX_LENGTH
        ? formatted.slice(0, MEMORY_DEFAULTS.SUMMARY_MAX_LENGTH)
        : formatted;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[SummaryService] LLM summarization failed, using fallback: ${error.message}`,
        error.stack,
      );
      return this.fallbackSummarize(existingSummary, newMessages);
    }
  }

  private async llmSummarize(
    existingSummary: string,
    newMessages: AgentContextMessage[],
    botName: string,
  ): Promise<SummaryItem[]> {
    const conversationText = newMessages
      .map((msg) => {
        const speaker =
          msg.role === 'assistant' ? `${botName} (bot)` : msg.author;
        const sourceId = msg.authorId ? ` | ${msg.authorId}` : '';
        return `[${speaker}${sourceId}]: ${msg.content}`;
      })
      .join('\n');

    const systemPrompt = `You are a conversation summarizer. Extract ONLY facts and instructions from the conversation.\n\nReturn a JSON array. Each item must be:\n{\n  \"type\": \"fact\" | \"instruction\",\n  \"content\": \"...\",\n  \"sources\": [{ \"name\": \"...\", \"id\": \"...\" }]\n}\n\nRules:\n- Write in third person (e.g., \"User Alice said...\")\n- Include the source user(s) for each item. Use the name + id from the conversation lines (format: [name | id])\n- If source is unknown (legacy summary), set name to \"unknown\" and id to \"\"\n- Deduplicate and merge overlapping items with updated wording\n- Keep content concise and useful for future conversations\n- Respond ONLY with the JSON array, no extra text`;

    const userPrompt = existingSummary
      ? `EXISTING SUMMARY (may include legacy text without sources):\n${existingSummary}\n\nNEW CONVERSATION TO INTEGRATE:\n${conversationText}\n\nReturn the updated JSON summary items:`
      : `CONVERSATION:\n${conversationText}\n\nReturn the JSON summary items:`;

    const response = await this.httpService.axiosRef.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // 确保一致性
        max_tokens: 800,
        stream: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: 30_000,
      },
    );

    const content = response.data?.choices?.[0]?.message?.content || '';
    const trimmed = content.trim();

    if (!trimmed) {
      this.logger.warn('[SummaryService] LLM returned empty summary');
      return [];
    }

    const items = this.parseSummaryItems(trimmed);
    if (items.length === 0) {
      this.logger.warn('[SummaryService] LLM summary parsing failed');
    }
    return items;
  }

  private fallbackSummarize(
    existingSummary: string,
    newMessages: AgentContextMessage[],
  ): string {
    const newPart = newMessages
      .map((msg) => `- [${msg.author}] ${msg.content.slice(0, 100)}`)
      .join('\n');

    const combined = existingSummary
      ? `${existingSummary}\n\n--- Recent ---\n${newPart}`
      : newPart;

    // 保留最大长度
    if (combined.length > MEMORY_DEFAULTS.SUMMARY_MAX_LENGTH) {
      return combined.slice(
        combined.length - MEMORY_DEFAULTS.SUMMARY_MAX_LENGTH,
      );
    }
    return combined;
  }

  private parseSummaryItems(content: string): SummaryItem[] {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];

      const items: SummaryItem[] = [];
      for (const rawItem of parsed) {
        if (
          typeof rawItem !== 'object' ||
          rawItem === null ||
          !('content' in rawItem) ||
          typeof (rawItem as Record<string, unknown>).content !== 'string'
        ) {
          continue;
        }

        const item = rawItem as Record<string, unknown>;
        const type: SummaryItem['type'] =
          item.type === 'instruction' ? 'instruction' : 'fact';
        const rawSources = Array.isArray(item.sources) ? item.sources : [];
        const sources = rawSources
          .filter((source) => typeof source === 'object' && source !== null)
          .map((source) => {
            const src = source as Record<string, unknown>;
            return {
              name: String(src.name || 'unknown'),
              id: src.id ? String(src.id) : '',
            };
          })
          .filter((source) => source.name.trim().length > 0);

        const contentText = String(item.content).slice(0, 500).trim();
        if (!contentText) continue;

        items.push({
          type,
          content: contentText,
          sources,
        });
      }

      return items;
    } catch {
      return [];
    }
  }

  private async validateSummaryItems(
    items: SummaryItem[],
    guildId: string,
    channelId: string,
  ): Promise<SummaryItem[]> {
    const permissionCache = new Map<string, boolean>();

    const hasManageGuild = async (userId: string): Promise<boolean> => {
      if (permissionCache.has(userId)) {
        return permissionCache.get(userId) || false;
      }
      try {
        const perms = await this.memberService.getMemberPermissions(
          guildId,
          userId,
          channelId,
        );
        const allowed = PermissionUtil.has(
          perms,
          PERMISSIONS.MANAGE_GUILD,
        );
        permissionCache.set(userId, allowed);
        return allowed;
      } catch (err) {
        this.logger.warn(
          `[SummaryService] Permission check failed for user ${userId}: ${err}`,
        );
        permissionCache.set(userId, false);
        return false;
      }
    };

    const filtered: SummaryItem[] = [];

    for (const item of items) {
      const requiresPermission =
        item.type === 'instruction' || this.isSensitiveFact(item.content);

      if (!requiresPermission) {
        filtered.push(item);
        continue;
      }

      const sourceIds = item.sources
        .map((source) => source.id)
        .filter((id): id is string => !!id);

      if (sourceIds.length === 0) {
        this.logger.warn(
          `[SummaryService] Dropping privileged summary item without source: ${item.content}`,
        );
        continue;
      }

      let allowed = false;
      for (const sourceId of sourceIds) {
        if (await hasManageGuild(sourceId)) {
          allowed = true;
          break;
        }
      }

      if (allowed) {
        filtered.push(item);
      } else {
        this.logger.warn(
          `[SummaryService] Dropping privileged summary item from unauthorized source: ${item.content}`,
        );
      }
    }

    return filtered;
  }

  // TODO：这里可以引入大模型
  private isSensitiveFact(content: string): boolean {
    const lowered = content.toLowerCase();
    return (
      lowered.includes('admin') ||
      lowered.includes('administrator') ||
      lowered.includes('owner') ||
      lowered.includes('moderator') ||
      lowered.includes('mod') ||
      lowered.includes('delete') ||
      lowered.includes('ban') ||
      lowered.includes('kick') ||
      lowered.includes('mute') ||
      content.includes('管理员') ||
      content.includes('权限') ||
      content.includes('删除') ||
      content.includes('封禁') ||
      content.includes('踢出')
    );
  }

  private formatSummary(items: SummaryItem[]): string {
    return items
      .map((item) => {
        const sourceNames =
          item.sources.length > 0
            ? item.sources
                .map((source) => source.name)
                .filter((name) => name.trim().length > 0)
                .join(', ')
            : 'unknown';
        return `- [${item.type}] ${item.content} (source: ${sourceNames})`;
      })
      .join('\n');
  }
}
