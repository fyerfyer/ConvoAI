import { PermissionValue } from '@discord-platform/shared';
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

export const RequirePermissions = (permissions: PermissionValue) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
