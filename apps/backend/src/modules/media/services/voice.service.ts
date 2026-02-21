import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';

@Injectable()
export class VoiceService {
  private readonly livekitHost: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.livekitHost =
      this.configService.get<string>('LIVEKIT_HOST') || 'ws://localhost:7880';
    this.apiKey = this.configService.get<string>('LIVEKIT_API_KEY') || 'devkey';
    this.apiSecret =
      this.configService.get<string>('LIVEKIT_API_SECRET') || 'secret';
  }

  // 生成 LiveKit 访问令牌
  async generateToken(
    userId: string,
    userName: string,
    channelId: string,
  ): Promise<{ token: string; url: string }> {
    const roomName = `voice-${channelId}`;

    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: userId,
      name: userName,
      ttl: '6h',
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return {
      token,
      url: this.livekitHost,
    };
  }
}
