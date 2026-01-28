import {
  CHANNEL,
  ChannelValue,
  PERMISSIONOVERWRITE,
  PermissionOverwriteValue,
} from '@discord-platform/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';

export type ChannelDocument = HydratedDocument<Channel>;
export type ChannelModel = Model<ChannelDocument>;

@Schema({ _id: false })
export class PermissionOverwrite {
  @Prop({ type: String, required: true })
  id: string; // 用户 ID 或者角色 ID

  @Prop({
    type: Number,
    enum: Object.values(PERMISSIONOVERWRITE),
    required: true,
  })
  type: PermissionOverwriteValue;

  @Prop({ type: Number, required: true })
  allow: number; // 允许的权限位掩码

  @Prop({ type: Number, required: true })
  deny: number; // 拒绝的权限位掩码
}

const permissionOverwriteSchema =
  SchemaFactory.createForClass(PermissionOverwrite);

@Schema({ timestamps: true })
export class Channel {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({
    type: Number,
    enum: Object.values(CHANNEL),
    default: CHANNEL.GUILD_TEXT,
  })
  type: ChannelValue;

  @Prop({ type: Types.ObjectId, ref: 'Guild', required: true })
  guild: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Channel', default: null })
  parentId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  topic?: string;

  @Prop({ type: [permissionOverwriteSchema], default: [] })
  permissionOverwrites: PermissionOverwrite[];

  @Prop({ type: Number, default: 0 })
  userLimit?: number; // 某些频道可能有人数限制

  @Prop({ type: Number, default: 0 })
  position: number;
}

export const channelSchema = SchemaFactory.createForClass(Channel);

// 索引优化：查询某个Guide下的所有频道，按position排序
channelSchema.index({ guild: 1, position: 1 });
