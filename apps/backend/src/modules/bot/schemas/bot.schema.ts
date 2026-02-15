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
} from '@discord-platform/shared';

export type BotDocument = HydratedDocument<Bot>;
export type BotModel = Model<BotDocument>;

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

  @Prop({ type: String, required: true })
  webhookUrl: string;

  @Prop({ type: String, required: true, select: false })
  webhookSecret: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  webhookToken: string;

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
