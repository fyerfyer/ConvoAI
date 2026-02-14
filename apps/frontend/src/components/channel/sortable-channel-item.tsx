'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Hash, Volume2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChannelResponse, CHANNEL } from '@discord-platform/shared';
import { cn } from '@/lib/utils';

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
          'w-full justify-start px-2 py-1 h-8 text-gray-300 hover:bg-gray-700 hover:text-white',
          isActive && 'bg-gray-700/60 text-white',
        )}
        onClick={onClick}
      >
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
      </Button>
    </div>
  );
}
