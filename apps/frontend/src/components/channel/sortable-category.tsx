'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ChannelResponse } from '@discord-platform/shared';
import SortableChannelItem from './sortable-channel-item';
import { cn } from '@/lib/utils';

interface SortableCategoryProps {
  category: ChannelResponse;
  channels: ChannelResponse[];
  isCollapsed: boolean;
  activeChannelId?: string;
  unreadCount?: number;
  onToggle: () => void;
  onChannelClick: (channel: ChannelResponse) => void;
  onChannelContextMenu: (e: React.MouseEvent, channel: ChannelResponse) => void;
}

export default function SortableCategory({
  category,
  channels,
  isCollapsed,
  activeChannelId,
  unreadCount = 0,
  onToggle,
  onChannelClick,
  onChannelContextMenu,
}: SortableCategoryProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `category-${category.id}`,
    data: {
      type: 'category',
      category,
    },
  });

  const channelIds = channels.map((c) => c.id);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md transition-colors',
        isOver && 'bg-gray-700/50 ring-1 ring-indigo-500/50',
      )}
    >
      <button
        className="flex w-full items-center px-1 py-1 text-xs font-semibold uppercase text-gray-400 hover:text-gray-300"
        onClick={onToggle}
      >
        {isCollapsed ? (
          <ChevronRight className="mr-0.5 h-3 w-3" />
        ) : (
          <ChevronDown className="mr-0.5 h-3 w-3" />
        )}
        {category.name}
        {unreadCount > 0 && (
          <span className="ml-auto flex h-4 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] font-bold text-amber-300">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {!isCollapsed && (
        <SortableContext
          items={channelIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-0.5 ml-2">
            {channels.map((channel) => (
              <SortableChannelItem
                key={channel.id}
                channel={channel}
                isActive={activeChannelId === channel.id}
                onClick={() => onChannelClick(channel)}
                onContextMenu={(e) => onChannelContextMenu(e, channel)}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}
