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

export type MemberDocument = HydratedDocument<Member>;
export type MemberModel = Model<MemberDocument>;

@Schema({ timestamps: true })
export class Member {
  @Prop({ type: Types.ObjectId, ref: 'Guild', required: true })
  guild: PopulatedDoc<GuildDocument & Document>;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: PopulatedDoc<UserDocument & Document>;

  @Prop({ type: String })
  nickName?: string; // 在服务器中的专属昵称

  @Prop({ type: [Types.ObjectId], default: [] })
  roles: Types.ObjectId[]; // 拥有的角色 ID 列表，具体去 Guild 中查

  @Prop({ default: Date.now })
  joinedAt: Date;
}

export const memberSchema = SchemaFactory.createForClass(Member);

// 确保一个用户在同一个公会只能有一个 Member 记录
memberSchema.index({ guild: 1, user: 1 }, { unique: true });
