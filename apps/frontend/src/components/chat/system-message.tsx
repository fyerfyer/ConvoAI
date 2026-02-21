'use client';

import { useMemo } from 'react';
import {
  LogIn,
  LogOut,
  UserPlus,
  Pin,
  Settings,
  ArrowRightLeft,
} from 'lucide-react';
import { MessageResponse } from '@discord-platform/shared';

interface SystemMessageProps {
  message: MessageResponse;
}

// Parse system message to determine type and render appropriately
function getSystemIcon(content: string) {
  if (content.includes('joined') || content.includes('welcome')) {
    return <LogIn className="h-4 w-4 text-green-400" />;
  }
  if (content.includes('left') || content.includes('removed')) {
    return <LogOut className="h-4 w-4 text-red-400" />;
  }
  if (content.includes('added') || content.includes('invited')) {
    return <UserPlus className="h-4 w-4 text-blue-400" />;
  }
  if (content.includes('pinned')) {
    return <Pin className="h-4 w-4 text-yellow-400" />;
  }
  if (content.includes('changed') || content.includes('updated')) {
    return <Settings className="h-4 w-4 text-gray-400" />;
  }
  return <ArrowRightLeft className="h-4 w-4 text-gray-400" />;
}

export default function SystemMessage({ message }: SystemMessageProps) {
  const timestamp = useMemo(() => {
    const date = new Date(message.createdAt);
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [message.createdAt]);

  return (
    <div className="flex items-center gap-2 py-1.5 px-4 my-1">
      <div className="h-[1px] flex-1 bg-gray-700" />
      <div className="flex items-center gap-2 shrink-0">
        {getSystemIcon(message.content)}
        <span className="text-xs text-gray-400">{message.content}</span>
        <span className="text-[10px] text-gray-600">{timestamp}</span>
      </div>
      <div className="h-[1px] flex-1 bg-gray-700" />
    </div>
  );
}
