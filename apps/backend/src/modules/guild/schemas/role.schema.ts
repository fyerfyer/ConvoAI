import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class Role {
  @Prop({ required: true })
  name: string;

  @Prop({ default: 0 })
  permissions: number;

  @Prop({ default: '#99AAB5' }) // 默认灰色
  color: string;

  @Prop({ default: 0 })
  position: number; // 排序权重：值越大，排位越高

  @Prop({ default: false })
  hoist: boolean;

  @Prop({ default: false })
  mentionable: boolean;
}
export const roleSchema = SchemaFactory.createForClass(Role);
