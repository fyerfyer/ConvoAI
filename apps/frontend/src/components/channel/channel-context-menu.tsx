'use client';

import { useState, useEffect, useRef } from 'react';
import { Edit2, FolderInput, Trash2 } from 'lucide-react';
import { ChannelResponse, CHANNEL } from '@discord-platform/shared';

interface ChannelContextMenuProps {
  channel: ChannelResponse | null;
  position: { x: number; y: number } | null;
  categories: ChannelResponse[];
  onClose: () => void;
  onRename: (channel: ChannelResponse) => void;
  onMove: (channel: ChannelResponse, categoryId: string | null) => void;
  onDelete: (channel: ChannelResponse) => void;
}

export default function ChannelContextMenu({
  channel,
  position,
  categories,
  onClose,
  onRename,
  onMove,
  onDelete,
}: ChannelContextMenuProps) {
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  if (!channel || !position) return null;

  // Don't show context menu for categories themselves
  if (channel.type === CHANNEL.GUILD_CATEGORY) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[180px] rounded-md border border-gray-600 bg-gray-800 p-1 shadow-lg"
      style={{
        top: position.y,
        left: position.x,
      }}
    >
      {/* Rename */}
      <button
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-gray-200 hover:bg-indigo-500 hover:text-white transition-colors"
        onClick={() => {
          onRename(channel);
          onClose();
        }}
      >
        <Edit2 className="h-4 w-4" />
        Rename Channel
      </button>

      {/* Move to Category */}
      <div className="relative">
        <button
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-gray-200 hover:bg-indigo-500 hover:text-white transition-colors"
          onMouseEnter={() => setShowMoveSubmenu(true)}
          onMouseLeave={() => setShowMoveSubmenu(false)}
          onClick={() => setShowMoveSubmenu(!showMoveSubmenu)}
        >
          <FolderInput className="h-4 w-4" />
          Move to Category
        </button>

        {showMoveSubmenu && (
          <div
            className="absolute left-full top-0 ml-1 min-w-[160px] rounded-md border border-gray-600 bg-gray-800 p-1 shadow-lg"
            onMouseEnter={() => setShowMoveSubmenu(true)}
            onMouseLeave={() => setShowMoveSubmenu(false)}
          >
            {/* Uncategorized option */}
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-gray-200 hover:bg-indigo-500 hover:text-white transition-colors"
              onClick={() => {
                onMove(channel, null);
                onClose();
              }}
            >
              No Category
            </button>

            {categories.map((cat) => (
              <button
                key={cat.id}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-gray-200 hover:bg-indigo-500 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={channel.parentId === cat.id}
                onClick={() => {
                  onMove(channel, cat.id);
                  onClose();
                }}
              >
                {cat.name}
                {channel.parentId === cat.id && (
                  <span className="ml-auto text-xs text-gray-500">current</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="my-1 h-px bg-gray-700" />

      {/* Delete */}
      <button
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-red-400 hover:bg-red-500 hover:text-white transition-colors"
        onClick={() => {
          onDelete(channel);
          onClose();
        }}
      >
        <Trash2 className="h-4 w-4" />
        Delete Channel
      </button>
    </div>
  );
}
