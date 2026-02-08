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
