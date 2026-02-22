'use client';

import {
  Bot,
  Globe,
  LayoutTemplate,
  Cpu,
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
import {
  BotResponse,
  BOT_STATUS,
  BOT_SCOPE,
  EXECUTION_MODE,
} from '@discord-platform/shared';
import { cn } from '@/lib/utils';

interface BotCardProps {
  bot: BotResponse;
  onEdit: (bot: BotResponse) => void;
  onDelete: (bot: BotResponse) => void;
  onToggleStatus: (bot: BotResponse) => void;
  onRegenerateToken: (bot: BotResponse) => void;
}

const MODE_META: Record<
  string,
  { icon: React.ReactNode; label: string; color: string; avatarBg: string }
> = {
  [EXECUTION_MODE.WEBHOOK]: {
    icon: <Globe className="h-3 w-3" />,
    label: 'Webhook',
    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    avatarBg: 'bg-blue-600',
  },
  [EXECUTION_MODE.BUILTIN]: {
    icon: <LayoutTemplate className="h-3 w-3" />,
    label: 'Template',
    color: 'bg-green-500/20 text-green-300 border-green-500/30',
    avatarBg: 'bg-green-600',
  },
  [EXECUTION_MODE.MANAGED_LLM]: {
    icon: <Cpu className="h-3 w-3" />,
    label: 'AI Agent',
    color: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    avatarBg: 'bg-purple-600',
  },
};

function getModeDetail(bot: BotResponse): string {
  const mode = bot.executionMode;
  if (mode === EXECUTION_MODE.WEBHOOK) {
    return bot.webhookUrl || 'No URL configured';
  }
  if (mode === EXECUTION_MODE.BUILTIN) {
    return bot.templateId ? `Template: ${bot.templateId}` : 'No template';
  }
  if (mode === EXECUTION_MODE.MANAGED_LLM && bot.llmConfig) {
    const provider =
      bot.llmConfig.provider.charAt(0).toUpperCase() +
      bot.llmConfig.provider.slice(1);
    return `${provider} / ${bot.llmConfig.model}`;
  }
  return '';
}

export default function BotCard({
  bot,
  onEdit,
  onDelete,
  onToggleStatus,
  onRegenerateToken,
}: BotCardProps) {
  const isActive = bot.status === BOT_STATUS.ACTIVE;
  const mode = bot.executionMode || EXECUTION_MODE.WEBHOOK;
  const meta = MODE_META[mode] ?? MODE_META[EXECUTION_MODE.WEBHOOK];
  const detail = getModeDetail(bot);
  const isWebhook = mode === EXECUTION_MODE.WEBHOOK;

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
            <AvatarFallback
              className={cn('text-white text-sm font-bold', meta.avatarBg)}
            >
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
                'text-[10px] px-1.5 py-0 flex items-center gap-1',
                meta.color,
              )}
            >
              {meta.icon}
              {meta.label}
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
            {bot.scope === BOT_SCOPE.CHANNEL && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
              >
                {bot.channelBindingCount ?? 0} ch
              </Badge>
            )}
            {bot.scope === BOT_SCOPE.GUILD && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 bg-amber-500/20 text-amber-300 border-amber-500/30"
              >
                Guild-wide
              </Badge>
            )}
          </div>

          {bot.description && (
            <p className="text-xs text-gray-400 line-clamp-2 mb-2">
              {bot.description}
            </p>
          )}

          {detail && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              {isWebhook ? (
                <Globe className="h-3 w-3" />
              ) : mode === EXECUTION_MODE.BUILTIN ? (
                <LayoutTemplate className="h-3 w-3" />
              ) : (
                <Cpu className="h-3 w-3" />
              )}
              <span className="truncate max-w-[220px]">{detail}</span>
            </div>
          )}
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
            {isWebhook && (
              <DropdownMenuItem
                className="text-gray-300 hover:text-white focus:text-white"
                onClick={() => onRegenerateToken(bot)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate Token
              </DropdownMenuItem>
            )}
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
