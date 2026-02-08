import z from 'zod';

export const attachmentShema = z.object({
  fileName: z.string().min(1).max(255),
  url: z.url(),
  contentType: z.string().min(1),
  size: z.number().nonnegative(),
});

export type AttachmentDto = z.infer<typeof attachmentShema>;

export const createMessageDTOSchema = z.object({
  channelId: z.string(),
  content: z.string().min(1).max(4000),
  replyTo: z.string().optional(),
  nonce: z.string().optional(),
  attachments: z.array(attachmentShema).optional(),
});

export type CreateMessageDTO = z.infer<typeof createMessageDTOSchema>;

export const attachmentPresignedUrlDTOSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  size: z.number().nonnegative(),
});

export type AttachmentPresignedUrlDTO = z.infer<
  typeof attachmentPresignedUrlDTOSchema
>;
