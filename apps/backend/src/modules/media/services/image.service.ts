import { BadRequestException, Injectable } from '@nestjs/common';
import { S3Service } from '../../../common/configs/s3/s3.service';
import { AppLogger } from '../../../common/configs/logger/logger.service';
import {
  IMAGE_PRESETS,
  ImageProcessingOptions,
  ImageResource,
  ImageType,
} from '../types/image.type';
import { BucketsValue } from '@discord-platform/shared';
import sharp from 'sharp';

@Injectable()
export class ImageService {
  constructor(
    private s3Service: S3Service,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(ImageService.name);
  }

  async processImage(
    userId: string,
    tempKey: string,
    options: ImageProcessingOptions,
  ): Promise<ImageResource> {
    const config = this.mergeWithDefaults(options);
    const {
      bucket,
      thumbnailSize,
      thumbnailQuality,
      thumbnailExtension,
      logContext,
    } = config;

    try {
      const exists = await this.s3Service.checkPublicObjectExists(
        bucket,
        tempKey,
      );
      if (!exists) {
        throw new BadRequestException(`${logContext} not found in storage`);
      }

      // Get metadata and validate it's an image
      const metadata = await this.s3Service.getPublicObjectMetadata(
        bucket,
        tempKey,
      );
      if (!metadata.ContentType?.startsWith('image/')) {
        await this.s3Service.deletePublicObject(bucket, tempKey);
        throw new BadRequestException('Uploaded file is not an image');
      }

      // Generate thumbnail key
      const thumbnailKey = tempKey.replace(
        /\.(jpg|jpeg|png|gif|webp)$/i,
        thumbnailExtension,
      );

      // Get original image stream and generate thumbnail
      const originalStream = await this.s3Service.getObjectStream(
        bucket,
        tempKey,
      );

      const thumbnailTransform = sharp()
        .resize(thumbnailSize.width, thumbnailSize.height, {
          fit: 'cover',
          position: 'center',
        })
        .png({ quality: thumbnailQuality });

      const thumbnailStream = originalStream.pipe(thumbnailTransform);

      // Collect thumbnail data
      const chunks: Buffer[] = [];
      for await (const chunk of thumbnailStream) {
        chunks.push(chunk);
      }
      const thumbnailBuffer = Buffer.concat(chunks);

      // Upload thumbnail
      await this.s3Service.putObject(
        bucket,
        thumbnailKey,
        thumbnailBuffer,
        thumbnailBuffer.length,
        'image/png',
      );

      const thumbnailUrl = this.s3Service.getPublicUrl(bucket, thumbnailKey);

      this.logger.info(`${logContext} processed successfully`, {
        userId,
        originalKey: tempKey,
        thumbnailKey,
        type: logContext,
      });

      return {
        publicId: tempKey,
        thumbnailId: thumbnailKey,
        thumbnail: thumbnailUrl,
      };
    } catch (error) {
      this.logger.exception(
        `Failed to process ${logContext}`,
        error instanceof Error ? error : new Error(String(error)),
        {
          userId,
          tempKey,
          type: logContext,
        },
      );
      throw error;
    }
  }

  async processImageWithPreset(
    userId: string,
    tempKey: string,
    type: ImageType,
    bucket: BucketsValue,
  ): Promise<ImageResource> {
    const preset = IMAGE_PRESETS[type];
    return this.processImage(userId, tempKey, { ...preset, bucket });
  }

  async deleteImage(
    key: string,
    bucket: BucketsValue,
    thumbnailExtension = '-thumb.png',
  ): Promise<void> {
    if (!key) return;

    try {
      // Delete original image
      await this.s3Service.deletePublicObject(bucket, key);

      // Try to delete thumbnail
      const thumbnailKey = key.replace(
        /\.(jpg|jpeg|png|gif|webp)$/i,
        thumbnailExtension,
      );

      const thumbnailExists = await this.s3Service.checkPublicObjectExists(
        bucket,
        thumbnailKey,
      );

      if (thumbnailExists) {
        await this.s3Service.deletePublicObject(bucket, thumbnailKey);
      }

      this.logger.info('Image deleted successfully', {
        key,
        bucket,
      });
    } catch (error) {
      this.logger.exception(
        'Failed to delete image',
        error instanceof Error ? error : new Error(String(error)),
        {
          key,
          bucket,
        },
      );
      throw error;
    }
  }

  getImageUrl(bucket: BucketsValue, publicId: string): string {
    return this.s3Service.getPublicUrl(bucket, publicId);
  }

  private mergeWithDefaults(
    options: ImageProcessingOptions,
  ): Required<ImageProcessingOptions> {
    return {
      bucket: options.bucket,
      thumbnailSize: options.thumbnailSize ?? { width: 200, height: 200 },
      thumbnailQuality: options.thumbnailQuality ?? 90,
      thumbnailExtension: options.thumbnailExtension ?? '-thumb.png',
      logContext: options.logContext ?? 'image',
    };
  }
}
