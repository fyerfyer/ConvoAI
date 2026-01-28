import { IUserPublic } from './user.interface';

export interface AuthResponse {
  user: IUserPublic;
  token: string;
}

export interface UserResponse {
  user: IUserPublic;
}
