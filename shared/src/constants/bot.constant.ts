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

// ── LLM 可用工具 ──
export const LLM_TOOL = {
  WEB_SEARCH: 'web-search',
  CODE_EXECUTION: 'code-execution',
  IMAGE_GENERATION: 'image-generation',
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
