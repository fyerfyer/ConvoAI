import { Module } from '@nestjs/common';
import { ImageService } from './services/image.service';
import { VoiceService } from './services/voice.service';
import { VoiceController } from './controllers/voice.controller';

@Module({
  controllers: [VoiceController],
  providers: [ImageService, VoiceService],
  exports: [ImageService, VoiceService],
})
export class MediaModule {}
