import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Request,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { UserService } from './user.service';
import {
  ApiResponse,
  UpdateUserDTO,
  updateUserSchema,
  UserResponse,
  JwtPayload,
} from '@discord-platform/shared';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { ZodValidationPipe } from '../../common/pipes/validation.pipe';

@Controller('users')
@UseGuards(JwtGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  async getProfile(
    @Request() req: { user: JwtPayload },
  ): Promise<ApiResponse<UserResponse>> {
    // 获取完整的用户信息
    const user = await this.userService.findById(req.user.sub);
    return {
      data: { user: this.userService.convertToPublicUser(user) },
      statusCode: HttpStatus.OK,
    };
  }

  @Patch('me')
  @UsePipes(new ZodValidationPipe(updateUserSchema))
  async updateProfile(
    @Request() req: { user: JwtPayload },
    @Body() updateDTO: UpdateUserDTO,
  ): Promise<ApiResponse<UserResponse>> {
    const user = await this.userService.updateUser(req.user.sub, updateDTO);
    return {
      data: { user: this.userService.convertToPublicUser(user) },
      statusCode: HttpStatus.OK,
      message: 'Profile updated successfully',
    };
  }

  @Get(':id')
  async getUser(@Param('id') id: string): Promise<ApiResponse<UserResponse>> {
    const user = await this.userService.findById(id);
    return {
      data: { user: this.userService.convertToPublicUser(user) },
      statusCode: HttpStatus.OK,
    };
  }
}
