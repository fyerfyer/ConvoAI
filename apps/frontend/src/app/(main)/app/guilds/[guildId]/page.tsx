'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGuild } from '@/hooks/use-guild';
import { useChannels } from '@/hooks/use-channel';
import { useGuildStore } from '@/stores/guild-store';
import MemberList from '@/components/member/member-list';
import { CHANNEL } from '@discord-platform/shared';

export default function GuildPage() {
  const params = useParams<{ guildId: string }>();
  const router = useRouter();
  const guildId = params.guildId;

  const { data: guild, isLoading: guildLoading } = useGuild(guildId);
  const { data: channels } = useChannels(guildId);
  const setActiveGuild = useGuildStore((s) => s.setActiveGuild);

  // Sync state
  useEffect(() => {
    if (guild) {
      setActiveGuild(guild);
    }
  }, [guild, setActiveGuild]);

  // 重定向到第一个文本频道
  useEffect(() => {
    if (channels && channels.length > 0) {
      const textChannel = channels.find((c) => c.type === CHANNEL.GUILD_TEXT);
      if (textChannel) {
        router.replace(`/app/guilds/${guildId}/channels/${textChannel.id}`);
      }
    }
  }, [channels, guildId, router]);

  if (guildLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-700">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-400 border-t-white mx-auto" />
          <p className="text-sm text-gray-400">Loading guild...</p>
        </div>
      </div>
    );
  }

  if (!guild) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-700">
        <p className="text-gray-400">Guild not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex items-center justify-center bg-gray-700">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">
            Welcome to {guild.name}
          </h2>
          <p className="text-gray-400">
            Select a channel from the sidebar to start chatting
          </p>
        </div>
      </div>
      <MemberList guildId={guildId} />
    </div>
  );
}
