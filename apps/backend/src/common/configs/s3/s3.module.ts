import { Global, Inject, Module, OnModuleInit } from '@nestjs/common';
import { S3Service } from './s3.service';
import { ConfigType } from '@nestjs/config';
import s3Config from '../s3.config';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { BUCKETS } from '@discord-platform/shared';
import { S3_INTERNAL, S3_PUBLIC } from './s3.constants';

const CORS_CONFIGURATION = {
  CORSRules: [
    {
      AllowedHeaders: ['*'],
      AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
      AllowedOrigins: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    },
  ],
};

// 公开读权限策略，给头像预览功能使用的
const PUBLIC_READ_POLICY = (bucketName: string) => ({
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Principal: { AWS: ['*'] },
      Action: ['s3:GetObject'],
      Resource: [`arn:aws:s3:::${bucketName}/*`],
    },
  ],
});

@Global()
@Module({
  providers: [
    {
      provide: S3_INTERNAL,
      useFactory: (s3Cfg: ConfigType<typeof s3Config>) => {
        return new S3Client({
          region: s3Cfg.region,
          endpoint: s3Cfg.endPoint,
          forcePathStyle: true,
          credentials: {
            accessKeyId: s3Cfg.accessKey,
            secretAccessKey: s3Cfg.secretKey,
          },
        });
      },
      inject: [s3Config.KEY],
    },
    {
      provide: S3_PUBLIC,
      useFactory: (s3Cfg: ConfigType<typeof s3Config>) => {
        return new S3Client({
          region: s3Cfg.region,
          endpoint: s3Cfg.endPoint,
          forcePathStyle: true,
          credentials: {
            accessKeyId: s3Cfg.accessKey,
            secretAccessKey: s3Cfg.secretKey,
          },
        });
      },
      inject: [s3Config.KEY],
    },
    S3Service,
  ],
  exports: [S3Service],
})
export class S3Module implements OnModuleInit {
  constructor(@Inject(S3_INTERNAL) private s3: S3Client) {}

  async onModuleInit() {
    for (const bucketName of Object.values(BUCKETS)) {
      try {
        // 检查 bucket 是否存在
        let bucketExists = false;
        try {
          await this.s3.send(new HeadBucketCommand({ Bucket: bucketName }));
          bucketExists = true;
          console.info(`Bucket already exists: ${bucketName}`);
        } catch (err) {
          if (
            err.name === 'NotFound' ||
            err.$metadata?.httpStatusCode === 404
          ) {
            // Bucket 不存在，创建它
            await this.s3.send(
              new CreateBucketCommand({
                Bucket: bucketName,
              }),
            );
            console.info(`Successfully created bucket: ${bucketName}`);
            bucketExists = true;
          } else {
            throw err;
          }
        }

        if (bucketExists) {
          // 尝试设置 CORS 配置 (MinIO 可能不支持)
          try {
            await this.s3.send(
              new PutBucketCorsCommand({
                Bucket: bucketName,
                CORSConfiguration: CORS_CONFIGURATION,
              }),
            );
            console.info(`Set CORS configuration for bucket: ${bucketName}`);
          } catch (corsErr) {
            // MinIO 通常返回 501 NotImplemented，这是正常的
            if (corsErr.$metadata?.httpStatusCode === 501) {
              console.info(
                `Skipping CORS configuration for ${bucketName} (MinIO does not support this feature)`,
              );
            } else {
              console.warn(
                `Failed to set CORS configuration for ${bucketName}:`,
                corsErr.message,
              );
            }
          }

          // 为 public bucket 设置公开读权限
          if (bucketName === BUCKETS.PUBLIC) {
            try {
              await this.s3.send(
                new PutBucketPolicyCommand({
                  Bucket: bucketName,
                  Policy: JSON.stringify(PUBLIC_READ_POLICY(bucketName)),
                }),
              );
              console.info(`Set public read policy for bucket: ${bucketName}`);
            } catch (policyErr) {
              // MinIO 可能也不支持 bucket policy
              if (policyErr.$metadata?.httpStatusCode === 501) {
                console.info(
                  `Skipping bucket policy for ${bucketName} (MinIO does not support this feature)`,
                );
              } else {
                console.warn(
                  `Failed to set bucket policy for ${bucketName}:`,
                  policyErr.message,
                );
              }
            }
          }
        }
      } catch (error) {
        console.error(
          `Failed to initialize bucket ${bucketName}:`,
          error.message,
        );
        // 不抛出错误，让应用继续启动
        // 如果 bucket 初始化失败，文件上传功能可能不可用，但不应该阻止整个应用启动
      }
    }
  }
}
