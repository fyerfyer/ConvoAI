import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Readable } from 'stream';

import { BotDocument, LlmConfigEmbedded } from '../schemas/bot.schema';
import { EncryptionService } from '../crypto/encryption.service';
import { ChatService } from '../../chat/chat.service';
import {
  OpenAITool,
  ToolExecutorService,
} from '../tools/tool-executor.service';
import {
  ContextBuilder,
  ChatMessage,
} from '../context/context-builder.service';
import { MemoryService } from '../../memory/services/memory.service';
import { UserDocument } from '../../user/schemas/user.schema';
import { BotStreamProducer } from '../bot-stream.producer';

import {
  BotExecutionContext,
  BotStreamChunkPayload,
  LLM_PROVIDER,
  MEMORY_SCOPE,
} from '@discord-platform/shared';
import { AppLogger } from '../../../common/configs/logger/logger.service';

// Provider -> Base URL 映射
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
    private readonly contextBuilder: ContextBuilder,
    private readonly memoryService: MemoryService,
    private readonly botStreamProducer: BotStreamProducer,
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

      await this.botStreamProducer.emitStreamEnd({
        botId: ctx.botId,
        channelId: ctx.channelId,
        content: '',
        done: true,
      });
      return;
    }

    try {
      const apiKey = this.decryptApiKey(llmConfig.apiKey);
      const baseUrl = this.resolveBaseUrl(llmConfig);

      // 从 ChannelBot 绑定注入的策略
      const policy = ctx.policy;

      // 使用 ContextBuilder 组装完整的消息序列
      const messages = this.contextBuilder.buildMessages(llmConfig, ctx);

      // Channel 覆写 + policy 裁剪
      let toolNames = ctx.overrideTools ?? llmConfig.tools;
      if (policy?.canUseTools === false) {
        toolNames = [];
      }
      const tools = this.toolExecutor.resolveTools(toolNames);

      // Policy 覆写 maxTokens
      const effectiveMaxTokens =
        policy?.maxTokensPerRequest ?? llmConfig.maxTokens ?? 1024;

      this.logger.debug(
        `[LlmRunner] Calling ${llmConfig.provider}/${llmConfig.model} for bot ${ctx.botId} (tools: ${tools.length}, messages: ${messages.length}, baseUrl: ${baseUrl}, memory: ${ctx.memory?.rollingSummary ? 'yes' : 'no'}, maxTokens: ${effectiveMaxTokens}, canUseTools: ${policy?.canUseTools ?? true})`,
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
          effectiveMaxTokens,
        );
      } else {
        // 流式请求
        await this.streamChat(
          bot,
          ctx,
          baseUrl,
          apiKey,
          llmConfig,
          messages,
          effectiveMaxTokens,
        );
      }

      // 交互完成后异步更新记忆
      this.updateMemoryInBackground(ctx);
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

      // 不管怎么样都发送 End event 让前端不一直显示 thinking
      await this.botStreamProducer.emitStreamEnd({
        botId: ctx.botId,
        channelId: ctx.channelId,
        content: '',
        done: true,
      });
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
    effectiveMaxTokens?: number,
  ): Promise<void> {
    const conversationMessages = [...messages];
    const maxTokens = effectiveMaxTokens ?? config.maxTokens ?? 1024;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.httpService.axiosRef.post(
        `${baseUrl}/chat/completions`,
        {
          model: config.model,
          messages: conversationMessages,
          temperature: config.temperature ?? 0.7,
          max_tokens: maxTokens,
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

      // 通知前端结束（清除 Thinking 状态）
      await this.botStreamProducer.emitStreamEnd({
        botId: ctx.botId,
        channelId: ctx.channelId,
        content: content,
        done: true,
      });
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

    // 通知前端结束（清除 Thinking 状态）
    await this.botStreamProducer.emitStreamEnd({
      botId: ctx.botId,
      channelId: ctx.channelId,
      content: '',
      done: true,
    });
  }

  private updateMemoryInBackground(ctx: BotExecutionContext): void {
    const memoryScope = ctx.memoryScope ?? MEMORY_SCOPE.CHANNEL;
    if (memoryScope === MEMORY_SCOPE.EPHEMERAL) return;

    // Policy:canSummarize 控制是否持久化记忆（摘要、实体、RAG）
    const canSummarize = ctx.policy?.canSummarize ?? true;

    this.memoryService
      .updateMemoryAfterInteraction(
        ctx.botId,
        ctx.channelId,
        ctx.guildId,
        ctx.botName,
        memoryScope,
        ctx.author.id,
        ctx.author.name,
        canSummarize,
      )
      .catch((err) => {
        this.logger.error(
          `[LlmRunner] Memory update failed for bot ${ctx.botId}: ${err.message}`,
          err.stack,
        );
      });
  }

  private async streamChat(
    bot: BotDocument,
    ctx: BotExecutionContext,
    baseUrl: string,
    apiKey: string,
    config: LlmConfigEmbedded,
    messages: ChatMessage[],
    effectiveMaxTokens?: number,
  ): Promise<void> {
    let accumulatedContent = '';
    const maxTokens = effectiveMaxTokens ?? config.maxTokens ?? 1024;

    // 注意：BOT_STREAM_START 已经在 AgentRunner.dispatch 中发送过了，
    // 不再重复发送，避免前端出现多余的 "Thinking..."

    try {
      const response = await this.httpService.axiosRef.post(
        `${baseUrl}/chat/completions`,
        {
          model: config.model,
          messages,
          temperature: config.temperature ?? 0.7,
          max_tokens: maxTokens,
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
      await this.botStreamProducer.emitStreamEnd(endPayload);

      // 尝试非流式回退
      this.logger.warn(
        `[LlmRunner] Streaming failed for bot ${ctx.botId}, falling back to non-streaming`,
      );
      await this.nonStreamChat(
        bot,
        ctx,
        baseUrl,
        apiKey,
        config,
        messages,
        maxTokens,
      );
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
      let streamEndEmitted = false;

      const emitEndOnce = (content: string) => {
        if (streamEndEmitted) return;
        streamEndEmitted = true;
        const endPayload: BotStreamChunkPayload = {
          botId,
          channelId,
          content,
          done: true,
        };
        this.botStreamProducer.emitStreamEnd(endPayload);
      };

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') {
            if (trimmed === 'data: [DONE]') {
              emitEndOnce(accumulatedContent);
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
                this.botStreamProducer.emitStreamChunk(chunkPayload);
              }
            } catch {
              // 跳过无法解析的行
            }
          }
        }
      });

      stream.on('end', () => {
        // 确保在流结束时发送 stream:end（防止部分 provider 不发送 [DONE]）
        emitEndOnce(accumulatedContent);
        resolve(accumulatedContent);
      });
      stream.on('error', (err) => {
        emitEndOnce(accumulatedContent);
        reject(err);
      });
    });
  }

  private async nonStreamChat(
    bot: BotDocument,
    ctx: BotExecutionContext,
    baseUrl: string,
    apiKey: string,
    config: LlmConfigEmbedded,
    messages: ChatMessage[],
    effectiveMaxTokens?: number,
  ): Promise<void> {
    const maxTokens = effectiveMaxTokens ?? config.maxTokens ?? 1024;
    const response = await this.httpService.axiosRef.post(
      `${baseUrl}/chat/completions`,
      {
        model: config.model,
        messages,
        temperature: config.temperature ?? 0.7,
        max_tokens: maxTokens,
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
