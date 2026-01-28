export const STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  AWAY: 'away',
  DO_NOT_DISTURB: 'do_not_disturb',
} as const;

export type StatusKey = keyof typeof STATUS;
export type StatusValue = (typeof STATUS)[StatusKey];
