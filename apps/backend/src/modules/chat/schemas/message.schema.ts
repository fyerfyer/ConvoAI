import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import { Attachment } from './attachment.schema';
import { Embed, embedSchema } from './embed.schema';

export type MessageDocument = HydratedDocument<Message>;
export type MessageModel = Model<MessageDocument>;

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: String, required: true })
  content: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  sender: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true, index: true })
  channelId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Message', required: false })
  replyTo?: Types.ObjectId;

  @Prop({ type: [Attachment], default: [] })
  attachments: Attachment[];

  @Prop({ type: [embedSchema], default: [] })
  embed?: Embed[];

  @Prop({ type: Boolean, default: false })
  isSystem: boolean;

  @Prop({ type: Boolean, default: false })
  isEdited: boolean;
}

export const messageSchema = SchemaFactory.createForClass(Message);
