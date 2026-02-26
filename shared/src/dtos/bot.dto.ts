import z from 'zod';

// ── 作用域 / 执行模式枚举 ──
const botScopeEnum = z.enum(['guild', 'channel']);
const memoryScopeEnum = z.enum(['channel', 'ephemeral']);
const executionModeEnum = z.enum(['webhook', 'builtin', 'managed-llm']);
const templateIdEnum = z.enum([
  'welcome',
  'poll',
  'game',
  'reminder',
  'auto-responder',
]);
const llmProviderEnum = z.enum(['openai', 'deepseek', 'google', 'custom']);
const llmToolEnum = z.enum([
  'web-search',
  'code-execution',
  'summarize-user',
  'channel-history',
  'guild-info',
  'member-list',
]);

// ── Slash Command Schemas ──
const slashParamTypeEnum = z.enum(['string', 'number', 'boolean', 'user']);
const slashHandlerTypeEnum = z.enum(['prompt', 'tool']);

const slashCommandParamSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(32)
    .regex(
      /^[a-z0-9_-]+$/,
      'Param name must be lowercase alphanumeric with - or _',
    ),
  description: z.string().max(100).default(''),
  type: slashParamTypeEnum.default('string'),
  required: z.boolean().default(false),
});

const slashCommandHandlerSchema = z.object({
  type: slashHandlerTypeEnum,
  promptTemplate: z.string().max(2000).optional(),
  toolId: z.string().optional(),
});

const slashCommandSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(32)
    .regex(
      /^[a-z0-9_-]+$/,
      'Command name must be lowercase alphanumeric with - or _',
    ),
  description: z.string().max(100).default(''),
  params: z.array(slashCommandParamSchema).max(10).default([]),
  handler: slashCommandHandlerSchema,
});

// ── Schedule Schemas ──
const scheduleActionTypeEnum = z.enum([
  'prompt',
  'template_command',
  'static_message',
]);

const scheduleActionSchema = z.object({
  type: scheduleActionTypeEnum,
  prompt: z.string().max(2000).optional(),
  command: z.string().max(500).optional(),
  message: z.string().max(2000).optional(),
});

const botScheduleSchema = z.object({
  id: z.string().min(1),
  cron: z.string().min(9).max(100), // e.g. "0 9 * * *"
  channelId: z.string().min(1),
  action: scheduleActionSchema,
  enabled: z.boolean().default(true),
  timezone: z.string().max(50).optional(),
  description: z.string().max(200).optional(),
});

// ── Event Subscription Schemas ──
const botEventSubTypeEnum = z.enum(['member_join', 'member_leave']);
const eventActionTypeEnum = z.enum(['prompt', 'static_message']);

const eventActionSchema = z.object({
  type: eventActionTypeEnum,
  prompt: z.string().max(2000).optional(),
  message: z.string().max(2000).optional(),
});

const botEventSubscriptionSchema = z.object({
  eventType: botEventSubTypeEnum,
  channelId: z.string().min(1),
  action: eventActionSchema,
  enabled: z.boolean().default(true),
});

// ── LLM 配置 Schema ──
const llmConfigSchema = z.object({
  provider: llmProviderEnum,
  apiKey: z.string().min(1, 'API Key is required'),
  model: z.string().min(1, 'Model name is required'),
  systemPrompt: z.string().max(4000).default('You are a helpful assistant.'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(16384).default(1024),
  tools: z.array(llmToolEnum).optional(),
  customBaseUrl: z.string().url().optional(),
});

// ── 模板配置 Schemas ──
const welcomeConfigSchema = z.object({
  welcomeMessage: z.string().max(1000).default('Welcome to the server! 🎉'),
  showMemberCount: z.boolean().optional().default(false),
});

const pollConfigSchema = z.object({
  maxOptions: z.number().min(2).max(10).optional().default(6),
  defaultDuration: z.number().min(60).max(86400).optional().default(3600),
});

const gameConfigSchema = z.object({
  enabledGames: z
    .array(z.enum(['8ball', 'roll', 'guess', 'rps']))
    .optional()
    .default(['8ball', 'roll', 'guess', 'rps']),
  guessRange: z
    .object({
      min: z.number().default(1),
      max: z.number().default(100),
    })
    .optional()
    .default({ min: 1, max: 100 }),
});

const reminderConfigSchema = z.object({
  maxRemindersPerUser: z.number().min(1).max(25).optional().default(10),
  maxDuration: z.number().min(60).max(604800).optional().default(86400),
});

const autoResponderRuleSchema = z.object({
  trigger: z.string().min(1).max(200),
  response: z.string().min(1).max(1000),
  isRegex: z.boolean().optional().default(false),
  caseSensitive: z.boolean().optional().default(false),
});

const autoResponderConfigSchema = z.object({
  rules: z.array(autoResponderRuleSchema).min(1).max(50),
});

// ── Create Bot DTO (支持三种执行模式) ──
export const createBotDTOSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: 'Bot name is required' })
      .max(50, { message: 'Bot name must be at most 50 characters' }),
    guildId: z.string(),
    type: z.enum(['chatbot', 'agent']).default('chatbot'),
    description: z.string().max(500).optional().default(''),
    avatar: z.string().optional(),

    // Bot 作用域: 'guild' 全局监听, 'channel' 需要显式绑定频道
    scope: botScopeEnum.default('channel'),

    // Channel-scope 时，创建后自动绑定的频道 ID
    channelId: z.string().optional(),

    // 执行模式 (默认 webhook 保持向后兼容)
    executionMode: executionModeEnum.default('webhook'),

    // webhook 模式
    webhookUrl: z.string().url({ message: 'Invalid webhook URL' }).optional(),

    // builtin 模式
    templateId: templateIdEnum.optional(),
    templateConfig: z.record(z.string(), z.unknown()).optional(),

    // managed-llm 模式
    llmConfig: llmConfigSchema.optional(),

    // ── 响应触发器（所有模式可选配置）──
    // Slash Commands
    commands: z.array(slashCommandSchema).max(25).optional(),
    // 定时调度
    schedules: z.array(botScheduleSchema).max(10).optional(),
    // 事件订阅
    eventSubscriptions: z.array(botEventSubscriptionSchema).max(10).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.executionMode === 'webhook' && !data.webhookUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'webhookUrl is required for webhook mode',
        path: ['webhookUrl'],
      });
    }
    if (data.executionMode === 'builtin' && !data.templateId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'templateId is required for builtin mode',
        path: ['templateId'],
      });
    }
    if (data.executionMode === 'managed-llm' && !data.llmConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'llmConfig is required for managed-llm mode',
        path: ['llmConfig'],
      });
    }
  });

