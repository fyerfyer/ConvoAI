'use client';

import {
  Bot,
  Globe,
  MoreVertical,
  Pencil,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BotResponse, BOT_STATUS, BOT_TYPE } from '@discord-platform/shared';
import { cn } from '@/lib/utils';

interface BotCardProps {
  bot: BotResponse;
  onEdit: (bot: BotResponse) => void;
  onDelete: (bot: BotResponse) => void;
  onToggleStatus: (bot: BotResponse) => void;
  onRegenerateToken: (bot: BotResponse) => void;
}

export default function BotCard({
  bot,
  onEdit,
  onDelete,
  onToggleStatus,
  onRegenerateToken,
}: BotCardProps) {
  const isActive = bot.status === BOT_STATUS.ACTIVE;
  const isAgent = bot.type === BOT_TYPE.AGENT;

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors',
        isActive
          ? 'border-gray-600 bg-gray-800 hover:bg-gray-750'
          : 'border-gray-700 bg-gray-800/50 opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="relative shrink-0">
          <Avatar className="h-12 w-12">
            <AvatarImage src={bot.avatar || undefined} />
            <AvatarFallback className="bg-indigo-600 text-white text-sm font-bold">
              <Bot className="h-6 w-6" />
            </AvatarFallback>
          </Avatar>
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-gray-800',
              isActive ? 'bg-green-500' : 'bg-gray-500',
            )}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-white truncate">
              {bot.name}
            </span>
            <Badge
              variant="secondary"
              className={cn(
                'text-[10px] px-1.5 py-0',
                isAgent
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                  : 'bg-blue-500/20 text-blue-300 border-blue-500/30',
              )}
            >
              {isAgent ? 'Agent' : 'Bot'}
            </Badge>
            <Badge
              variant="secondary"
              className={cn(
                'text-[10px] px-1.5 py-0',
                isActive
                  ? 'bg-green-500/20 text-green-300'
                  : 'bg-gray-500/20 text-gray-400',
              )}
            >
              {isActive ? 'Online' : 'Offline'}
            </Badge>
          </div>

          {bot.description && (
            <p className="text-xs text-gray-400 line-clamp-2 mb-2">
              {bot.description}
            </p>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Globe className="h-3 w-3" />
            <span className="truncate max-w-[200px]">{bot.webhookUrl}</span>
          </div>
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white shrink-0"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-gray-900 border-gray-700"
          >
            <DropdownMenuItem
              className="text-gray-300 hover:text-white focus:text-white"
              onClick={() => onEdit(bot)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit Bot
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-gray-300 hover:text-white focus:text-white"
              onClick={() => onToggleStatus(bot)}
            >
              {isActive ? (
                <>
                  <PowerOff className="mr-2 h-4 w-4" />
                  Deactivate
                </>
              ) : (
                <>
                  <Power className="mr-2 h-4 w-4" />
                  Activate
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-gray-300 hover:text-white focus:text-white"
              onClick={() => onRegenerateToken(bot)}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Regenerate Token
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-700" />
            <DropdownMenuItem
              className="text-red-400 hover:text-red-300 focus:text-red-300"
              onClick={() => onDelete(bot)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Bot
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
