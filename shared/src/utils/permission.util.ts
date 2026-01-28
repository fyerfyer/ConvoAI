import { PERMISSIONS } from '../constants/permission.constant';

export class PermissionUtil {
  static has(userPerms: number, requiredPerm: number): boolean {
    // 如果拥有管理员权限，直接返回 true
    if ((userPerms & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR) {
      return true;
    }
    return (userPerms & requiredPerm) === requiredPerm;
  }

  static add(currentPerms: number, newPerm: number): number {
    return currentPerms | newPerm;
  }

  static remove(currentPerms: number, permToRemove: number): number {
    return currentPerms & ~permToRemove;
  }
}
