import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  Model,
  Types,
  PopulatedDoc,
  Document,
} from 'mongoose';
import { UserDocument } from '../../user/schemas/user.schema';
import { GuildDocument } from '../../guild/schemas/guild.schema';
import {
  BOT_TYPE,
  BotTypeValue,
  BOT_STATUS,
  BotStatusValue,
  EXECUTION_MODE,
  ExecutionModeValue,
  TemplateIdValue,
  LlmProviderValue,
  LlmToolValue,
} from '@discord-platform/shared';

export type BotDocument = HydratedDocument<Bot>;
export type BotModel = Model<BotDocument>;

// ── 内嵌 LLM 配置 Schema ──
@Schema({ _id: false })
export class LlmConfigEmbedded {
  @Prop({ type: String, required: true })
  provider: LlmProviderValue;

  @Prop({ type: String, required: true, select: false })
  apiKey: string; // AES-256-GCM 加密存储

  @Prop({ type: String, required: true })
  model: string;

  @Prop({ type: String, default: 'You are a helpful assistant.' })
  systemPrompt: string;

  @Prop({ type: Number, default: 0.7 })
  temperature: number;

  @Prop({ type: Number, default: 1024 })
  maxTokens: number;

  @Prop({ type: [String], default: [] })
  tools: LlmToolValue[];

  @Prop({ type: String })
  customBaseUrl?: string;
}

export const llmConfigEmbeddedSchema =
  SchemaFactory.createForClass(LlmConfigEmbedded);

@Schema({ timestamps: true })
export class Bot {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: PopulatedDoc<UserDocument & Document>;

  @Prop({ type: Types.ObjectId, ref: 'Guild', required: true, index: true })
  guildId: PopulatedDoc<GuildDocument & Document>;

  @Prop({
    type: String,
    enum: Object.values(BOT_TYPE),
    default: BOT_TYPE.CHATBOT,
  })
  type: BotTypeValue;

  @Prop({
    type: String,
    enum: Object.values(EXECUTION_MODE),
    default: EXECUTION_MODE.WEBHOOK,
  })
  executionMode: ExecutionModeValue;

  @Prop({ type: String })
  webhookUrl?: string;

  @Prop({ type: String, select: false })
  webhookSecret?: string;

  @Prop({ type: String, unique: true, index: true, sparse: true })
  webhookToken?: string;

  @Prop({ type: String })
  templateId?: TemplateIdValue;

  @Prop({ type: Object, default: {} })
  templateConfig?: Record<string, unknown>;

  @Prop({ type: llmConfigEmbeddedSchema })
  llmConfig?: LlmConfigEmbedded;

  @Prop({ type: String, default: '' })
  description: string;

  @Prop({
    type: String,
    enum: Object.values(BOT_STATUS),
    default: BOT_STATUS.ACTIVE,
  })
  status: BotStatusValue;

  createdAt?: Date;
  updatedAt?: Date;
}

export const botSchema = SchemaFactory.createForClass(Bot);

// 复合索引：查询特定状态 bot
botSchema.index({ guildId: 1, status: 1 });
// 执行模式索引
botSchema.index({ guildId: 1, executionMode: 1 });
