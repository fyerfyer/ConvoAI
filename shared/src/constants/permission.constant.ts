export const PERMISSIONS = {
  // 通用权限
  VIEW_CHANNELS: 1 << 0, // 1
  MANAGE_GUILD: 1 << 1, // 2 (管理服务器)
  MANAGE_ROLES: 1 << 2, // 4

  // 文本权限
  SEND_MESSAGES: 1 << 3, // 8
  EMBED_LINKS: 1 << 4, // 16
  ATTACH_FILES: 1 << 5, // 32
  MENTION_EVERYONE: 1 << 6, // 64

  // 语音权限
  CONNECT: 1 << 7, // 128
  SPEAK: 1 << 8, // 256

  // 管理权限
  KICK_MEMBERS: 1 << 9, // 512
  BAN_MEMBERS: 1 << 10, // 1024
  MUTE_MEMBERS: 1 << 11, // 2048
  ADMINISTRATOR: 1 << 30, // 拥有此权限则无视所有限制
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export type PermissionValue = (typeof PERMISSIONS)[PermissionKey];

export const PERMISSIONOVERWRITE = {
  ROLE: 0,
  MEMBER: 1,
} as const;

export type PermissionOverwriteKey = keyof typeof PERMISSIONOVERWRITE;
export type PermissionOverwriteValue =
  (typeof PERMISSIONOVERWRITE)[PermissionOverwriteKey];
