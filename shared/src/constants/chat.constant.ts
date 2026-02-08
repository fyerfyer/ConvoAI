export const ATTACHMENT = {
  IMAGE: 'image',
  VIDEO: 'video',
  FILE: 'file',
} as const;

export type AttachmentKey = keyof typeof ATTACHMENT;
export type AttachmentValue = (typeof ATTACHMENT)[AttachmentKey];
