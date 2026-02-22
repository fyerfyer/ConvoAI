import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Readable } from 'stream';
import { randomBytes } from 'crypto';

import { BotDocument, LlmConfigEmbedded } from '../schemas/bot.schema';
import { EncryptionService } from '../crypto/encryption.service';
import { ChatService } from '../../chat/chat.service';
import {
  OpenAITool,
  ToolExecutorService,
} from '../tools/tool-executor.service';
import { UserDocument } from '../../user/schemas/user.schema';

import {
  BotExecutionContext,
  AgentContextMessage,
  BOT_INTERNAL_EVENT,
  BotStreamStartPayload,
  BotStreamChunkPayload,
  LLM_PROVIDER,
} from '@discord-platform/shared';
import { AppLogger } from '../../../common/configs/logger/logger.service';

// OpenAI 兼容消息格式
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// Provider → Base URL 映射
const PROVIDER_BASE_URLS: Record<string, string> = {
  [LLM_PROVIDER.OPENAI]: 'https://api.openai.com/v1',
  [LLM_PROVIDER.DEEPSEEK]: 'https://api.deepseek.com',
  [LLM_PROVIDER.GOOGLE]:
    'https://generativelanguage.googleapis.com/v1beta/openai',
};

const MAX_TOOL_ITERATIONS = 5;

@Injectable()
export class LlmRunner {
  constructor(
    private readonly httpService: HttpService,
    private readonly encryptionService: EncryptionService,
    private readonly chatService: ChatService,
    private readonly toolExecutor: ToolExecutorService,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: AppLogger,
  ) {}

  async execute(bot: BotDocument, ctx: BotExecutionContext): Promise<void> {
    const llmConfig = bot.llmConfig;
    if (!llmConfig) {
      this.logger.warn(`Bot ${ctx.botId} has no llmConfig`);
      await this.sendBotMessage(
        bot,
        ctx.channelId,
        "⚠️ AI Agent haven't been configured yet. Please set up the LLM configuration for this bot.",
      );
      return;
    }

    try {
      const apiKey = this.decryptApiKey(llmConfig.apiKey);
      const baseUrl = this.resolveBaseUrl(llmConfig);
      const messages = this.buildMessages(llmConfig, ctx);

      // Channel 覆写
      const toolNames = ctx.overrideTools ?? llmConfig.tools;
      const tools = this.toolExecutor.resolveTools(toolNames);

      this.logger.debug(
        `[LlmRunner] Calling ${llmConfig.provider}/${llmConfig.model} for bot ${ctx.botId} (tools: ${tools.length}, messages: ${messages.length}, baseUrl: ${baseUrl})`,
      );

      if (tools.length > 0) {
        await this.chatWithTools(
          bot,
          ctx,
          baseUrl,
          apiKey,
          llmConfig,
          messages,
          tools,
        );
      } else {
        // 流式请求
        await this.streamChat(bot, ctx, baseUrl, apiKey, llmConfig, messages);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // 提取 Axios 响应体来写日志
      const axiosData =
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        (err as { response?: { data?: unknown } }).response?.data;
      const detail = axiosData
        ? ` | API response: ${JSON.stringify(axiosData).slice(0, 500)}`
        : '';

      this.logger.error(
        `[LlmRunner] LLM request failed for bot ${ctx.botId}: ${error.message}${detail}`,
        error.stack,
      );
      // 如果配置了工具，使用带工具调用循环的非流式模式

      const userMessage = this.getUserFriendlyError(error, axiosData);
      await this.sendBotMessage(bot, ctx.channelId, userMessage);
    }
  }

  private async chatWithTools(
    bot: BotDocument,
    ctx: BotExecutionContext,
    baseUrl: string,
    apiKey: string,
    config: LlmConfigEmbedded,
    messages: ChatMessage[],
    tools: OpenAITool[],
  ): Promise<void> {
    const conversationMessages = [...messages];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.httpService.axiosRef.post(
        `${baseUrl}/chat/completions`,
        {
          model: config.model,
          messages: conversationMessages,
          temperature: config.temperature ?? 0.7,
          max_tokens: config.maxTokens ?? 1024,
          tools,
          tool_choice: 'auto',
          stream: false,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: 120_000,
        },
      );

      const choice = response.data?.choices?.[0];
      if (!choice) break;

      const assistantMessage = choice.message;

      // 如果模型返回了 tool_calls，执行工具并发送结果
      if (
        assistantMessage.tool_calls &&
        assistantMessage.tool_calls.length > 0
      ) {
        // 将 assistant 消息（含 tool_calls）追加到对话
        conversationMessages.push({
          role: 'assistant',
          content: assistantMessage.content || null,
          tool_calls: assistantMessage.tool_calls,
        });

        // 执行每个工具调用
        for (const toolCall of assistantMessage.tool_calls) {
          const toolResult = await this.toolExecutor.execute(
            toolCall.function.name,
            toolCall.function.arguments,
            ctx,
          );
          conversationMessages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id,
          });

          this.logger.debug(
            `[LlmRunner] Tool "${toolCall.function.name}" executed for bot ${ctx.botId}`,
          );
        }

        // 继续循环
        continue;
      }

