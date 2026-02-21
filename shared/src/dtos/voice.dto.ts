import z from 'zod';

export const voiceTokenRequestSchema = z.object({
  channelId: z.string().min(1),
});

export type VoiceTokenRequestDTO = z.infer<typeof voiceTokenRequestSchema>;
