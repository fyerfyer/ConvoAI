import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  Model,
  Types,
  PopulatedDoc,
  Document,
} from 'mongoose';
import { BotDocument } from '../../bot/schemas/bot.schema';
import { ChannelDocument } from '../../channel/schemas/channel.schema';
import { GuildDocument } from '../../guild/schemas/guild.schema';

export type BotMemoryDocument = HydratedDocument<BotMemory>;
export type BotMemoryModel = Model<BotMemoryDocument>;

@Schema({ timestamps: true })
export class BotMemory {
  @Prop({ type: Types.ObjectId, ref: 'Bot', required: true, index: true })
  botId: PopulatedDoc<BotDocument & Document>;

  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true, index: true })
  channelId: PopulatedDoc<ChannelDocument & Document>;

  @Prop({ type: Types.ObjectId, ref: 'Guild', required: true, index: true })
  guildId: PopulatedDoc<GuildDocument & Document>;

  // 滚动摘要：对历史对话的压缩总结
  @Prop({ type: String, default: '' })
  rollingSummary: string;

  // 已纳入摘要的消息总数
  @Prop({ type: Number, default: 0 })
  summarizedMessageCount: number;

  // 最后一条被纳入摘要的消息 ID
  @Prop({ type: String, default: '' })
  lastSummarizedMessageId: string;

  // 最后一次摘要更新的时间
  @Prop({ type: Date })
  lastSummarizedAt: Date;

  // 自上次摘要后的交互次数（用于判断是否触发新摘要）
  // 不管是否进行了摘要，只要尝试了这个值就归零
  @Prop({ type: Number, default: 0 })
  interactionsSinceSummary: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const botMemorySchema = SchemaFactory.createForClass(BotMemory);

// 同一个 Bot 在同一个 channel 只有一条记忆记录
botMemorySchema.index({ botId: 1, channelId: 1 }, { unique: true });
// 按 Guild 查询所有 memory
botMemorySchema.index({ guildId: 1, botId: 1 });
