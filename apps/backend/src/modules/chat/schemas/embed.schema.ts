import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class EmbedField {
  @Prop({ type: String, required: true })
  name: string;
  @Prop({ type: String, required: true })
  value: string;
  @Prop({ default: false })
  inline: boolean;
}

@Schema({ _id: false })
export class EmbedFooter {
  @Prop({ type: String, required: true })
  text: string;

  @Prop({ type: String, required: false })
  icon_url?: string;
}

@Schema({ _id: false })
export class Embed {
  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: false })
  description?: string;

  @Prop({ type: String, required: false })
  url?: string;

  @Prop({ type: [EmbedField], default: [] })
  fields?: EmbedField[];

  @Prop({ type: EmbedFooter, required: false })
  footer?: EmbedFooter;

  @Prop({ type: Date, required: false })
  timestamp?: Date;

  @Prop({ type: String, required: false })
  thumbnail?: string;

  @Prop({ type: String, required: false })
  image?: string;
}

export const embedSchema = SchemaFactory.createForClass(Embed);
