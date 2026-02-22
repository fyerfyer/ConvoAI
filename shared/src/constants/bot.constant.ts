export const BOT_TYPE = {
  CHATBOT: 'chatbot',
  AGENT: 'agent',
} as const;

export type BotTypeKey = keyof typeof BOT_TYPE;
export type BotTypeValue = (typeof BOT_TYPE)[BotTypeKey];

export const BOT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export type BotStatusKey = keyof typeof BOT_STATUS;
export type BotStatusValue = (typeof BOT_STATUS)[BotStatusKey];

// ── Bot 作用域 ──
export const BOT_SCOPE = {
  GUILD: 'guild',
  CHANNEL: 'channel',
} as const;

export type BotScopeKey = keyof typeof BOT_SCOPE;
export type BotScopeValue = (typeof BOT_SCOPE)[BotScopeKey];

// ── Channel Bot Memory 范围 ──
export const MEMORY_SCOPE = {
  CHANNEL: 'channel',
  EPHEMERAL: 'ephemeral',
} as const;

export type MemoryScopeKey = keyof typeof MEMORY_SCOPE;
export type MemoryScopeValue = (typeof MEMORY_SCOPE)[MemoryScopeKey];

// ── 执行模式 ──
export const EXECUTION_MODE = {
  WEBHOOK: 'webhook',
  BUILTIN: 'builtin',
  MANAGED_LLM: 'managed-llm',
} as const;

export type ExecutionModeKey = keyof typeof EXECUTION_MODE;
export type ExecutionModeValue = (typeof EXECUTION_MODE)[ExecutionModeKey];

// ── 内置模板 ID ──
export const TEMPLATE_ID = {
  WELCOME: 'welcome',
  POLL: 'poll',
  GAME: 'game',
  REMINDER: 'reminder',
  AUTO_RESPONDER: 'auto-responder',
} as const;

export type TemplateIdKey = keyof typeof TEMPLATE_ID;
export type TemplateIdValue = (typeof TEMPLATE_ID)[TemplateIdKey];

// ── LLM 提供商 ──
export const LLM_PROVIDER = {
  OPENAI: 'openai',
  DEEPSEEK: 'deepseek',
  GOOGLE: 'google',
  CUSTOM: 'custom',
} as const;

export type LlmProviderKey = keyof typeof LLM_PROVIDER;
export type LlmProviderValue = (typeof LLM_PROVIDER)[LlmProviderKey];

export const LLM_TOOL = {
  // 通用工具
  WEB_SEARCH: 'web-search',
  CODE_EXECUTION: 'code-execution',
  // Guild / Channel 专用工具
  SUMMARIZE_USER: 'summarize-user',
  CHANNEL_HISTORY: 'channel-history',
  GUILD_INFO: 'guild-info',
  MEMBER_LIST: 'member-list',
} as const;

export type LlmToolKey = keyof typeof LLM_TOOL;
export type LlmToolValue = (typeof LLM_TOOL)[LlmToolKey];

export const AGENT_EVENT_TYPE = {
  AGENT_MENTION: 'AGENT_MENTION',
} as const;

export type AgentEventType =
  (typeof AGENT_EVENT_TYPE)[keyof typeof AGENT_EVENT_TYPE];

export const BOT_EVENT = {
  BOT_RESPONSE: 'bot.response',
  BOT_STREAM_START: 'bot.stream.start',
  BOT_STREAM_CHUNK: 'bot.stream.chunk',
  BOT_STREAM_END: 'bot.stream.end',
  BOT_ERROR: 'bot.error',
} as const;

export type BotEvent = (typeof BOT_EVENT)[keyof typeof BOT_EVENT];
