'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Hash, Volume2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChannelResponse, CHANNEL } from '@discord-platform/shared';
import { cn } from '@/lib/utils';
import { useChannelUnreadCount } from '@/hooks/use-unread';

interface SortableChannelItemProps {
  channel: ChannelResponse;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export default function SortableChannelItem({
  channel,
  isActive,
  onClick,
  onContextMenu,
}: SortableChannelItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: channel.id,
    data: {
      type: 'channel',
      channel,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const unreadCount = useChannelUnreadCount(channel.id);
  const hasUnread = !isActive && unreadCount > 0;

  const renderChannelIcon = () => {
    if (channel.type === CHANNEL.GUILD_VOICE) {
      return <Volume2 className="mr-1.5 h-4 w-4 shrink-0 text-gray-400" />;
    }
    return <Hash className="mr-1.5 h-4 w-4 shrink-0 text-gray-400" />;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('group/channel relative', isDragging && 'opacity-50 z-50')}
      onContextMenu={onContextMenu}
    >
      <Button
        variant="ghost"
        className={cn(
          'relative w-full justify-start px-2 py-1 h-8 text-gray-300 hover:bg-gray-700 hover:text-white',
          isActive && 'bg-gray-700/60 text-white',
          hasUnread && 'text-white font-semibold',
        )}
        onClick={onClick}
      >
        {hasUnread && (
          <span className="pointer-events-none absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r bg-amber-400" />
        )}
        <span
          {...attributes}
          {...listeners}
          className="mr-1 cursor-grab opacity-0 group-hover/channel:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3 w-3 text-gray-500" />
        </span>
        {renderChannelIcon()}
        <span className="truncate">{channel.name}</span>
        {hasUnread && (
          <span className="ml-auto flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>
    </div>
  );
}
