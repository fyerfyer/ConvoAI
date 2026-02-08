import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  Model,
  Types,
  PopulatedDoc,
  Document,
} from 'mongoose';
import { Attachment } from './attachment.schema';
import { Embed, embedSchema } from './embed.schema';
import { UserDocument } from '../../user/schemas/user.schema';
import { ChannelDocument } from '../../channel/schemas/channel.schema';

export type MessageDocument = HydratedDocument<Message>;
export type MessageModel = Model<MessageDocument>;

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: String, required: true })
  content: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  sender: PopulatedDoc<UserDocument & Document>;

  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true, index: true })
  channelId: PopulatedDoc<ChannelDocument & Document>;

  @Prop({ type: Types.ObjectId, ref: 'Message', required: false })
  replyTo?: PopulatedDoc<MessageDocument>;

  @Prop({ type: [Attachment], default: [] })
  attachments: Attachment[];

  @Prop({ type: [embedSchema], default: [] })
  embed?: Embed[];

  @Prop({ type: Boolean, default: false })
  isSystem: boolean;

  @Prop({ type: Boolean, default: false })
  isEdited: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const messageSchema = SchemaFactory.createForClass(Message);
