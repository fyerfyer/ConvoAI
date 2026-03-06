import z from 'zod';
import { AUTOMOD_ACTION, AUTOMOD_TRIGGER } from '../constants/automod.constant';

export const automodRuleSchema = z.object({
  enabled: z.boolean().default(true),
  trigger: z.enum([
    AUTOMOD_TRIGGER.KEYWORD,
    AUTOMOD_TRIGGER.SPAM,
    AUTOMOD_TRIGGER.TOXIC_CONTENT,
  ]),
  keywords: z.array(z.string().max(100)).max(200).optional(),
  toxicityThreshold: z.number().min(0).max(1).optional(),
  actions: z
    .array(
      z.enum([
        AUTOMOD_ACTION.BLOCK_MESSAGE,
        AUTOMOD_ACTION.MUTE_USER,
        AUTOMOD_ACTION.WARN_USER,
      ]),
    )
    .min(1),
  muteDurationMs: z.number().int().min(0).optional(),
  exemptRoles: z.array(z.string()).optional(),
});

export type AutoModRuleDTO = z.infer<typeof automodRuleSchema>;

export const updateAutomodConfigSchema = z.object({
  enabled: z.boolean(),
  rules: z.array(automodRuleSchema).max(20),
});

export type UpdateAutoModConfigDTO = z.infer<typeof updateAutomodConfigSchema>;
