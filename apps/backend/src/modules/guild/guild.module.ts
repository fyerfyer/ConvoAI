import { Module, forwardRef } from '@nestjs/common';
import { GuildService } from './guild.service';
import { GuildController } from './guild.controller';
import { Guild, guildSchema } from './schemas/guild.schema';
import { Channel, channelSchema } from '../channel/schemas/channel.schema';
import { Member, memberSchema } from '../member/schemas/member.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { MemberModule } from '../member/member.module';
import { ChannelModule } from '../channel/channel.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Guild.name, schema: guildSchema },
      { name: Channel.name, schema: channelSchema },
      { name: Member.name, schema: memberSchema },
    ]),
    forwardRef(() => MemberModule),
    forwardRef(() => ChannelModule),
  ],
  providers: [GuildService],
  controllers: [GuildController],
  exports: [GuildService],
})
export class GuildModule {}
