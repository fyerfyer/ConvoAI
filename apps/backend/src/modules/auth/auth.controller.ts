import { Body, Controller, HttpStatus, Post, UsePipes } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  AuthContracts,
  AuthResponse,
  ApiResponse,
  LoginDTO,
  RegisterDTO,
} from '@discord-platform/shared';
import { ZodValidationPipe } from '../../common/pipes/validation.pipe';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UsePipes(new ZodValidationPipe(AuthContracts.register.body))
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

  @Post('login')
  @UsePipes(new ZodValidationPipe(AuthContracts.login.body))
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
