import z from 'zod';

export const createBotDTOSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Bot name is required' })
    .max(50, { message: 'Bot name must be at most 50 characters' }),
  guildId: z.string(),
  type: z.enum(['chatbot', 'agent']).default('chatbot'),
  webhookUrl: z.string().url({ message: 'Invalid webhook URL' }),
  description: z.string().max(500).optional().default(''),
  avatar: z.url().optional(),
});

export type CreateBotDTO = z.infer<typeof createBotDTOSchema>;

export const updateBotDTOSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  webhookUrl: z.url().optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  avatar: z.url().optional(),
});

export type UpdateBotDTO = z.infer<typeof updateBotDTOSchema>;

const embedFieldSchema = z.object({
  name: z.string(),
  value: z.string(),
  inline: z.boolean().optional(),
});

const embedSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  url: z.url().optional(),
  color: z.number().optional(),
  fields: z.array(embedFieldSchema).optional(),
  footer: z
    .object({
      text: z.string(),
      icon_url: z.string().optional(),
    })
    .optional(),
  timestamp: z.string().optional(),
});

export const webhookMessageDTOSchema = z.object({
  content: z.string().min(1).max(4000),
  embeds: z.array(embedSchema).optional(),
});

export type WebhookMessageDTO = z.infer<typeof webhookMessageDTOSchema>;
