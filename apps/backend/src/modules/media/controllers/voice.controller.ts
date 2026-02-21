import { Controller, Post, UseGuards, HttpStatus, Param } from '@nestjs/common';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { VoiceService } from '../services/voice.service';
import { User } from '../../../common/decorators/user.decorator';
import {
  ApiResponse,
  JwtPayload,
  VoiceTokenResponse,
} from '@discord-platform/shared';

@Controller('voice')
@UseGuards(JwtGuard)
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('token/:channelId')
  async getVoiceToken(
    @User() user: JwtPayload,
    @Param('channelId') channelId: string,
  ): Promise<ApiResponse<VoiceTokenResponse>> {
    const result = await this.voiceService.generateToken(
      user.sub,
      user.name,
      channelId,
    );
    return {
      data: result,
      statusCode: HttpStatus.OK,
      message: 'Voice token generated successfully',
    };
  }
}