export type CreateBotDTO = z.infer<typeof createBotDTOSchema>;

// ── Update Bot DTO ──
export const updateBotDTOSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  avatar: z.string().optional(),

  // 允许更新执行配置
  webhookUrl: z.string().url().optional(),
  templateConfig: z.record(z.string(), z.unknown()).optional(),
  llmConfig: llmConfigSchema.partial().optional(),

  // 响应触发器更新
  commands: z.array(slashCommandSchema).max(25).optional(),
  schedules: z.array(botScheduleSchema).max(10).optional(),
  eventSubscriptions: z.array(botEventSubscriptionSchema).max(10).optional(),
});

export type UpdateBotDTO = z.infer<typeof updateBotDTOSchema>;

// ── Webhook Message DTO (不变) ──
const embedFieldSchema = z.object({
  name: z.string(),
  value: z.string(),
  inline: z.boolean().optional(),
});

const embedSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  url: z.string().url().optional(),
  color: z.number().optional(),
  fields: z.array(embedFieldSchema).optional(),
  footer: z
    .object({
      text: z.string(),
      icon_url: z.string().optional(),
    })
    .optional(),
  timestamp: z.string().optional(),
});

export const webhookMessageDTOSchema = z.object({
  content: z.string().min(1).max(4000),
  embeds: z.array(embedSchema).optional(),
});

export type WebhookMessageDTO = z.infer<typeof webhookMessageDTOSchema>;

// ── 模板配置验证 (按 templateId 验证具体 config) ──
export const TEMPLATE_CONFIG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  welcome: welcomeConfigSchema,
  poll: pollConfigSchema,
  game: gameConfigSchema,
  reminder: reminderConfigSchema,
  'auto-responder': autoResponderConfigSchema,
};

const channelBotPolicySchema = z.object({
  canSummarize: z.boolean().default(true),
  canUseTools: z.boolean().default(true),
  maxTokensPerRequest: z.number().min(1).max(16384).default(2048),
});

export const createChannelBotDTOSchema = z.object({
  botId: z.string().min(1, 'Bot ID is required'),
  channelId: z.string().min(1, 'Channel ID is required'),
  enabled: z.boolean().default(true),
  overridePrompt: z.string().max(4000).optional(),
  overrideTools: z.array(llmToolEnum).optional(),
  memoryScope: memoryScopeEnum.default('channel'),
  policy: channelBotPolicySchema.optional(),
});

export type CreateChannelBotDTO = z.infer<typeof createChannelBotDTOSchema>;

export const updateChannelBotDTOSchema = z.object({
  enabled: z.boolean().optional(),
  overridePrompt: z.string().max(4000).optional().nullable(),
  overrideTools: z.array(llmToolEnum).optional().nullable(),
  memoryScope: memoryScopeEnum.optional(),
  policy: channelBotPolicySchema.partial().optional(),
});

export type UpdateChannelBotDTO = z.infer<typeof updateChannelBotDTOSchema>;

// ── 导出子 schemas 供外部使用 ──
export {
  llmConfigSchema,
  welcomeConfigSchema,
  pollConfigSchema,
  gameConfigSchema,
  reminderConfigSchema,
  autoResponderConfigSchema,
  autoResponderRuleSchema,
  channelBotPolicySchema,
  slashCommandSchema,
  slashCommandParamSchema,
  slashCommandHandlerSchema,
  botScheduleSchema,
  scheduleActionSchema,
  botEventSubscriptionSchema,
  eventActionSchema,
};
