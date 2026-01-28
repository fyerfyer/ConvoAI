import z from 'zod';

export const loginSchema = z.object({
  email: z.email(),

  password: z
    .string()
    .min(6, { message: 'Password must be at least 6 characters' })
    .max(20, { message: 'Password must be at most 20 characters' }),
});

export type LoginDTO = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
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

    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterDTO = z.infer<typeof registerSchema>;
