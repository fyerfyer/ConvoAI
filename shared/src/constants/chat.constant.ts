export const ATTACHMENT = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  FILE: 'file',
} as const;

export const MESSAGE_TYPE = {
  DEFAULT: 0,
  SYSTEM: 1,
  VOICE: 2,
} as const;

export type MessageTypeKey = keyof typeof MESSAGE_TYPE;
export type MessageTypeValue = (typeof MESSAGE_TYPE)[MessageTypeKey];

export type AttachmentKey = keyof typeof ATTACHMENT;
export type AttachmentValue = (typeof ATTACHMENT)[AttachmentKey];

export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
