import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { BucketsValue } from '@discord-platform/shared';
import { Readable } from 'stream';

@Injectable()
export class S3Service {
  constructor(
    @Inject('S3_INTERNAL') private s3InternalClient: S3Client,
    @Inject('S3_PUBLIC') private s3PublicClient: S3Client,
  ) {}

  // 生成简单上传的预签名 URL
  // 用于小文件上传
  async getPutUrl(
    bucketName: BucketsValue,
    objectKey: string,
    mimeType: string,
    expireTime = 3600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: mimeType,
    });

    const url = await getSignedUrl(this.s3PublicClient, command, {
      expiresIn: expireTime,
    });
    return url;
  }

  // 生成下载的预签名 URL
  // 用于私有 bucket 的文件访问
  async getGetUrl(
    bucketName: BucketsValue,
    objectKey: string,
    expireTime = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    const url = await getSignedUrl(this.s3PublicClient, command, {
      expiresIn: expireTime,
    });
    return url;
  }

  async checkPublicObjectExists(
    bucketName: BucketsValue,
    objectKey: string,
  ): Promise<boolean> {
    return this.checkObjectExists(bucketName, objectKey, this.s3PublicClient);
  }

  async checkInternalObjectExists(
    bucketName: BucketsValue,
    objectKey: string,
  ): Promise<boolean> {
    return this.checkObjectExists(bucketName, objectKey, this.s3InternalClient);
  }

  async getPublicObjectMetadata(bucketName: BucketsValue, objectKey: string) {
    return this.getObjectMetadata(bucketName, objectKey, this.s3PublicClient);
  }

  async getInternalObjectMetadata(bucketName: BucketsValue, objectKey: string) {
    return this.getObjectMetadata(bucketName, objectKey, this.s3InternalClient);
  }

  async deletePublicObject(
    bucketName: BucketsValue,
    objectKey: string,
  ): Promise<void> {
    return this.deleteObject(bucketName, objectKey, this.s3PublicClient);
  }

  async deleteInternalObject(
    bucketName: BucketsValue,
    objectKey: string,
  ): Promise<void> {
    return this.deleteObject(bucketName, objectKey, this.s3InternalClient);
  }
  private async getObjectMetadata(
    bucketName: BucketsValue,
    objectKey: string,
    s3Client: S3Client,
  ) {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    return s3Client.send(command);
  }

  private async checkObjectExists(
    bucketName: BucketsValue,
    objectKey: string,
    s3client: S3Client,
  ): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });
      await s3client.send(command);
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((error as any).name === 'NotFound' ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (error as any).name === 'NoSuchKey')
      ) {
        return false;
      }
      throw error;
    }
  }

  private async deleteObject(
    bucketName: BucketsValue,
    objectKey: string,
    s3Client: S3Client,
  ): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    await s3Client.send(command);
  }

  async getObjectStream(
    bucketName: BucketsValue,
    objectKey: string,
  ): Promise<Readable> {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    const { Body } = await this.s3InternalClient.send(command);
    return Body as Readable;
  }

  async putObject(
    bucketName: BucketsValue,
    objectKey: string,
    body: Buffer | Uint8Array | Blob | Readable | string,
    contentLength: number,
    mimeType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: body,
      ContentLength: contentLength,
      ContentType: mimeType,
      Metadata: metadata,
    });

    await this.s3InternalClient.send(command);
  }

  getPublicUrl(bucketName: BucketsValue, objectKey: string): string {
    const publicBase = process.env.S3_PUBLIC_URL || 'http://localhost:9000';
    return `${publicBase}/${bucketName}/${objectKey}`;
  }
}
