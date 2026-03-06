// ── AutoMod Trigger Types ──
export const AUTOMOD_TRIGGER = {
  KEYWORD: 'keyword',
  SPAM: 'spam',
  TOXIC_CONTENT: 'toxic_content',
} as const;

export type AutoModTriggerType =
  (typeof AUTOMOD_TRIGGER)[keyof typeof AUTOMOD_TRIGGER];

export const AUTOMOD_ACTION = {
  BLOCK_MESSAGE: 'block_message',
  MUTE_USER: 'mute_user',
  WARN_USER: 'warn_user',
} as const;

export type AutoModActionType =
  (typeof AUTOMOD_ACTION)[keyof typeof AUTOMOD_ACTION];

export const TOXICITY_LABEL = {
  TOXIC: 'toxic',
  SEVERE_TOXIC: 'severe_toxic',
  OBSCENE: 'obscene',
  THREAT: 'threat',
  INSULT: 'insult',
  IDENTITY_HATE: 'identity_hate',
} as const;

export type ToxicityLabel =
  (typeof TOXICITY_LABEL)[keyof typeof TOXICITY_LABEL];

export const AUTOMOD_DEFAULTS = {
  TOXICITY_THRESHOLD: 0.7,
  SPAM_WINDOW_MS: 10_000,
  SPAM_MAX_DUPLICATES: 3,
  MUTE_DURATION_MS: 5 * 60 * 1000, // 5 minutes
} as const;
