import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';

export type AutoModLogDocument = HydratedDocument<AutoModLog>;
export type AutoModLogModel = Model<AutoModLogDocument>;

@Schema({ timestamps: true })
export class AutoModLog {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  guildId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  channelId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true })
  trigger: string;

  @Prop({ type: String, required: true })
  reason: string;

  @Prop({ type: [String], required: true })
  actions: string[];

  @Prop({ type: String, required: true })
  messageContent: string;

  @Prop({ type: Object })
  toxicityScores?: Record<string, number>;

  createdAt?: Date;
}

export const autoModLogSchema = SchemaFactory.createForClass(AutoModLog);
