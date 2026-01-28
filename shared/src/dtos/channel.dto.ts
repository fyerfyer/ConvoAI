import z from 'zod';
import { CHANNEL } from '../constants/channel.contant';
import { PERMISSIONOVERWRITE } from '../constants/permission.constant';

export const permissionOverwriteSchema = z.object({
  id: z.string(),
  type: z.enum(PERMISSIONOVERWRITE),
  allow: z.number().int().min(0),
  deny: z.number().int().min(0),
});

export type PermissionOverwriteDTO = z.infer<typeof permissionOverwriteSchema>;

export const createChannelSchema = z.object({
  name: z.string(),
  type: z.enum(CHANNEL).optional(),
  topic: z.string().optional(),
  parentId: z.string().optional(),
  permissionOverwrites: z.array(permissionOverwriteSchema).optional(),

  userLimit: z.number().min(0).optional(),
});

export type CreateChannelDTO = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z.object({
  name: z.string().optional(),
  topic: z.string().optional(),
  parentId: z.string().optional(),
  userLimit: z.number().min(0).optional(),
  position: z.number().min(0).optional(),
});

export type UpdateChannelDTO = z.infer<typeof updateChannelSchema>;
