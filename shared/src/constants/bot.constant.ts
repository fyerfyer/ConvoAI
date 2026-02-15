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
