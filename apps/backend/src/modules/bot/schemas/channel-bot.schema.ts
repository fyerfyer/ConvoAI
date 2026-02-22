import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  Model,
  Types,
  PopulatedDoc,
  Document,
} from 'mongoose';
import { BotDocument } from './bot.schema';
import { ChannelDocument } from '../../channel/schemas/channel.schema';
import { GuildDocument } from '../../guild/schemas/guild.schema';
import {
  MEMORY_SCOPE,
  MemoryScopeValue,
  LlmToolValue,
} from '@discord-platform/shared';

export type ChannelBotDocument = HydratedDocument<ChannelBot>;
export type ChannelBotModel = Model<ChannelBotDocument>;

// Channel Bot 权限策略
@Schema({ _id: false })
export class ChannelBotPolicy {
  @Prop({ type: Boolean, default: true })
  canSummarize: boolean;

  @Prop({ type: Boolean, default: true })
  canUseTools: boolean;

  @Prop({ type: Number, default: 2048 })
  maxTokensPerRequest: number;
}

export const channelBotPolicySchema =
  SchemaFactory.createForClass(ChannelBotPolicy);

@Schema({ timestamps: true })
export class ChannelBot {
  @Prop({ type: Types.ObjectId, ref: 'Bot', required: true, index: true })
  botId: PopulatedDoc<BotDocument & Document>;

  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true, index: true })
  channelId: PopulatedDoc<ChannelDocument & Document>;

  @Prop({ type: Types.ObjectId, ref: 'Guild', required: true, index: true })
  guildId: PopulatedDoc<GuildDocument & Document>;

  @Prop({ type: Boolean, default: true })
  enabled: boolean;

  @Prop({ type: String })
  overridePrompt?: string;

  @Prop({ type: [String] })
  overrideTools?: LlmToolValue[];

  // Memory 作用域
  @Prop({
    type: String,
    enum: Object.values(MEMORY_SCOPE),
    default: MEMORY_SCOPE.CHANNEL,
  })
  memoryScope: MemoryScopeValue;

  // 频道级权限策略
  @Prop({ type: channelBotPolicySchema, default: () => ({}) })
  policy: ChannelBotPolicy;

  createdAt?: Date;
  updatedAt?: Date;
}

export const channelBotSchema = SchemaFactory.createForClass(ChannelBot);

// 同一个 Bot 在同一个频道只能绑定一次
channelBotSchema.index({ botId: 1, channelId: 1 }, { unique: true });
// 查询特定频道的所有 Bot
channelBotSchema.index({ channelId: 1, enabled: 1 });
// 查询特定 Guild 的所有 Channel Bot 绑定
channelBotSchema.index({ guildId: 1 });
