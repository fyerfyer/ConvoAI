import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

import { AgentContextMessage, MEMORY_DEFAULTS } from '@discord-platform/shared';
import { AppLogger } from '../../../common/configs/logger/logger.service';

export type ImportanceTier = 'high' | 'normal' | 'low';

export interface ImportanceResult {
  message: AgentContextMessage;
  score: number;
  tier: ImportanceTier;
}

// TODO：是不是可以用机器学习？

// Bot 命令正则
const COMMAND_RE = /^[/!]\S/;

// 纯 URL 消息
const PURE_URL_RE = /^https?:\/\/\S+$/i;

// 纯 Emoji 消息
const PURE_EMOJI_RE = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;

// Email
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// 电话号码
const PHONE_RE =
  /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;

// 密码
const PASSWORD_RE =
  /(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi;

// IPv4 地址
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

const HIGH_IMPORTANCE_KEYWORDS = [
  'remember this',
  'remember that',
  "don't forget",
  'important',
  '记住',
  '别忘了',
  '重要',
  'note this',
  'keep in mind',
] as const;

const MEDIUM_IMPORTANCE_SIGNALS = [
  /```[\s\S]+```/, // 代码块
  /\b\d{4,}\b/, // 大数字
  /https?:\/\/\S+/, // URL（当与文本混合时）
  /\b(?:api|sdk|npm|docker|k8s|sql|redis|mongo)\b/i, // 技术术语
] as const;

@Injectable()
export class MemoryFilterService implements OnModuleInit {
  private baseUrl = '';
  private apiKey = '';
  private model = '';
  private llmEnabled = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit() {
    this.baseUrl = (
      this.configService.get<string>('MEMORY_FILTER_LLM_BASE_URL') || ''
    ).replace(/\/$/, '');
    this.apiKey =
      this.configService.get<string>('MEMORY_FILTER_LLM_API_KEY') || '';
    this.model =
      this.configService.get<string>('MEMORY_FILTER_LLM_MODEL') ||
      'deepseek-chat';

    this.llmEnabled = !!(this.baseUrl && this.apiKey);

    if (this.llmEnabled) {
      this.logger.log(
        `[MemoryFilterService] LLM filtering enabled (model: "${this.model}")`,
      );
    } else {
      this.logger.log(
        '[MemoryFilterService] LLM filtering disabled – using rule-based fallback',
      );
    }
  }

  isLlmEnabled(): boolean {
    return this.llmEnabled;
  }

  // 内容质量过滤（混合策略：正则 + LLM）
  async filterMessages(
    messages: AgentContextMessage[],
  ): Promise<AgentContextMessage[]> {
    const definitelyKeep: AgentContextMessage[] = [];
    const definitelyDrop: AgentContextMessage[] = [];
    const ambiguous: AgentContextMessage[] = [];

    for (const msg of messages) {
      // Bot 回复始终保留
      if (msg.role === 'assistant') {
        definitelyKeep.push(msg);
        continue;
      }

      const verdict = this.triageContent(msg.content);
      if (verdict === 'keep') definitelyKeep.push(msg);
      else if (verdict === 'drop') definitelyDrop.push(msg);
      else ambiguous.push(msg);
    }

    // 模糊消息交给 LLM
    let llmKept: AgentContextMessage[] = ambiguous;
    if (this.llmEnabled && ambiguous.length > 0) {
      try {
        llmKept = await this.llmFilterMessages(ambiguous);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `[MemoryFilterService] LLM content filter failed, keeping ambiguous: ${error.message}`,
        );
      }
    }

    if (definitelyDrop.length > 0) {
      this.logger.debug(
        `[MemoryFilterService] Dropped ${definitelyDrop.length} low-quality, kept ${definitelyKeep.length} definite + ${llmKept.length} from LLM/ambiguous`,
      );
    }

    return [...definitelyKeep, ...llmKept];
  }

  // TODO：这里应该用更严谨的策略
  private triageContent(content: string): 'keep' | 'drop' | 'ambiguous' {
    const trimmed = content.trim();

    // 明确 drop：极短、命令、纯 URL、纯 emoji
    if (trimmed.length <= MEMORY_DEFAULTS.MIN_MESSAGE_LENGTH) return 'drop';
    if (COMMAND_RE.test(trimmed)) return 'drop';
    if (PURE_URL_RE.test(trimmed)) return 'drop';
    if (PURE_EMOJI_RE.test(trimmed)) return 'drop';

    // 明确 keep：较长且包含实质内容
    if (trimmed.length > 40) return 'keep';

    // 中间地带（6-40 字符）：交给 LLM 裁决
    return 'ambiguous';
  }

  // LLM 批量判断模糊消息是否值得保留
  private async llmFilterMessages(
    messages: AgentContextMessage[],
  ): Promise<AgentContextMessage[]> {
    const indexed = messages
      .map((msg, i) => `[${i}] ${msg.author}: ${msg.content}`)
      .join('\n');

    const systemPrompt = `You are a message quality filter. Determine whether each message is worth long-term storage in the memory system.

Messages that should be kept contain meaningful information, such as: opinions, facts, preferences, plans, technical discussions.
Messages to be discarded include: simple greetings ("hi", "嗯", "好的"), meaningless replies, pure emojis or numbers, etc.

Return a JSON array, where each message corresponds to true (keep) or false (discard).
Example: [true, false, true]`;

    const response = await this.httpService.axiosRef.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `判断以下消息：\n\n${indexed}` },
        ],
        temperature: 0.1,
        max_tokens: 100,
        stream: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: 10_000,
      },
    );

    const content = response.data?.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return messages; // 解析失败则全部保留

    const verdicts: unknown = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(verdicts) || verdicts.length !== messages.length) {
      return messages;
    }

    return messages.filter((_, i) => verdicts[i] === true);
  }

  // 语义密度检查（混合策略：规则 + LLM）
  async hasSemanticDensity(messages: AgentContextMessage[]): Promise<boolean> {
    const userMessages = messages.filter((m) => m.role === 'user');
    if (userMessages.length === 0) return false;

    const combined = userMessages.map((m) => m.content).join(' ');

    // 快速规则判断：明确不足
    if (combined.length < MEMORY_DEFAULTS.MIN_SEMANTIC_DENSITY_LENGTH) {
      return false;
    }

    // 规则辅助：词汇多样性 + 平均词长
    const words = combined.split(/\s+/).filter((w) => w.length > 0);
    const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
    const avgWordLen =
      words.length > 0
        ? words.reduce((sum, w) => sum + w.length, 0) / words.length
        : 0;

    // 明确足够：词汇丰富且有一定长度
    if (uniqueWords.size >= 8 && avgWordLen >= 3) return true;

    // 明确不足：全是极短重复词
    if (uniqueWords.size <= 2 && words.length <= 4) return false;

    // 模糊地带 → LLM 裁决
    if (this.llmEnabled) {
      try {
        return await this.llmCheckSemanticDensity(userMessages);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `[MemoryFilterService] LLM density check failed, using rule fallback: ${error.message}`,
        );
      }
    }

    // fallback：通过长度阈值的默认为有密度
    return true;
  }

  // LLM 判断语义密度
  private async llmCheckSemanticDensity(
    messages: AgentContextMessage[],
  ): Promise<boolean> {
    const text = messages.map((m) => `${m.author}: ${m.content}`).join('\n');

    const systemPrompt = `You are a semantic density analyzer. Determine whether the following user message contains extractable meaningful knowledge (such as personal preferences, facts, plans, technical details, etc.).

Return false if the message is just simple greetings or casual chat (like "hello", "haha", "ok", "good night").
Return true if the message contains any substantive information.

Return only true or false, no other text.`;

    const response = await this.httpService.axiosRef.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 10,
        stream: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: 10_000,
      },
    );

    const answer = (response.data?.choices?.[0]?.message?.content || '')
      .trim()
      .toLowerCase();
    return answer === 'true';
  }

  // 重要性评分
  async scoreImportance(
    messages: AgentContextMessage[],
  ): Promise<ImportanceResult[]> {
    if (this.llmEnabled) {
      try {
        return await this.llmScoreImportance(messages);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `[MemoryFilterService] LLM scoring failed, falling back to rules: ${error.message}`,
        );
      }
    }
    return this.ruleScoreImportance(messages);
  }

  private ruleScoreImportance(
    messages: AgentContextMessage[],
  ): ImportanceResult[] {
    return messages.map((msg) => {
      const score = this.computeRuleScore(msg.content);
      return { message: msg, score, tier: this.tierFromScore(score) };
    });
  }

  private computeRuleScore(content: string): number {
    const lower = content.toLowerCase();

    for (const kw of HIGH_IMPORTANCE_KEYWORDS) {
      if (lower.includes(kw)) return 0.9;
    }

    let score = 0.4;

    for (const pattern of MEDIUM_IMPORTANCE_SIGNALS) {
      if (pattern.test(content)) {
        score += 0.15;
      }
    }

    if (content.length > 200) score += 0.1;
    else if (content.length > 100) score += 0.05;

    return Math.min(1, score);
  }

  private tierFromScore(score: number): ImportanceTier {
    if (score >= MEMORY_DEFAULTS.IMPORTANCE_HIGH_THRESHOLD) return 'high';
    if (score >= MEMORY_DEFAULTS.IMPORTANCE_LOW_THRESHOLD) return 'normal';
    return 'low';
  }

  private async llmScoreImportance(
    messages: AgentContextMessage[],
  ): Promise<ImportanceResult[]> {
    const conversationText = messages
      .map((msg, idx) => `[${idx}] [${msg.author}]: ${msg.content}`)
      .join('\n');

    const systemPrompt = `You are a message importance scorer for a conversation memory system.
For each message, rate how important it is to remember long-term from 0.0 to 1.0.

Scoring guide:
- 0.8-1.0: Contains important facts, explicit "remember" requests, or significant user preferences
- 0.5-0.7: Contains useful info like technical details, plans, dates
- 0.2-0.4: Casual chat, greetings, short reactions
- 0.0-0.1: Noise, spam, or completely trivial

Return ONLY a JSON array of numbers (one score per message, in order).
Example for 3 messages: [0.8, 0.3, 0.6]`;

    const response = await this.httpService.axiosRef.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Score each message:\n\n${conversationText}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 200,
        stream: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: 15_000,
      },
    );

    const content = response.data?.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('LLM did not return a valid JSON array');
    }

    const scores: unknown = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(scores) || scores.length !== messages.length) {
      throw new Error(
        `LLM returned ${Array.isArray(scores) ? scores.length : 0} scores for ${messages.length} messages`,
      );
    }

    return messages.map((msg, i) => {
      const raw = Number(scores[i]);
      const score = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.4;
      return { message: msg, score, tier: this.tierFromScore(score) };
    });
  }

  sanitizePII(messages: AgentContextMessage[]): AgentContextMessage[] {
    return messages.map((msg) => ({
      ...msg,
      content: this.redactPII(msg.content),
    }));
  }

  private redactPII(text: string): string {
    return text
      .replace(PASSWORD_RE, '[SENSITIVE_REDACTED]')
      .replace(EMAIL_RE, '[EMAIL_REDACTED]')
      .replace(PHONE_RE, (match) => {
        const digits = match.replace(/\D/g, '');
        return digits.length >= 7 ? '[PHONE_REDACTED]' : match;
      })
      .replace(IPV4_RE, '[IP_REDACTED]');
  }
}
