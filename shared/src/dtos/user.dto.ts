import z from 'zod';

export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Name is required' })
    .max(20, { message: 'Name must be at most 20 characters' }),

  email: z.email(),

  password: z
    .string()
    .min(6, { message: 'Password must be at least 6 characters' })
    .max(20, { message: 'Password must be at most 20 characters' }),
});

export type CreateUserDTO = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Name is required' })
    .max(20, { message: 'Name must be at most 20 characters' }),

  email: z.email(),

  avatar: z.url().nullable().optional(),
  banner: z.url().nullable().optional(),
});

export type UpdateUserDTO = z.infer<typeof updateUserSchema>;
