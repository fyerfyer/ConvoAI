export const QUEUE_NAMES = {
  MESSAGE: 'message',
  BOT_EXECUTION: 'bot-execution',
  BOT_STREAM: 'bot-stream',
} as const;

export const MESSAGE_JOB = {
  BROADCAST: 'message.broadcast',
  BOT_DETECT: 'message.bot-detect',
} as const;

export const BOT_JOB = {
  DISPATCH: 'bot.dispatch',
} as const;

export const BOT_STREAM_JOB = {
  STREAM_EVENT: 'bot-stream.event',
} as const;

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoffDelay: 1000,
  removeOnCompleteAge: 3600,
  removeOnFailAge: 86400,
} as const;
