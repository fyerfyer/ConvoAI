import { Module } from '@nestjs/common';
import { GuildService } from './guild.service';
import { GuildController } from './guild.controller';
import { Channel, channelSchema } from '../channel/schemas/channel.schema';
import { Member, memberSchema } from '../member/schemas/member.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { MemberModule } from '../member/member.module';
import { ChannelModule } from '../channel/channel.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Channel.name, schema: channelSchema },
      { name: Member.name, schema: memberSchema },
    ]),
    MemberModule,
    ChannelModule,
  ],
  providers: [GuildService],
  controllers: [GuildController],
  exports: [GuildService],
})
export class GuildModule {}
