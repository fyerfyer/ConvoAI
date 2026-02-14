import z from 'zod';

export const createGuildSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: 'Guild name must be at least 2 characters' })
    .max(100, { message: 'Guild name must be at most 100 characters' }),
  icon: z.url().optional(),
});

export type CreateGuildDTO = z.infer<typeof createGuildSchema>;

export const searchGuildsSchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type SearchGuildsDTO = z.infer<typeof searchGuildsSchema>;

export const createInviteSchema = z.object({
  maxUses: z.number().int().min(0).max(100).optional().default(0),
  maxAge: z.number().int().min(0).max(604800).optional().default(86400), // default 24h, max 7 days; 0 = never
});

export type CreateInviteDTO = z.infer<typeof createInviteSchema>;
