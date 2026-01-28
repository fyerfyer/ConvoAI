import { StatusValue } from '../constants/status.constant';

// 基础的用户公开信息 (用于展示头像、名字等)
export interface IUserPublic {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  banner: string | null;
  status: StatusValue;
  isBot: boolean;
  createdAt: string; // 传给前端通常是 ISO String
}
