import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

import { AgentContextMessage, MEMORY_DEFAULTS } from '@discord-platform/shared';
import { AppLogger } from '../../../common/configs/logger/logger.service';
import { EmbeddingModelService } from '../../automod/services/embedding-model.service';

export type ImportanceTier = 'high' | 'normal' | 'low';

export interface ImportanceResult {
  message: AgentContextMessage;
  score: number;
  tier: ImportanceTier;
}

// TODO：是不是可以用机器学习？

// CJK 字符范围
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;

// 实体提取信号词：包含这些词的消息大概率含有可提取的事实
const ENTITY_SIGNAL_RE =
  /记住|别忘|我是|我叫|我喜欢|我在做|我擅长|我的名字|我正在|remember|don't forget|i am|my name|i like|i prefer|i work/i;

// @mention 前缀 (e.g., "@bot-name ")
const MENTION_RE = /^@\S+\s*/;

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

// 密码 / Token / API Key (英文格式：key=value)
const PASSWORD_RE =
  /(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi;

// 裸 API Key 格式 (sk-xxx, pk-xxx, Bearer xxx 等)
const BARE_API_KEY_RE = /\b(?:sk|pk|ak|rk)-[a-zA-Z0-9]{8,}\b/g;

// 中文语境下的 API Key / 密码 (e.g., "API Key 是 sk-xxx", "密码是 abc123")
const CJK_SENSITIVE_RE =
  /(?:api\s*key|密[码碼]|秘[钥鑰]|令牌|token|密码)\s*[是为：:]\s*\S+/gi;

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
    @Optional() private readonly embeddingModel?: EmbeddingModelService,
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

    const embAvailable = this.embeddingModel?.isAvailable() ?? false;

    if (embAvailable) {
      this.logger.log(
        '[MemoryFilterService] Embedding model available — using local inference for filtering',
      );
    } else if (this.llmEnabled) {
      this.logger.log(
        `[MemoryFilterService] LLM filtering enabled (model: "${this.model}")`,
      );
    } else {
      this.logger.log(
        '[MemoryFilterService] LLM filtering disabled, using rule-based fallback',
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

    // 模糊消息：优先用嵌入模型，其次 LLM，最后保留
    let llmKept: AgentContextMessage[] = ambiguous;
    if (this.embeddingModel?.isAvailable() && ambiguous.length > 0) {
      try {
        llmKept = await this.embeddingFilterMessages(ambiguous);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `[MemoryFilterService] Embedding filter failed, trying LLM: ${error.message}`,
        );
        llmKept = ambiguous;
      }
    } else if (this.llmEnabled && ambiguous.length > 0) {
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

    this.logger.log(
      `[MemoryFilterService] filterMessages: input=${messages.length}, definiteKeep=${definitelyKeep.length}, dropped=${definitelyDrop.length}, ambiguous→kept=${llmKept.length}, total=${definitelyKeep.length + llmKept.length}`,
    );

    return [...definitelyKeep, ...llmKept];
  }

  private triageContent(content: string): 'keep' | 'drop' | 'ambiguous' {
    // 去掉 @mention 前缀再判断实际内容
    const trimmed = content.trim().replace(MENTION_RE, '').trim();

    // 明确 drop：极短、命令、纯 URL、纯 emoji
    if (trimmed.length <= MEMORY_DEFAULTS.MIN_MESSAGE_LENGTH) return 'drop';
    if (COMMAND_RE.test(trimmed)) return 'drop';
    if (PURE_URL_RE.test(trimmed)) return 'drop';
    if (PURE_EMOJI_RE.test(trimmed)) return 'drop';

    // 明确 keep：较长且包含实质内容
    // CJK 文字信息密度远高于拉丁字母，降低 keep 阈值
    const cjkChars = trimmed.match(CJK_RE);
    if (cjkChars && cjkChars.length > 0 && trimmed.length > 8) return 'keep';
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

  // 语义密度检查：判断消息是否包含可提取的有意义信息
  async hasSemanticDensity(messages: AgentContextMessage[]): Promise<boolean> {
    const userMessages = messages.filter((m) => m.role === 'user');
    if (userMessages.length === 0) return false;

    const combined = userMessages.map((m) => m.content).join(' ');

    // 太短，无内容可提取
    if (combined.length < MEMORY_DEFAULTS.MIN_SEMANTIC_DENSITY_LENGTH) {
      return false;
    }

    // 包含显式实体提取信号词 → 直接通过
    if (ENTITY_SIGNAL_RE.test(combined)) return true;

    // CJK 字符数 + 英文单词数 = 信息单元
    const cjkCount = (combined.match(CJK_RE) || []).length;
    const words = combined.split(/\s+/).filter((w) => w.length > 0);
    const infoUnits = cjkCount + words.filter((w) => !CJK_RE.test(w)).length;

    // 足够的信息单元
    if (infoUnits >= 10) return true;

    // 多条消息时用嵌入模型做多样性检测
    if (userMessages.length > 1 && this.embeddingModel?.isAvailable()) {
      try {
        const density = await this.embeddingModel.computeSemanticDensity(
          userMessages.map((m) => m.content),
        );
        return density > 0.15;
      } catch {
        /* fallback below */
      }
    }

    // fallback：长度足够则认为有密度
    return combined.length >= 50;
  }

  // 重要性评分
  async scoreImportance(
    messages: AgentContextMessage[],
  ): Promise<ImportanceResult[]> {
    // 优先用嵌入模型进行混合评分
    if (this.embeddingModel?.isAvailable()) {
      try {
        const results = await this.embeddingScoreImportance(messages);
        const tiers = results.reduce(
          (acc, r) => ({ ...acc, [r.tier]: (acc[r.tier] || 0) + 1 }),
          {} as Record<string, number>,
        );
        this.logger.log(
          `[MemoryFilterService] scoreImportance (embedding): ${messages.length} messages → ${JSON.stringify(tiers)}`,
        );
        return results;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `[MemoryFilterService] Embedding scoring failed, trying LLM: ${error.message}`,
        );
      }
    }

    if (this.llmEnabled) {
      try {
        const results = await this.llmScoreImportance(messages);
        this.logger.log(
          `[MemoryFilterService] scoreImportance (llm): ${messages.length} messages scored`,
        );
        return results;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `[MemoryFilterService] LLM scoring failed, falling back to rules: ${error.message}`,
        );
      }
    }
    const results = this.ruleScoreImportance(messages);
    this.logger.log(
      `[MemoryFilterService] scoreImportance (rules): ${messages.length} messages scored`,
    );
    return results;
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

  // 去掉 @mention 前缀，用于内容质量判断
  private stripMention(content: string): string {
    return content.trim().replace(MENTION_RE, '').trim();
  }

  // Embedding-base
  private async embeddingFilterMessages(
    messages: AgentContextMessage[],
  ): Promise<AgentContextMessage[]> {
    const kept: AgentContextMessage[] = [];
    for (const msg of messages) {
      const quality = await this.embeddingModel.classifyQuality(
        this.stripMention(msg.content),
      );
      if (quality >= 0.45) {
        kept.push(msg);
      }
    }
    this.logger.debug(
      `[MemoryFilterService] Embedding filter: kept ${kept.length}/${messages.length} ambiguous`,
    );
    return kept;
  }

  // 嵌入质量 + 基于规则进行重要性评分。
  private async embeddingScoreImportance(
    messages: AgentContextMessage[],
  ): Promise<ImportanceResult[]> {
    return Promise.all(
      messages.map(async (msg) => {
        const stripped = this.stripMention(msg.content);
        const ruleScore = this.computeRuleScore(stripped);
        // 关键词匹配（如"记住"）直接标记为 high，不受 embedding 稀释
        if (ruleScore >= 0.9) {
          return {
            message: msg,
            score: ruleScore,
            tier: 'high' as ImportanceTier,
          };
        }
        const embQuality = await this.embeddingModel.classifyQuality(stripped);
        const score = Math.min(1, embQuality * 0.5 + ruleScore * 0.5);
        return { message: msg, score, tier: this.tierFromScore(score) };
      }),
    );
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
      .replace(CJK_SENSITIVE_RE, '[SENSITIVE_REDACTED]')
      .replace(BARE_API_KEY_RE, '[SENSITIVE_REDACTED]')
      .replace(EMAIL_RE, '[EMAIL_REDACTED]')
      .replace(PHONE_RE, (match) => {
        const digits = match.replace(/\D/g, '');
        return digits.length >= 7 ? '[PHONE_REDACTED]' : match;
      })
      .replace(IPV4_RE, '[IP_REDACTED]');
  }
}
