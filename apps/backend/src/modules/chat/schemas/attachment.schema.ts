import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class Attachment {
  @Prop({ type: String, required: true })
  filename: string;

  @Prop({ type: String, required: true })
  url: string;

  @Prop({ type: String, required: true })
  contentType: string;

  @Prop({ type: Number, required: true })
  size: number;

  @Prop({ type: Number })
  width?: number;

  @Prop({ type: Number })
  height?: number;

  @Prop({ type: Number })
  duration?: number;
}

export const attachmentSchema = SchemaFactory.createForClass(Attachment);
