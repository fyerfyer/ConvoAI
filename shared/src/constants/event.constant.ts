export const MESSAGE_EVENT = {
  CREATE_MESSAGE: 'message.create',
} as const;

export type MessageEvent = (typeof MESSAGE_EVENT)[keyof typeof MESSAGE_EVENT];
