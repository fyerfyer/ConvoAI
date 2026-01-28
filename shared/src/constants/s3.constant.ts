export const BUCKETS = {
  PUBLIC: 'discord-public',
  PRIVATE: 'discord-private',
} as const;

export type BucketsKey = keyof typeof BUCKETS;
export type BucketsValue = (typeof BUCKETS)[BucketsKey];

export const BUCKET_MAP = {
  avatar: BUCKETS.PUBLIC,
  guild_icon: BUCKETS.PUBLIC,
  attachment_preview: BUCKETS.PRIVATE, // 预览图也应该受限
  attachment: BUCKETS.PRIVATE,
} as const;

export type BucketMapKey = keyof typeof BUCKET_MAP;
export type BucketMapValue = (typeof BUCKET_MAP)[BucketMapKey];