      // 没有 tool_calls： 模型返回了最终文本回复
      const content = assistantMessage.content || '';
      if (content.trim()) {
        await this.sendBotMessage(bot, ctx.channelId, content);
      }
      return;
    }

    // 达到最大迭代次数
    this.logger.warn(
      `[LlmRunner] Tool calling loop exceeded ${MAX_TOOL_ITERATIONS} iterations for bot ${ctx.botId}`,
    );
    await this.sendBotMessage(
      bot,
      ctx.channelId,
      '⚠️ Response generation took too long. Please try again.',
    );
  }

  private buildMessages(
    config: LlmConfigEmbedded,
    ctx: BotExecutionContext,
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // Channel 覆写
    const systemPrompt = ctx.overrideSystemPrompt ?? config.systemPrompt;
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // 历史上下文
    const contextMessages = this.convertContext(ctx.context);
    messages.push(...contextMessages);

    // 当前用户消息
    messages.push({
      role: 'user',
      content: ctx.content,
    });

    return messages;
  }

  private convertContext(context: AgentContextMessage[]): ChatMessage[] {
    // 取最近的消息作为上下文，避免超出 token 限制
    // TODO：上下文提取优化
    const recent = context.slice(-20);
    return recent.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content:
        msg.role === 'user' ? `[${msg.author}]: ${msg.content}` : msg.content,
    }));
  }

  private async streamChat(
    bot: BotDocument,
    ctx: BotExecutionContext,
    baseUrl: string,
    apiKey: string,
    config: LlmConfigEmbedded,
    messages: ChatMessage[],
  ): Promise<void> {
    const streamId = randomBytes(8).toString('hex');
    let accumulatedContent = '';

    // 通知前端开始流式输出
    const startPayload: BotStreamStartPayload = {
      botId: ctx.botId,
      channelId: ctx.channelId,
      streamId,
    };
    this.eventEmitter.emit(BOT_INTERNAL_EVENT.BOT_STREAM_START, startPayload);

    try {
      const response = await this.httpService.axiosRef.post(
        `${baseUrl}/chat/completions`,
        {
          model: config.model,
          messages,
          temperature: config.temperature ?? 0.7,
          max_tokens: config.maxTokens ?? 1024,
          stream: true,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            Accept: 'text/event-stream',
          },
          responseType: 'stream',
          timeout: 120_000,
        },
      );

      accumulatedContent = await this.processSSEStream(
        response.data as Readable,
        ctx.botId,
        ctx.channelId,
      );

      // 结束后保存完整消息
      if (accumulatedContent.trim()) {
        await this.sendBotMessage(bot, ctx.channelId, accumulatedContent);
      }
    } catch {
      // 流式请求失败后，发送一个结束事件通知前端停止等待
      const endPayload: BotStreamChunkPayload = {
        botId: ctx.botId,
        channelId: ctx.channelId,
        content: '',
        done: true,
      };
      this.eventEmitter.emit(BOT_INTERNAL_EVENT.BOT_STREAM_END, endPayload);

      // 尝试非流式回退
      this.logger.warn(
        `[LlmRunner] Streaming failed for bot ${ctx.botId}, falling back to non-streaming`,
      );
      await this.nonStreamChat(bot, ctx, baseUrl, apiKey, config, messages);
    }
  }

  private processSSEStream(
    stream: Readable,
    botId: string,
    channelId: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      let accumulatedContent = '';

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') {
            if (trimmed === 'data: [DONE]') {
              const endPayload: BotStreamChunkPayload = {
                botId,
                channelId,
                content: accumulatedContent,
                done: true,
              };
              this.eventEmitter.emit(
                BOT_INTERNAL_EVENT.BOT_STREAM_END,
                endPayload,
              );
            }
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta = data.choices?.[0]?.delta?.content || '';

              if (delta) {
                accumulatedContent += delta;
                const chunkPayload: BotStreamChunkPayload = {
                  botId,
                  channelId,
                  content: delta,
                  done: false,
                };
                this.eventEmitter.emit(
                  BOT_INTERNAL_EVENT.BOT_STREAM_CHUNK,
                  chunkPayload,
                );
              }
            } catch {
              // 跳过无法解析的行
            }
          }
        }
      });

      stream.on('end', () => resolve(accumulatedContent));
      stream.on('error', reject);
    });
  }

  private async nonStreamChat(
    bot: BotDocument,
    ctx: BotExecutionContext,
    baseUrl: string,
    apiKey: string,
    config: LlmConfigEmbedded,
    messages: ChatMessage[],
  ): Promise<void> {
    const response = await this.httpService.axiosRef.post(
      `${baseUrl}/chat/completions`,
      {
        model: config.model,
        messages,
        temperature: config.temperature ?? 0.7,
        max_tokens: config.maxTokens ?? 1024,
        stream: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 120_000,
      },
    );

    const content = response.data?.choices?.[0]?.message?.content || '';

    if (content.trim()) {
      await this.sendBotMessage(bot, ctx.channelId, content);
    }
  }

  private resolveBaseUrl(config: LlmConfigEmbedded): string {
    if (config.provider === LLM_PROVIDER.CUSTOM && config.customBaseUrl) {
      return config.customBaseUrl.replace(/\/$/, '');
    }
    return (
      PROVIDER_BASE_URLS[config.provider] ||
      PROVIDER_BASE_URLS[LLM_PROVIDER.OPENAI]
    );
  }

  private decryptApiKey(encryptedKey: string): string {
    try {
      return this.encryptionService.decrypt(encryptedKey);
    } catch {
      this.logger.warn('Failed to decrypt API key, using as plaintext');
      return encryptedKey;
    }
  }

  private getUserFriendlyError(error: Error, apiResponse?: unknown): string {
    const msg = error.message.toLowerCase();

    if (msg.includes('401') || msg.includes('unauthorized')) {
      return '⚠️ API Key is invalid. Please check your LLM configuration.';
    }
    if (msg.includes('429') || msg.includes('rate limit')) {
      return '⚠️ API rate limit exceeded. Please slow down your requests or check your API quota.';
    }
    if (msg.includes('insufficient') || msg.includes('quota')) {
      return '⚠️ API quota exceeded. Please check your API usage and limits.';
    }
    if (msg.includes('timeout')) {
      return '⚠️ AI response timeout. Please try again later.';
    }
    if (msg.includes('econnrefused') || msg.includes('network')) {
      return '⚠️ Network error while connecting to AI provider. Please check your network connection and try again.';
    }
    if (msg.includes('400')) {
      // Try to extract a meaningful message from the API response
      const detail = this.extractApiErrorMessage(apiResponse);
      return `⚠️ Bad request to AI provider${detail ? `: ${detail}` : '. Please check your model name and configuration.'}`;
    }

    return '⚠️ AI Agent temporarily unavailable. Please try again later.';
  }

  private extractApiErrorMessage(apiResponse: unknown): string {
    if (!apiResponse || typeof apiResponse !== 'object') return '';
    const resp = apiResponse as Record<string, unknown>;
    // OpenAI/DeepSeek format: { error: { message: '...' } }
    if (resp.error && typeof resp.error === 'object') {
      const errObj = resp.error as Record<string, unknown>;
      if (typeof errObj.message === 'string') return errObj.message;
    }

    if (typeof resp.message === 'string') return resp.message;
    // Gemini format: { error: { message: '...' } } or { error_description: '...' }
    if (typeof resp.error_description === 'string')
      return resp.error_description;
    return '';
  }

  private async sendBotMessage(
    bot: BotDocument,
    channelId: string,
    content: string,
  ): Promise<void> {
    const botUser = bot.userId as unknown as UserDocument;
    const botUserId = botUser?._id
      ? botUser._id.toString()
      : String(bot.userId);

    await this.chatService.createMessage(botUserId, {
      channelId,
      content,
    });
  }
}
