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
  ROLLING: 'rolling',
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

// ── Memory 配置常量 ──
export const MEMORY_DEFAULTS = {
  SHORT_TERM_WINDOW_SIZE: 15,
  SUMMARY_TRIGGER_THRESHOLD: 30,
  SUMMARY_BATCH_SIZE: 40,
  SUMMARY_MAX_LENGTH: 2000,
  ENTITY_MAX_PER_USER: 200,
  ENTITY_DEFAULT_TTL_DAYS: 90,
  ENTITY_DECAY_INTERVAL_DAYS: 7,
  RAG_TOP_K: 5,
  RAG_SCORE_THRESHOLD: 0.6,
  EMBEDDING_BATCH_SIZE: 10,
} as const;

// ── Memory Job Types (BullMQ) ──
export const MEMORY_JOB = {
  SUMMARIZE: 'memory.summarize',
  EXTRACT_ENTITIES: 'memory.extract-entities',
  EMBED_CONVERSATION: 'memory.embed-conversation',
  DECAY_ENTITIES: 'memory.decay-entities',
} as const;

export type MemoryJobKey = keyof typeof MEMORY_JOB;
export type MemoryJobValue = (typeof MEMORY_JOB)[MemoryJobKey];

export const ENTITY_TYPE = {
  FACT: 'fact',
  PREFERENCE: 'preference',
  TASK: 'task',
  RELATIONSHIP: 'relationship',
} as const;

export type EntityTypeKey = keyof typeof ENTITY_TYPE;
export type EntityTypeValue = (typeof ENTITY_TYPE)[EntityTypeKey];

export const BOT_TRIGGER_TYPE = {
  MENTION: 'mention',
  SLASH_COMMAND: 'slash_command',
  SCHEDULED: 'scheduled',
  EVENT: 'event',
} as const;

export type BotTriggerTypeKey = keyof typeof BOT_TRIGGER_TYPE;
export type BotTriggerTypeValue = (typeof BOT_TRIGGER_TYPE)[BotTriggerTypeKey];

export const SLASH_PARAM_TYPE = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  USER: 'user',
} as const;

export type SlashParamTypeKey = keyof typeof SLASH_PARAM_TYPE;
export type SlashParamTypeValue = (typeof SLASH_PARAM_TYPE)[SlashParamTypeKey];

export const SLASH_HANDLER_TYPE = {
  PROMPT: 'prompt',
  TOOL: 'tool',
} as const;

export type SlashHandlerTypeKey = keyof typeof SLASH_HANDLER_TYPE;
export type SlashHandlerTypeValue =
  (typeof SLASH_HANDLER_TYPE)[SlashHandlerTypeKey];

export const SCHEDULE_ACTION_TYPE = {
  PROMPT: 'prompt',
  TEMPLATE_COMMAND: 'template_command',
  STATIC_MESSAGE: 'static_message',
} as const;

export type ScheduleActionTypeKey = keyof typeof SCHEDULE_ACTION_TYPE;
export type ScheduleActionTypeValue =
  (typeof SCHEDULE_ACTION_TYPE)[ScheduleActionTypeKey];

export const BOT_EVENT_SUB_TYPE = {
  MEMBER_JOIN: 'member_join',
  MEMBER_LEAVE: 'member_leave',
} as const;

export type BotEventSubTypeKey = keyof typeof BOT_EVENT_SUB_TYPE;
export type BotEventSubTypeValue =
  (typeof BOT_EVENT_SUB_TYPE)[BotEventSubTypeKey];

export const EVENT_ACTION_TYPE = {
  PROMPT: 'prompt',
  STATIC_MESSAGE: 'static_message',
} as const;

export type EventActionTypeKey = keyof typeof EVENT_ACTION_TYPE;
export type EventActionTypeValue =
  (typeof EVENT_ACTION_TYPE)[EventActionTypeKey];
