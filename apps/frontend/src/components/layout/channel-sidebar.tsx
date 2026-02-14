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
  UserPlus,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  useChannels,
  useUpdateChannel,
  useDeleteChannel,
} from '@/hooks/use-channel';
import { useGuildStore } from '@/stores/guild-store';
import CreateChannelDialog from '@/components/channel/create-channel-dialog';
import SortableChannelItem from '@/components/channel/sortable-channel-item';
import SortableCategory from '@/components/channel/sortable-category';
import ChannelContextMenu from '@/components/channel/channel-context-menu';
import RenameChannelDialog from '@/components/channel/rename-channel-dialog';
import InviteMemberDialog from '@/components/guild/invite-member-dialog';
import { CHANNEL, ChannelResponse } from '@discord-platform/shared';

export default function ChannelSidebar() {
  const router = useRouter();
  const params = useParams<{ guildId?: string; channelId?: string }>();
  const guildId = params?.guildId;
  const activeChannelId = params?.channelId;

  const activeGuild = useGuildStore((s) => s.activeGuild);
  const setActiveChannel = useGuildStore((s) => s.setActiveChannel);

  const { data: channels, isLoading } = useChannels(guildId);
  const updateChannel = useUpdateChannel();
  const deleteChannel = useDeleteChannel();

  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    channel: ChannelResponse;
    position: { x: number; y: number };
  } | null>(null);

  // Rename dialog state
  const [renameChannel, setRenameChannel] = useState<ChannelResponse | null>(
    null,
  );

  // Invite dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor),
  );

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

  // Uncategorized channels
  const uncategorizedTextChannels = textChannels.filter((c) => !c.parentId);
  const uncategorizedVoiceChannels = voiceChannels.filter((c) => !c.parentId);
  const allUncategorizedIds = [
    ...uncategorizedTextChannels.map((c) => c.id),
    ...uncategorizedVoiceChannels.map((c) => c.id),
  ];

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleChannelClick = (channel: ChannelResponse) => {
    setActiveChannel(channel);
    router.push(`/app/guilds/${guildId}/channels/${channel.id}`);
  };

  const handleContextMenu = (e: React.MouseEvent, channel: ChannelResponse) => {
    e.preventDefault();
    setContextMenu({
      channel,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  const handleRename = (channelId: string, newName: string) => {
    updateChannel.mutate({
      channelId,
      guildId: guildId!,
      data: { name: newName },
    });
  };

  const handleMove = (channel: ChannelResponse, categoryId: string | null) => {
    updateChannel.mutate({
      channelId: channel.id,
      guildId: guildId!,
      data: { parentId: categoryId },
    });
  };

  const handleDelete = (channel: ChannelResponse) => {
    if (confirm(`Are you sure you want to delete #${channel.name}?`)) {
      deleteChannel.mutate({
        channelId: channel.id,
        guildId: guildId!,
      });
    }
  };

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // If dragged over a category droppable, move channel into that category
    if (overData?.type === 'category' && activeData?.type === 'channel') {
      const category = overData.category as ChannelResponse;
      const channel = activeData.channel as ChannelResponse;

      if (channel.parentId !== category.id) {
        updateChannel.mutate({
          channelId: channel.id,
          guildId: guildId!,
          data: { parentId: category.id },
        });
      }
      return;
    }

    // If dragged over another channel, check if we need to move to a different category
    if (activeData?.type === 'channel' && overData?.type === 'channel') {
      const draggedChannel = activeData.channel as ChannelResponse;
      const targetChannel = overData.channel as ChannelResponse;

      // If target channel is in a different parent, move to that parent
      if (draggedChannel.parentId !== targetChannel.parentId) {
        updateChannel.mutate({
          channelId: draggedChannel.id,
          guildId: guildId!,
          data: { parentId: targetChannel.parentId ?? undefined },
        });
      }
    }
  };

  const activeChannel = activeId
    ? channels?.find((c) => c.id === activeId)
    : null;

  return (
    <>
      <div className="flex w-60 flex-col bg-gray-800 text-gray-100">
        {/* Guild Name Header */}
        <div className="flex h-12 items-center justify-between px-4 shadow-md">
          <h2 className="font-semibold truncate">{guildName}</h2>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Invite Members"
              onClick={() => setInviteDialogOpen(true)}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                {/* Categories with their channels */}
                {categories.map((category) => {
                  const isCollapsed = collapsedSections[category.id];
                  const categoryChannels =
                    channels?.filter(
                      (c) =>
                        c.parentId === category.id &&
                        c.type !== CHANNEL.GUILD_CATEGORY,
                    ) ?? [];

                  return (
                    <SortableCategory
                      key={category.id}
                      category={category}
                      channels={categoryChannels}
                      isCollapsed={!!isCollapsed}
                      activeChannelId={activeChannelId}
                      onToggle={() => toggleSection(category.id)}
                      onChannelClick={handleChannelClick}
                      onChannelContextMenu={handleContextMenu}
                    />
                  );
                })}

                {/* Uncategorized Channels */}
                {(uncategorizedTextChannels.length > 0 ||
                  uncategorizedVoiceChannels.length > 0) && (
                  <div>
                    <button
                      className="flex w-full items-center px-1 py-1 text-xs font-semibold uppercase text-gray-400 hover:text-gray-300"
                      onClick={() => toggleSection('uncategorized')}
                    >
                      {collapsedSections['uncategorized'] ? (
                        <ChevronRight className="mr-0.5 h-3 w-3" />
                      ) : (
                        <ChevronDown className="mr-0.5 h-3 w-3" />
                      )}
                      Channels
                    </button>
                    {!collapsedSections['uncategorized'] && (
                      <SortableContext
                        items={allUncategorizedIds}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-0.5">
                          {[
                            ...uncategorizedTextChannels,
                            ...uncategorizedVoiceChannels,
                          ].map((channel) => (
                            <SortableChannelItem
                              key={channel.id}
                              channel={channel}
                              isActive={activeChannelId === channel.id}
                              onClick={() => handleChannelClick(channel)}
                              onContextMenu={(e) =>
                                handleContextMenu(e, channel)
                              }
                            />
                          ))}
                        </div>
                      </SortableContext>
                    )}
                  </div>
                )}

                {/* Drag Overlay */}
                <DragOverlay>
                  {activeChannel ? (
                    <div className="rounded bg-gray-700 px-2 py-1 text-sm text-white shadow-lg border border-indigo-500">
                      <span className="flex items-center gap-1.5">
                        {activeChannel.type === CHANNEL.GUILD_VOICE ? (
                          <Volume2 className="h-4 w-4 text-gray-400" />
                        ) : (
                          <Hash className="h-4 w-4 text-gray-400" />
                        )}
                        {activeChannel.name}
                      </span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
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

      {/* Dialogs */}
      <CreateChannelDialog
        open={createChannelOpen}
        onOpenChange={setCreateChannelOpen}
        guildId={guildId}
      />

      <RenameChannelDialog
        open={!!renameChannel}
        onOpenChange={(open) => !open && setRenameChannel(null)}
        channel={renameChannel}
        onRename={handleRename}
      />

      {/* Context Menu */}
      <ChannelContextMenu
        channel={contextMenu?.channel ?? null}
        position={contextMenu?.position ?? null}
        categories={categories}
        onClose={() => setContextMenu(null)}
        onRename={(channel) => setRenameChannel(channel)}
        onMove={handleMove}
        onDelete={handleDelete}
      />

      {/* Invite Members Dialog */}
      <InviteMemberDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        guildId={guildId}
        guildName={guildName}
      />
    </>
  );
}
