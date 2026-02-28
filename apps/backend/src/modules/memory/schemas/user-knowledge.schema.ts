import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  Model,
  Types,
  PopulatedDoc,
  Document,
} from 'mongoose';
import { BotDocument } from '../../bot/schemas/bot.schema';
import { GuildDocument } from '../../guild/schemas/guild.schema';
import { ENTITY_TYPE } from 'shared/src/constants/bot.constant';

export type UserKnowledgeDocument = HydratedDocument<UserKnowledge>;
export type UserKnowledgeModel = Model<UserKnowledgeDocument>;

@Schema({ timestamps: true })
export class UserKnowledge {
  @Prop({ type: Types.ObjectId, ref: 'Bot', required: true, index: true })
  botId: PopulatedDoc<BotDocument & Document>;

  @Prop({ type: Types.ObjectId, ref: 'Guild', required: true, index: true })
  guildId: PopulatedDoc<GuildDocument & Document>;

  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ type: String, required: true })
  userName: string;

  // 提取的事实内容
  @Prop({ type: String, required: true })
  fact: string;

  // 实体类型
  @Prop({
    enum: Object.values(ENTITY_TYPE),
    required: true,
    default: ENTITY_TYPE.FACT,
  })
  entityType: string;

  // 来源：产生自哪条消息或摘要
  @Prop({ type: String, default: '' })
  source: string;

  // 相关性
  @Prop({ type: Number, default: 0.8, min: 0, max: 1 })
  relevanceScore: number;

  // 过期时间（用于重要性衰减）
  @Prop({ type: Date })
  expiresAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const userKnowledgeSchema = SchemaFactory.createForClass(UserKnowledge);

// 同一个事实不重复存储
userKnowledgeSchema.index({ botId: 1, userId: 1, fact: 1 }, { unique: true });
// 按关联查询
userKnowledgeSchema.index({ botId: 1, guildId: 1, userId: 1 });
// 过期索引自动清理
userKnowledgeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
