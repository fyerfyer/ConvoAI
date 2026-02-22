import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

import { AgentContextMessage, MEMORY_DEFAULTS } from '@discord-platform/shared';
import { AppLogger } from '../../../common/configs/logger/logger.service';

@Injectable()
export class SummaryService implements OnModuleInit {
  private baseUrl!: string;
  private apiKey!: string;
  private model!: string;
  private enabled = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
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
  ): Promise<string> {
    if (newMessages.length === 0) return existingSummary;

    if (!this.enabled) {
      return this.fallbackSummarize(existingSummary, newMessages);
    }

    try {
      return await this.llmSummarize(existingSummary, newMessages, botName);
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
  ): Promise<string> {
    const conversationText = newMessages
      .map((msg) => {
        const speaker =
          msg.role === 'assistant' ? `${botName} (bot)` : msg.author;
        return `[${speaker}]: ${msg.content}`;
      })
      .join('\n');

    const systemPrompt = `You are a conversation summarizer. Your job is to produce a concise, factual summary of a conversation that preserves:
1. Key topics discussed and decisions made
2. Important facts, preferences, or instructions mentioned by users
3. Questions that were asked and how the bot responded
4. Any ongoing tasks or commitments
5. User names and their specific requests/preferences

Rules:
- Write in third person (e.g., "User Alice asked about...")
- Keep the summary under ${MEMORY_DEFAULTS.SUMMARY_MAX_LENGTH} characters
- Focus on information that would be useful for future conversations
- If merging with an existing summary, integrate new information and remove outdated/redundant details
- Use bullet points for clarity
- Respond ONLY with the summary, no preamble`;

    const userPrompt = existingSummary
      ? `EXISTING SUMMARY:\n${existingSummary}\n\nNEW CONVERSATION TO INTEGRATE:\n${conversationText}\n\nProduce an updated, merged summary:`
      : `CONVERSATION:\n${conversationText}\n\nProduce a concise summary:`;

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
      return this.fallbackSummarize(existingSummary, newMessages);
    }

    // 确保不超过最大长度
    if (trimmed.length > MEMORY_DEFAULTS.SUMMARY_MAX_LENGTH) {
      return trimmed.slice(0, MEMORY_DEFAULTS.SUMMARY_MAX_LENGTH);
    }

    return trimmed;
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
}
