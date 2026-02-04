import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { STATUS, StatusValue } from '@discord-platform/shared';
import * as bcrypt from 'bcrypt';

export interface UserMethods {
  comparePassword(inputPassword: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<User, UserMethods>;
export type UserModel = Model<UserDocument>;

@Schema({
  timestamps: true,
  toJSON: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transform: (doc, ret: any) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.password;
      return ret;
    },
  },
})
export class User {
  @Prop({
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    index: true,
  })
  email: string;

  @Prop({
    required: [true, 'Password is required'],
    select: false,
  })
  password: string;

  @Prop({
    required: [true, 'Name is required'],
    trim: true,
    minlength: 2,
    maxlength: 50,
  })
  name: string;

  @Prop({ type: String, default: null })
  avatar: string;

  // 用户背景图
  @Prop({ type: String, default: null })
  banner: string;

  @Prop({
    type: String,
    enum: Object.values(STATUS),
    default: STATUS.OFFLINE,
  })
  status: StatusValue;

  @Prop({ type: Boolean, default: false })
  isBot: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const userSchema = SchemaFactory.createForClass(User);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (
  inputPassword: string,
): Promise<boolean> {
  return bcrypt.compare(inputPassword, this.password);
};
