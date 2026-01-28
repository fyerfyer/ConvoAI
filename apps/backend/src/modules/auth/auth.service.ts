import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import {
  AuthResponse,
  JwtPayload,
  LoginDTO,
  RegisterDTO,
} from '@discord-platform/shared';
import { UserDocument } from '../user/schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  async login(loginDTO: LoginDTO): Promise<AuthResponse> {
    const user = await this.userService.findByEmail(loginDTO.email, true);
    if (!user || !(await user.comparePassword(loginDTO.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = await this.signToken(user);
    return { user: this.convertToIUserPublic(user), token };
  }

  async register(registerDTO: RegisterDTO): Promise<AuthResponse> {
    const user = await this.userService.createUser({
      name: registerDTO.name,
      email: registerDTO.email,
      password: registerDTO.password,
    });
    const token = await this.signToken(user);
    return { user: this.convertToIUserPublic(user), token };
  }

  private async signToken(user: UserDocument): Promise<string> {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      name: user.name,
      isBot: user.isBot,
    };

    return this.jwtService.signAsync<JwtPayload>(payload);
  }

  private convertToIUserPublic(user: UserDocument) {
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      banner: user.banner,
      status: user.status,
      isBot: user.isBot,
      createdAt: user.createdAt.toISOString(), // 传给前端通常是 ISO String
    };
  }
}
