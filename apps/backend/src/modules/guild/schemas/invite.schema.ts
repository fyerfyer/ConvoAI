import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';

export type InviteDocument = HydratedDocument<Invite>;
export type InviteModel = Model<InviteDocument>;

@Schema({ timestamps: true })
export class Invite {
  @Prop({ type: String, required: true, unique: true })
  code: string;

  @Prop({ type: Types.ObjectId, ref: 'Guild', required: true })
  guild: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  inviter: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  uses: number;

  @Prop({ type: Number, default: 0 })
  maxUses: number; // 0 = unlimited

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const inviteSchema = SchemaFactory.createForClass(Invite);

inviteSchema.index({ guild: 1 });
inviteSchema.index({ code: 1 }, { unique: true });
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
