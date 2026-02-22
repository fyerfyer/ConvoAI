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
  Bot,
  Cpu,
  Shield,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import GuildSettingsDialog from '@/components/guild/guild-settings-dialog';
import CreateBotDialog from '@/components/bot/create-bot-dialog';
import ChannelBotDialog from '@/components/bot/channel-bot-dialog';
import { useBots } from '@/hooks/use-bot';
import { usePermissions } from '@/hooks/use-permission';
import VoiceStatusBar from '@/components/voice/voice-status-bar';
import { CHANNEL, ChannelResponse, BOT_STATUS } from '@discord-platform/shared';

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

  // Guild settings dialog state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDefaultTab, setSettingsDefaultTab] = useState('bots');

  // Bot creation dialog state
  const [createBotOpen, setCreateBotOpen] = useState(false);

  // Channel Bot management dialog state
  const [channelBotDialogChannel, setChannelBotDialogChannel] =
    useState<ChannelResponse | null>(null);

  // Bots query
  const { data: bots = [] } = useBots(guildId);

  // Permissions
  const { canManageRoles } = usePermissions(guildId);
  const activeBots = bots.filter((b) => b.status === BOT_STATUS.ACTIVE);

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
      guildId: guildId,
      data: { name: newName },
    });
  };

  const handleMove = (channel: ChannelResponse, categoryId: string | null) => {
    updateChannel.mutate({
      channelId: channel.id,
      guildId: guildId,
      data: { parentId: categoryId },
    });
  };

  const handleDelete = (channel: ChannelResponse) => {
    if (confirm(`Are you sure you want to delete #${channel.name}?`)) {
      deleteChannel.mutate({
        channelId: channel.id,
        guildId: guildId,
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
          guildId: guildId,
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
          guildId: guildId,
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
        {/* Guild Name Header with Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-12 w-full items-center justify-between px-4 shadow-md hover:bg-gray-700/50 transition-colors">
              <h2 className="font-semibold truncate">{guildName}</h2>
              <ChevronDown className="h-4 w-4 text-gray-400 shrink-0 ml-1" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-56 bg-gray-900 border-gray-700"
          >
            <DropdownMenuItem
              className="text-gray-300 hover:text-white focus:text-white gap-2"
              onClick={() => setInviteDialogOpen(true)}
            >
              <UserPlus className="h-4 w-4" />
              Invite People
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-700" />
            <DropdownMenuItem
              className="text-gray-300 hover:text-white focus:text-white gap-2"
              onClick={() => setCreateBotOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Create Bot / Agent
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-gray-300 hover:text-white focus:text-white gap-2"
              onClick={() => {
                setSettingsDefaultTab('bots');
                setSettingsOpen(true);
              }}
            >
              <Bot className="h-4 w-4" />
              Manage Bots & Agents
            </DropdownMenuItem>
            {canManageRoles && (
              <>
                <DropdownMenuSeparator className="bg-gray-700" />
                <DropdownMenuItem
                  className="text-gray-300 hover:text-white focus:text-white gap-2"
                  onClick={() => {
                    setSettingsDefaultTab('roles');
                    setSettingsOpen(true);
                  }}
                >
                  <Shield className="h-4 w-4" />
                  Roles & Permissions
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator className="bg-gray-700" />
            <DropdownMenuItem
              className="text-gray-300 hover:text-white focus:text-white gap-2"
              onClick={() => {
                setSettingsDefaultTab('overview');
                setSettingsOpen(true);
              }}
            >
              <Settings className="h-4 w-4" />
              Guild Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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

        {/* Active Bots Quick Section */}
        {activeBots.length > 0 && (
          <div className="border-t border-gray-700">
            <button
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase text-gray-400 hover:text-gray-300"
              onClick={() => toggleSection('bots')}
            >
              <span className="flex items-center gap-1">
                {collapsedSections['bots'] ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Bots ({activeBots.length})
              </span>
              <Plus
                className="h-3.5 w-3.5 text-gray-500 hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setCreateBotOpen(true);
                }}
              />
            </button>
            {!collapsedSections['bots'] && (
              <div className="px-2 pb-2 space-y-0.5">
                {activeBots.map((bot) => (
                  <button
                    key={bot.id}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-colors"
                    onClick={() => {
                      setSettingsDefaultTab('bots');
                      setSettingsOpen(true);
                    }}
                    title={bot.description || bot.name}
                  >
                    {bot.type === 'agent' ? (
                      <Cpu className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                    ) : (
                      <Bot className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    )}
                    <span className="truncate text-xs">{bot.name}</span>
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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

        {/* Voice Status Bar */}
        <VoiceStatusBar />
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
        onManageBots={(channel) => setChannelBotDialogChannel(channel)}
      />

      {/* Invite Members Dialog */}
      <InviteMemberDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        guildId={guildId}
        guildName={guildName}
      />

      {/* Guild Settings Dialog */}
      <GuildSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        guild={activeGuild}
        defaultTab={settingsDefaultTab}
      />

      {/* Create Bot Shortcut Dialog */}
      {guildId && (
        <CreateBotDialog
          open={createBotOpen}
          onOpenChange={setCreateBotOpen}
          guildId={guildId}
        />
      )}

      {/* Channel Bot Management Dialog */}
      {guildId && channelBotDialogChannel && (
        <ChannelBotDialog
          open={!!channelBotDialogChannel}
          onOpenChange={(open) => !open && setChannelBotDialogChannel(null)}
          channelId={channelBotDialogChannel.id}
          channelName={channelBotDialogChannel.name}
          guildId={guildId}
        />
      )}
    </>
  );
}
