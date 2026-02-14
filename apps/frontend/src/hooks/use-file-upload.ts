import { useState, useCallback } from 'react';
import { api } from '../lib/api-client';
import {
  ApiResponse,
  AttachmentDto,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from '@discord-platform/shared';

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface PresignedUrlResponse {
  uploadUrl: string;
  fileUrl: string;
  key: string;
}

export function useFileUpload(channelId: string) {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const uploadFiles = useCallback(
    async (files: File[]): Promise<AttachmentDto[]> => {
      if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
        throw new Error(`Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} files allowed`);
      }

      const maxMB = Math.round(MAX_ATTACHMENT_SIZE / (1024 * 1024));
      const oversized = files.filter((f) => f.size > MAX_ATTACHMENT_SIZE);
      if (oversized.length > 0) {
        const names = oversized.map((f) => f.name).join(', ');
        throw new Error(
          `File${oversized.length > 1 ? 's' : ''} too large (max ${maxMB}MB): ${names}`,
        );
      }

      const validFiles = files;
      if (validFiles.length === 0) return [];

      setIsUploading(true);
      setUploads(
        validFiles.map((f) => ({
          fileName: f.name,
          progress: 0,
          status: 'pending',
        })),
      );

      const attachments: AttachmentDto[] = [];

      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];

        try {
          setUploads((prev) =>
            prev.map((u, idx) =>
              idx === i ? { ...u, status: 'uploading', progress: 10 } : u,
            ),
          );

          // Step 1: Get presigned URL
          const presignRes = await api.post<ApiResponse<PresignedUrlResponse>>(
            `/channels/${channelId}/messages/attachments/presign`,
            {
              fileName: file.name,
              contentType: file.type || 'application/octet-stream',
              size: file.size,
            },
          );

          const presignData = presignRes.data;
          if (!presignData) throw new Error('No presigned URL returned');
          const { uploadUrl, fileUrl } = presignData;

          setUploads((prev) =>
            prev.map((u, idx) => (idx === i ? { ...u, progress: 30 } : u)),
          );

          // Step 2: Upload file directly to S3
          await fetch(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
            },
          });

          setUploads((prev) =>
            prev.map((u, idx) =>
              idx === i ? { ...u, status: 'done', progress: 100 } : u,
            ),
          );

          attachments.push({
            fileName: file.name,
            url: fileUrl,
            contentType: file.type || 'application/octet-stream',
            size: file.size,
          });
        } catch (err) {
          console.error(`Failed to upload ${file.name}:`, err);
          setUploads((prev) =>
            prev.map((u, idx) =>
              idx === i
                ? {
                    ...u,
                    status: 'error',
                    error: 'Upload failed',
                  }
                : u,
            ),
          );
        }
      }

      setIsUploading(false);
      return attachments;
    },
    [channelId],
  );

  const clearUploads = useCallback(() => {
    setUploads([]);
  }, []);

  const removeUpload = useCallback((index: number) => {
    setUploads((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    uploads,
    isUploading,
    uploadFiles,
    clearUploads,
    removeUpload,
  };
}
