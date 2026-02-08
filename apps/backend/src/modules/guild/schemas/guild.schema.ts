import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { UserDocument } from '../../user/schemas/user.schema';
import {
  HydratedDocument,
  Model,
  Types,
  PopulatedDoc,
  Document,
} from 'mongoose';
import { ChannelDocument } from '../../channel/schemas/channel.schema';
import { Role, roleSchema } from './role.schema';
import {
  DEFAULT_EVERYONE_PERMISSIONS,
  ROLE_CONSTANTS,
} from '@discord-platform/shared';

export type GuildDocument = HydratedDocument<Guild>;
export type GuildModel = Model<GuildDocument>;

@Schema({ timestamps: true, optimisticConcurrency: true })
export class Guild {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String })
  icon?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  owner: PopulatedDoc<UserDocument & Document>;

  @Prop({ type: [roleSchema], default: [] })
  roles: Types.DocumentArray<Role>;

  // 系统通道（例如发送欢迎信息）
  @Prop({ type: Types.ObjectId, ref: 'Channel' })
  systemChannelId?: PopulatedDoc<ChannelDocument & Document>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const guildSchema = SchemaFactory.createForClass(Guild);

guildSchema.pre('save', async function () {
  if (this.isNew) {
    // 确保 roles 数组已初始化
    if (!this.roles) {
      this.set('roles', []);
    }

    // 如果是新创建的 Guild 且没有角色，添加默认的 @everyone 角色
    if ((this.roles && this.roles.length === 0) || !this.roles) {
      this.roles.push({
        name: ROLE_CONSTANTS.EVERYONE,
        permissions: DEFAULT_EVERYONE_PERMISSIONS,
        color: '#99AAB5',
        position: 0,
        hoist: false,
        mentionable: false,
      });
    }
  }
});
