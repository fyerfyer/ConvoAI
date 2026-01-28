import { PERMISSIONS } from './permission.constant';

export const ROLE_CONSTANTS = {
  EVERYONE: '@everyone',
} as const;

export type RoleConstantsKey = keyof typeof ROLE_CONSTANTS;
export type RoleConstantsValue = (typeof ROLE_CONSTANTS)[RoleConstantsKey];

export const DEFAULT_EVERYONE_PERMISSIONS = PERMISSIONS.VIEW_CHANNELS;
