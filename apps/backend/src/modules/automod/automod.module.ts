import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AutoModService } from './services/automod.service';
import { ToxicityModelService } from './services/toxicity-model.service';
import { EmbeddingModelService } from './services/embedding-model.service';
import { AutoModController } from './automod.controller';
import { AutoModLog, autoModLogSchema } from './schemas/automod-log.schema';
import { Guild, guildSchema } from '../guild/schemas/guild.schema';
import { Member, memberSchema } from '../member/schemas/member.schema';
import { MemberModule } from '../member/member.module';
import { GuildModule } from '../guild/guild.module';
import { ChannelModule } from '../channel/channel.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AutoModLog.name, schema: autoModLogSchema },
      { name: Guild.name, schema: guildSchema },
      { name: Member.name, schema: memberSchema },
    ]),
    forwardRef(() => MemberModule),
    forwardRef(() => GuildModule),
    forwardRef(() => ChannelModule),
  ],
  providers: [AutoModService, ToxicityModelService, EmbeddingModelService],
  controllers: [AutoModController],
  exports: [AutoModService, ToxicityModelService, EmbeddingModelService],
})
export class AutoModModule {}
