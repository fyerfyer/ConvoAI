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
  deleteRole: {
    req: never;
    res: ApiResponse<void>;
  };
};
