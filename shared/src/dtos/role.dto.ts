import z from 'zod';

export const createRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Role name is required' })
    .max(32, { message: 'Role name must be at most 32 characters' }),
  permissions: z.number().int().min(0).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i, { message: 'Invalid color format' })
    .optional(),
  hoist: z.boolean().optional(),
  mentionable: z.boolean().optional(),
});

export type CreateRoleDTO = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Role name is required' })
    .max(32, { message: 'Role name must be at most 32 characters' })
    .optional(),
  permissions: z.number().int().min(0).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i, { message: 'Invalid color format' })
    .optional(),
  hoist: z.boolean().optional(),
  mentionable: z.boolean().optional(),
});

export type UpdateRoleDTO = z.infer<typeof updateRoleSchema>;
