import {
  AgentEventType,
  LlmProviderValue,
  LlmToolValue,
  TemplateIdValue,
  ExecutionModeValue,
  MemoryScopeValue,
} from '../constants/bot.constant';

export interface AgentContextMessage {
  role: 'user' | 'assistant';
  content: string;
  author: string;
  messageId: string;
  timestamp: string;
}

export interface AgentPayload {
  event: AgentEventType;
  botId: string;
  guildId: string;
  channelId: string;
  messageId: string;
  author: {
    id: string;
    name: string;
    avatar: string | null;
  };
  content: string;
  context: AgentContextMessage[];
  webhookCallbackUrl: string;
}

export interface AgentResponse {
  content: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string; icon_url?: string };
    timestamp?: string;
  }>;
}

export interface AgentStreamChunk {
  content: string;
  done?: boolean;
}

export interface BotStreamChunkPayload {
  botId: string;
  channelId: string;
  content: string;
  done: boolean;
}

export interface BotStreamStartPayload {
  botId: string;
  channelId: string;
  streamId: string;
}

// ── Template Bot 配置接口 ──

export interface WelcomeTemplateConfig {
  welcomeMessage: string;
  showMemberCount?: boolean;
}

export interface PollTemplateConfig {
  maxOptions?: number;
  defaultDuration?: number; // seconds
}

export interface GameTemplateConfig {
  enabledGames?: Array<'8ball' | 'roll' | 'guess' | 'rps'>;
  guessRange?: { min: number; max: number };
}

export interface ReminderTemplateConfig {
  maxRemindersPerUser?: number;
  maxDuration?: number; // seconds
}

export interface AutoResponderRule {
  trigger: string; // keyword or regex pattern
  response: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
}

export interface AutoResponderTemplateConfig {
  rules: AutoResponderRule[];
}

export type TemplateConfig =
  | WelcomeTemplateConfig
  | PollTemplateConfig
  | GameTemplateConfig
  | ReminderTemplateConfig
  | AutoResponderTemplateConfig;

// ── Managed LLM 配置接口 ──

export interface LlmConfig {
  provider: LlmProviderValue;
  apiKey: string; // 存储时加密，运行时解密
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  tools?: LlmToolValue[];
  customBaseUrl?: string; // provider='custom' 时使用
}

// ── 模板元信息（前端展示用）──

export interface TemplateInfo {
  id: TemplateIdValue;
  name: string;
  description: string;
  icon: string;
  category: 'utility' | 'fun' | 'moderation' | 'ai';
  configSchema: Record<string, TemplateConfigFieldSchema>;
}

export interface TemplateConfigFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  min?: number;
  max?: number;
}

// ── Memory 上下文（传递给 Runner 使用的记忆数据）──

export interface MemoryContext {
  // 滚动摘要（压缩的历史对话）
  rollingSummary: string;
  // 短期窗口消息（最近 N 条原始消息）
  recentMessages: AgentContextMessage[];
  // 已纳入摘要的消息总数
  summarizedMessageCount: number;
}

// ── Bot 执行上下文（传递给 Runner 的统一结构）──

export interface BotExecutionContext {
  botId: string;
  botUserId: string;
  botName: string;
  guildId: string;
  channelId: string;
  messageId: string;
  author: {
    id: string;
    name: string;
    avatar: string | null;
  };
  content: string; // 去除 @mention 后的纯内容
  rawContent: string; // 原始消息内容
  context: AgentContextMessage[];
  executionMode: ExecutionModeValue;
  channelBotId?: string;
  overrideSystemPrompt?: string;
  overrideTools?: LlmToolValue[];
  memoryScope?: MemoryScopeValue;
  memory?: MemoryContext;
}

// ── Channel Bot Binding（频道级 Bot 实例配置）──

export interface ChannelBotPolicy {
  canSummarize: boolean;
  canUseTools: boolean;
  maxTokensPerRequest: number;
}

export interface ChannelBotConfig {
  botId: string;
  channelId: string;
  guildId: string;
  enabled: boolean;
  overridePrompt?: string;
  overrideTools?: LlmToolValue[];
  memoryScope: MemoryScopeValue;
  policy: ChannelBotPolicy;
}
