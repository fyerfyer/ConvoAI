import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
}));
