import { BucketsValue } from '@discord-platform/shared';

export interface ImageResource {
  publicId: string;
  thumbnailId: string;
  thumbnail: string;
}

export interface ImageProcessingOptions {
  bucket: BucketsValue;
  thumbnailSize?: { width: number; height: number };
  thumbnailQuality?: number;
  thumbnailExtension?: string;
  logContext?: string;
}

export const IMAGE_PRESETS = {
  avatar: {
    thumbnailSize: { width: 200, height: 200 },
    thumbnailQuality: 90,
    thumbnailExtension: '-thumb.png',
    logContext: 'avatar',
  },
  guildIcon: {
    thumbnailSize: { width: 256, height: 256 },
    thumbnailQuality: 95,
    thumbnailExtension: '-thumb.png',
    logContext: 'guild_icon',
  },
  attachmentPreview: {
    thumbnailSize: { width: 400, height: 400 },
    thumbnailQuality: 85,
    thumbnailExtension: '-preview.png',
    logContext: 'attachment_preview',
  },
} as const;

export type ImagePresetKey = keyof typeof IMAGE_PRESETS;
export type ImagePresetValue = (typeof IMAGE_PRESETS)[ImagePresetKey];

export enum ImageType {
  AVATAR = 'avatar',
  ICON = 'icon',
  GUILD_ICON = 'guildIcon',
  ATTACHMENT_PREVIEW = 'attachmentPreview',
}
