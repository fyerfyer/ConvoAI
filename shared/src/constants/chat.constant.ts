export const ATTACHMENT = {
  IMAGE: 'image',
  VIDEO: 'video',
  FILE: 'file',
} as const;

export type AttachmentKey = keyof typeof ATTACHMENT;
export type AttachmentValue = (typeof ATTACHMENT)[AttachmentKey];

export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
