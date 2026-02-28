export const QUEUE_NAMES = {
  MESSAGE: 'message',
  BOT_STREAM: 'bot-stream',
  MEMORY: 'memory',
} as const;

export const MESSAGE_JOB = {
  BROADCAST: 'message.broadcast',
  BOT_DETECT: 'message.bot-detect',
} as const;

export const BOT_STREAM_JOB = {
  STREAM_EVENT: 'bot-stream.event',
} as const;

// Bot Stream 高频 chunk 通过 Redis PubSub 广播
// 跳过队列存储和磁盘 IO 来达到更高吞吐量
export const BOT_STREAM_PUBSUB_CHANNEL = 'bot:stream:chunk';

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoffDelay: 1000,
  removeOnCompleteAge: 3600,
  removeOnFailAge: 86400,
} as const;
