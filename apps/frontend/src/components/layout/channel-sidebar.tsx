'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Hash,
  Volume2,
  ChevronDown,
  ChevronRight,
  Plus,
  Settings,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useChannels } from '@/hooks/use-channel';
import { useGuildStore } from '@/stores/guild-store';
import CreateChannelDialog from '@/components/channel/create-channel-dialog';
import { CHANNEL, ChannelResponse } from '@discord-platform/shared';
import { cn } from '@/lib/utils';

export default function ChannelSidebar() {
  const router = useRouter();
  const params = useParams<{ guildId?: string; channelId?: string }>();
  const guildId = params?.guildId;
  const activeChannelId = params?.channelId;

  const activeGuild = useGuildStore((s) => s.activeGuild);
  const setActiveChannel = useGuildStore((s) => s.setActiveChannel);

  const { data: channels, isLoading } = useChannels(guildId);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});

  // If no guild is selected, show placeholder
  if (!guildId) {
    return (
      <div className="flex w-60 flex-col bg-gray-800 text-gray-100">
        <div className="flex h-12 items-center px-4 shadow-md">
          <h2 className="font-semibold text-gray-400">Select a Guild</h2>
        </div>
        <Separator className="bg-gray-700" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-500">
            Choose a guild to see channels
          </p>
        </div>
      </div>
    );
  }

  const guildName = activeGuild?.name || 'Guild';

  // Separate channels by type
  const textChannels =
    channels?.filter((c) => c.type === CHANNEL.GUILD_TEXT) ?? [];
  const voiceChannels =
    channels?.filter((c) => c.type === CHANNEL.GUILD_VOICE) ?? [];
  const categories =
    channels?.filter((c) => c.type === CHANNEL.GUILD_CATEGORY) ?? [];

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleChannelClick = (channel: ChannelResponse) => {
    setActiveChannel(channel);
    router.push(`/app/guilds/${guildId}/channels/${channel.id}`);
  };

  const renderChannelIcon = (type: number) => {
    if (type === CHANNEL.GUILD_VOICE) {
      return <Volume2 className="mr-1.5 h-4 w-4 shrink-0 text-gray-400" />;
    }
    return <Hash className="mr-1.5 h-4 w-4 shrink-0 text-gray-400" />;
  };

  const renderChannelList = (channelList: ChannelResponse[]) =>
    channelList.map((channel) => (
      <Button
        key={channel.id}
        variant="ghost"
        className={cn(
          'w-full justify-start px-2 py-1 h-8 text-gray-300 hover:bg-gray-700 hover:text-white',
          activeChannelId === channel.id && 'bg-gray-700/60 text-white',
        )}
        onClick={() => handleChannelClick(channel)}
      >
        {renderChannelIcon(channel.type)}
        <span className="truncate">{channel.name}</span>
      </Button>
    ));

  return (
    <>
      <div className="flex w-60 flex-col bg-gray-800 text-gray-100">
        {/* Guild Name Header */}
        <div className="flex h-12 items-center justify-between px-4 shadow-md">
          <h2 className="font-semibold truncate">{guildName}</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        <Separator className="bg-gray-700" />

        {/* Channels List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {isLoading ? (
              <div className="space-y-2 px-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-6 rounded bg-gray-700 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <>
                {/* Categories */}
                {categories.map((category) => {
                  const isCollapsed = collapsedSections[category.id];
                  const categoryChannels =
                    channels?.filter(
                      (c) =>
                        c.parentId === category.id &&
                        c.type !== CHANNEL.GUILD_CATEGORY,
                    ) ?? [];

                  return (
                    <div key={category.id}>
                      <button
                        className="flex w-full items-center px-1 py-1 text-xs font-semibold uppercase text-gray-400 hover:text-gray-300"
                        onClick={() => toggleSection(category.id)}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="mr-0.5 h-3 w-3" />
                        ) : (
                          <ChevronDown className="mr-0.5 h-3 w-3" />
                        )}
                        {category.name}
                      </button>
                      {!isCollapsed && (
                        <div className="space-y-0.5 ml-2">
                          {renderChannelList(categoryChannels)}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Uncategorized Text Channels */}
                {textChannels.filter((c) => !c.parentId).length > 0 && (
                  <div>
                    <button
                      className="flex w-full items-center px-1 py-1 text-xs font-semibold uppercase text-gray-400 hover:text-gray-300"
                      onClick={() => toggleSection('text')}
                    >
                      {collapsedSections['text'] ? (
                        <ChevronRight className="mr-0.5 h-3 w-3" />
                      ) : (
                        <ChevronDown className="mr-0.5 h-3 w-3" />
                      )}
                      Text Channels
                    </button>
                    {!collapsedSections['text'] && (
                      <div className="space-y-0.5">
                        {renderChannelList(
                          textChannels.filter((c) => !c.parentId),
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Uncategorized Voice Channels */}
                {voiceChannels.filter((c) => !c.parentId).length > 0 && (
                  <div>
                    <button
                      className="flex w-full items-center px-1 py-1 text-xs font-semibold uppercase text-gray-400 hover:text-gray-300"
                      onClick={() => toggleSection('voice')}
                    >
                      {collapsedSections['voice'] ? (
                        <ChevronRight className="mr-0.5 h-3 w-3" />
                      ) : (
                        <ChevronDown className="mr-0.5 h-3 w-3" />
                      )}
                      Voice Channels
                    </button>
                    {!collapsedSections['voice'] && (
                      <div className="space-y-0.5">
                        {renderChannelList(
                          voiceChannels.filter((c) => !c.parentId),
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Create Channel Button */}
        <div className="p-2 border-t border-gray-700">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-700"
            onClick={() => setCreateChannelOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Channel
          </Button>
        </div>
      </div>

      <CreateChannelDialog
        open={createChannelOpen}
        onOpenChange={setCreateChannelOpen}
        guildId={guildId}
      />
    </>
  );
}
