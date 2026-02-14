'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useGuild } from '@/hooks/use-guild';
import { useChannels } from '@/hooks/use-channel';
import { useGuildStore } from '@/stores/guild-store';
import MemberList from '@/components/member/member-list';
import ChatArea from '@/components/chat/chat-area';
import { ChannelResponse } from '@discord-platform/shared';

export default function ChannelPage() {
  const params = useParams<{ guildId: string; channelId: string }>();
  const guildId = params.guildId;
  const channelId = params.channelId;

  const { data: guild } = useGuild(guildId);
  const { data: channels } = useChannels(guildId);
  const setActiveGuild = useGuildStore((s) => s.setActiveGuild);
  const setActiveChannel = useGuildStore((s) => s.setActiveChannel);
  const [showMembers, setShowMembers] = useState(true);

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
      {/* Chat Area */}
      <ChatArea
        channelId={channelId}
        channelName={channel.name}
        guildId={guildId}
        onToggleMembers={() => setShowMembers((prev) => !prev)}
        showMemberToggle
      />

      {/* Member List (collapsible) */}
      {showMembers && <MemberList guildId={guildId} />}
    </div>
  );
}
