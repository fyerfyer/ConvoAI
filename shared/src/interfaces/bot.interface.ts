import {
  AgentEventType,
  LlmProviderValue,
  LlmToolValue,
  TemplateIdValue,
  ExecutionModeValue,
  MemoryScopeValue,
  SlashParamTypeValue,
  SlashHandlerTypeValue,
  ScheduleActionTypeValue,
  BotEventSubTypeValue,
  EventActionTypeValue,
  BotTriggerTypeValue,
} from '../constants/bot.constant';

export interface AgentContextMessage {
  role: 'user' | 'assistant';
  content: string;
  author: string;
  authorId?: string;
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
  // 用户相关知识（从 UserKnowledge 查询）
  userKnowledge?: UserKnowledgeEntry[];
  // RAG 检索到的相关历史片段
  ragContext?: RagContextEntry[];
}

// ── User Knowledge (per-user memory) ──
export interface UserKnowledgeEntry {
  fact: string;
  entityType: string;
  source: string;
  relevanceScore: number;
  extractedAt: string;
  expiresAt?: string;
}

// ── RAG Context Entry (from vector search) ──
export interface RagContextEntry {
  content: string;
  score: number;
  channelId: string;
  timestamp: string;
}

// ── Unread Tracking ──
export interface UnreadInfo {
  channelId: string;
  count: number;
  lastMessageId?: string;
  lastMessageAt?: string;
}

export interface UnreadUpdatePayload {
  channelId: string;
  count: number;
  lastMessageId: string;
  lastMessageAt: string;
}

// ── Memory Job Payloads ──
export interface SummarizeJobPayload {
  botId: string;
  channelId: string;
  guildId: string;
  botName: string;
  memoryScope: string;
}

export interface ExtractEntitiesJobPayload {
  botId: string;
  channelId: string;
  guildId: string;
  userId: string;
  userName: string;
  messages: AgentContextMessage[];
}

export interface EmbedConversationJobPayload {
  botId: string;
  channelId: string;
  guildId: string;
  messages: AgentContextMessage[];
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
  // 触发上下文（slash command / schedule / event）
  trigger?: TriggerContext;
}

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

export interface SlashCommandParam {
  name: string;
  description: string;
  type: SlashParamTypeValue;
  required: boolean;
}

export interface SlashCommandHandler {
  type: SlashHandlerTypeValue;
  promptTemplate?: string;
  toolId?: string; // 绑定到某个 LLM tool
}

export interface SlashCommand {
  name: string; // 命令名（不含 / 前缀）
  description: string;
  params: SlashCommandParam[];
  handler: SlashCommandHandler;
}

export interface ScheduleAction {
  type: ScheduleActionTypeValue;
  prompt?: string; // type='prompt' 时使用
  command?: string; // type='template_command' 时使用
  message?: string; // type='static_message' 时使用
}

export interface BotSchedule {
  id: string;
  cron: string;
  channelId: string;
  action: ScheduleAction;
  enabled: boolean;
  timezone?: string;
  description?: string;
}

export interface EventAction {
  type: EventActionTypeValue;
  prompt?: string; // type='prompt' 时使用
  message?: string; // type='static_message' 时, 支持 {user}/{guild} 变量
}

export interface BotEventSubscription {
  eventType: BotEventSubTypeValue;
  channelId: string; // 触发时发送到哪个频道
  action: EventAction;
  enabled: boolean;
}

export interface TriggerContext {
  type: BotTriggerTypeValue;
  // slash_command 触发时
  slashCommand?: {
    name: string;
    args: Record<string, string>;
    raw: string;
  };
  // scheduled 触发时
  schedule?: {
    scheduleId: string;
    cron: string;
  };
  // event 触发时
  event?: {
    eventType: BotEventSubTypeValue;
    userId: string;
    userName: string;
    userAvatar?: string | null;
  };
}
