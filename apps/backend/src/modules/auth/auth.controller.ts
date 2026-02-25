import { Body, Controller, HttpStatus, Post, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  AuthResponse,
  ApiResponse,
  LoginDTO,
  RegisterDTO,
  registerSchema,
  loginSchema,
} from '@discord-platform/shared';
import { ZodValidationPipe } from '../../common/pipes/validation.pipe';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({
    short: { limit: 1, ttl: 1000 },
    long: { limit: 3, ttl: 60000 },
  })
  @Post('register')
  @UsePipes(new ZodValidationPipe(registerSchema))
  async register(
    @Body() registerDTO: RegisterDTO,
  ): Promise<ApiResponse<AuthResponse>> {
    const data = await this.authService.register(registerDTO);
    return {
      data,
      statusCode: HttpStatus.CREATED,
      message: 'Registration successful',
    };
  }

  @Throttle({
    short: { limit: 2, ttl: 1000 },
    medium: { limit: 5, ttl: 10000 },
  })
  @Post('login')
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(@Body() loginDTO: LoginDTO): Promise<ApiResponse<AuthResponse>> {
    const data = await this.authService.login(loginDTO);
    return {
      data,
      statusCode: HttpStatus.OK,
      message: 'Login successful',
    };
  }

  @Post('logout')
  async logout(): Promise<ApiResponse<null>> {
    return {
      statusCode: HttpStatus.OK,
      message: 'Logout successful',
    };
  }
}
