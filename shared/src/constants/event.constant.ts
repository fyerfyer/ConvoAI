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

export const MEMBER_EVENT = {
  MEMBER_JOINED: 'member.joined',
  MEMBER_LEFT: 'member.left',
  MEMBER_MUTED: 'member.muted',
} as const;

export type MemberEvent = (typeof MEMBER_EVENT)[keyof typeof MEMBER_EVENT];

export const GUILD_EVENT = {
  PERMISSIONS_INVALIDATED: 'guild.permissions.invalidated',
} as const;

export type GuildEvent = (typeof GUILD_EVENT)[keyof typeof GUILD_EVENT];

export interface MemberEventPayload {
  guildId: string;
  userId: string;
  userName: string;
  userAvatar?: string | null;
}
