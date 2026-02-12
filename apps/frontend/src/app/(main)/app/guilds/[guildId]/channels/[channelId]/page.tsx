'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Hash } from 'lucide-react';
import { useGuild } from '@/hooks/use-guild';
import { useChannels } from '@/hooks/use-channel';
import { useGuildStore } from '@/stores/guild-store';
import MemberList from '@/components/member/member-list';
import { ChannelResponse } from '@discord-platform/shared';

export default function ChannelPage() {
  const params = useParams<{ guildId: string; channelId: string }>();
  const guildId = params.guildId;
  const channelId = params.channelId;

  const { data: guild } = useGuild(guildId);
  const { data: channels } = useChannels(guildId);
  const setActiveGuild = useGuildStore((s) => s.setActiveGuild);
  const setActiveChannel = useGuildStore((s) => s.setActiveChannel);

  const channel: ChannelResponse | undefined = channels?.find(
    (c) => c.id === channelId,
  );

  // Sync state
  useEffect(() => {
    if (guild) {
      setActiveGuild(guild);
    }
  }, [guild, setActiveGuild]);

  useEffect(() => {
    if (channel) {
      setActiveChannel(channel);
    }
  }, [channel, setActiveChannel]);

  if (!channel) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-700">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-400 border-t-white mx-auto" />
          <p className="text-sm text-gray-400">Loading channel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-700">
        {/* Channel Header */}
        <div className="flex h-12 items-center px-4 shadow-md bg-gray-700 border-b border-gray-600">
          <Hash className="mr-2 h-5 w-5 text-gray-400" />
          <h3 className="font-semibold text-white">{channel.name}</h3>
        </div>

        {/* Messages Area (placeholder) */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="mb-4 mx-auto h-16 w-16 rounded-full bg-gray-600 flex items-center justify-center">
              <Hash className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-1">
              Welcome to #{channel.name}
            </h3>
            <p className="text-gray-400 text-sm">
              This is the start of the #{channel.name} channel.
            </p>
          </div>
        </div>

        {/* Message Input (placeholder) */}
        <div className="p-4">
          <div className="rounded-lg bg-gray-600 p-3">
            <input
              type="text"
              placeholder={`Message #${channel.name}`}
              className="w-full bg-transparent text-gray-200 placeholder:text-gray-400 outline-none text-sm"
              disabled
            />
          </div>
        </div>
      </div>

      {/* Member List */}
      <MemberList guildId={guildId} />
    </div>
  );
}
