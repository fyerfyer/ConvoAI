import { registerAs } from '@nestjs/config';

export default registerAs('logger', () => ({
  level: process.env.LOG_LEVEL || 'info',
  prettyPrint: process.env.NODE_ENV !== 'production',
}));
