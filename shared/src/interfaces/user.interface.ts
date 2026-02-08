import { StatusValue } from '../constants/status.constant';

// 用户公开信息（用于前端展示）
export interface IUserPublic {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  banner: string | null;
  status: StatusValue;
  isBot: boolean;
  createdAt: string;
}

export interface IUserSummary {
  id: string;
  name: string;
  avatar: string | null;
  isBot: boolean;
}
