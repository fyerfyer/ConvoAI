export interface JwtPayload {
  sub: string; // 用户 ID
  email: string; 
  name: string;
  isBot: boolean;
  iat?: number;
  exp?: number;
}