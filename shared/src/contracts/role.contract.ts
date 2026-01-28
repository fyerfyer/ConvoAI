import z from 'zod';
import { createRoleSchema, updateRoleSchema } from '../dtos/role.dto';
import { ApiResponse } from '../interfaces/api.interface';

export const RoleContracts = {
  createRole: {
    path: 'guilds/:guildId/roles',
    method: 'POST',
    body: createRoleSchema,
  },

  updateRole: {
    path: 'guilds/:guildId/roles/:roleId',
    method: 'PATCH',
    body: updateRoleSchema,
  },

  deleteRole: {
    path: 'guilds/:guildId/roles/:roleId',
    method: 'DELETE',
  },
} as const;

export type IRoleContract = {
  createRole: {
    req: z.infer<typeof RoleContracts.createRole.body>;
    res: ApiResponse<any>; // 替换为实际的 Role 类型
  };

  updateRole: {
    req: z.infer<typeof RoleContracts.updateRole.body>;
    res: ApiResponse<any>; // 替换为实际的 Role 类型
  };

  deleteRole: {
    req: never;
    res: ApiResponse<void>;
  };
};
