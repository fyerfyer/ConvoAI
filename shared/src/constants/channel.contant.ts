export const CHANNEL = {
  GUILD_TEXT: 1 << 0,
  GUILD_VOICE: 1 << 1,
  GUILD_CATEGORY: 1 << 2,
} as const;

export type ChannelKey = keyof typeof CHANNEL;
export type ChannelValue = (typeof CHANNEL)[ChannelKey];

export const CHANNEL_NAME = {
  GENERAL: 'general',
} as const;
