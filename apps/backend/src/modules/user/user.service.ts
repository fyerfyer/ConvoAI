import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument, UserModel } from './schemas/user.schema';
import {
  BUCKETS,
  CreateUserDTO,
  IUserPublic,
  UpdateUserDTO,
} from '@discord-platform/shared';
import { ImageService } from '../media/services/image.service';
import { ImageType } from '../media/types/image.type';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: UserModel,
    private readonly imageService: ImageService,
  ) {}

  async createUser(createUserDTO: CreateUserDTO): Promise<UserDocument> {
    const exists = await this.userModel.exists({ email: createUserDTO.email });
    if (exists) {
      throw new BadRequestException('User with this email already exists');
    }

    const createdUser = new this.userModel(createUserDTO);
    return createdUser.save();
  }

  async findByEmail(
    email: string,
    includePassword = false,
  ): Promise<UserDocument | null> {
    const query = this.userModel.findOne({ email });
    if (includePassword) {
      query.select('+password');
    }
    return query.exec();
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUser(
    userId: string,
    updateDTO: UpdateUserDTO,
  ): Promise<UserDocument> {
    if (updateDTO.email) {
      const exists = await this.userModel.exists({
        email: updateDTO.email,
        _id: { $ne: userId },
      });
      if (exists) {
        throw new BadRequestException('Email already in use by another user');
      }
    }

    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: updateDTO },
        { new: true, runValidators: true },
      )
      .exec();

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateAvatar(userId: string, avatarKey: string): Promise<UserDocument> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const newAvatar = await this.imageService.processImageWithPreset(
      userId,
      avatarKey,
      ImageType.AVATAR,
      BUCKETS.PUBLIC,
    );

    if (user.avatar) {
      await this.imageService.deleteImage(user.avatar, BUCKETS.PUBLIC);
    }

    user.avatar = newAvatar.publicId;
    return user.save();
  }

  convertToPublicUser(user: UserDocument): IUserPublic {
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      banner: user.banner,
      status: user.status,
      isBot: user.isBot,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
