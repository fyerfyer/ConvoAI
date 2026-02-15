export const MESSAGE_EVENT = {
  CREATE_MESSAGE: 'message.create',
} as const;

export type MessageEvent = (typeof MESSAGE_EVENT)[keyof typeof MESSAGE_EVENT];

export const BOT_INTERNAL_EVENT = {
  BOT_MENTIONED: 'bot.mentioned',
  BOT_RESPONSE_READY: 'bot.response.ready',
  BOT_STREAM_CHUNK: 'bot.stream.chunk',
  BOT_STREAM_END: 'bot.stream.end',
  BOT_STREAM_START: 'bot.stream.start',
} as const;

export type BotInternalEvent =
  (typeof BOT_INTERNAL_EVENT)[keyof typeof BOT_INTERNAL_EVENT];
