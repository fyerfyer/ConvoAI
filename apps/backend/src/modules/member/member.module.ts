import { Module, forwardRef } from '@nestjs/common';
import { MemberService } from './member.service';
import { MemberController } from './member.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Member, memberSchema } from './schemas/member.schema';
import { Guild, guildSchema } from '../guild/schemas/guild.schema';
import { Channel, channelSchema } from '../channel/schemas/channel.schema';
import { User, userSchema } from '../user/schemas/user.schema';
import { GuildModule } from '../guild/guild.module';
import { ChannelModule } from '../channel/channel.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Member.name, schema: memberSchema },
      { name: Guild.name, schema: guildSchema },
      { name: Channel.name, schema: channelSchema },
      { name: User.name, schema: userSchema },
    ]),
    forwardRef(() => GuildModule),
    forwardRef(() => ChannelModule),
  ],
  providers: [MemberService],
  controllers: [MemberController],
  exports: [MemberService],
})
export class MemberModule {}
