import { registerAs } from '@nestjs/config';

export default registerAs('s3', () => ({
  endPoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
  publicUrl: process.env.MINIO_PUBLIC_URL || 'http://localhost:9000',
  region: 'us-east-1',
}));
