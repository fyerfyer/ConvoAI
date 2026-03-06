import z from 'zod';
import { AUTOMOD_ACTION, AUTOMOD_TRIGGER, ESCALATION_ACTION } from '../constants/automod.constant';

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

export const escalationThresholdSchema = z.object({
  count: z.number().int().min(1).max(100),
  action: z.enum([ESCALATION_ACTION.MUTE, ESCALATION_ACTION.KICK]),
  muteDurationMs: z.number().int().min(60000).optional(), // min 1 minute, only for mute
});

export type EscalationThresholdDTO = z.infer<typeof escalationThresholdSchema>;

export const escalationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  windowMs: z.number().int().min(60000).max(7 * 24 * 60 * 60 * 1000).optional(), // 1 min to 7 days
  thresholds: z.array(escalationThresholdSchema).max(5).default([]),
});

export type EscalationConfigDTO = z.infer<typeof escalationConfigSchema>;

export const updateAutomodConfigSchema = z.object({
  enabled: z.boolean(),
  rules: z.array(automodRuleSchema).max(20),
  escalation: escalationConfigSchema.optional(),
});

export type UpdateAutoModConfigDTO = z.infer<typeof updateAutomodConfigSchema>;
