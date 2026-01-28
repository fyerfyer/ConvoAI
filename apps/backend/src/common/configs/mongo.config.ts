import { registerAs } from '@nestjs/config';

export default registerAs('mongodb', () => ({
  mongodbUri: process.env.MONGODB_URI,
  mongodbName: process.env.MONGODB_NAME,
}));
