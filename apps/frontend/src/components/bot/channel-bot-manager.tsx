'use client';

import { useState } from 'react';
import { Bot, Plus, Trash2, Settings2, Power, PowerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useChannelBots, useBots, useUnbindBot } from '@/hooks/use-bot';
import { ChannelBotResponse, EXECUTION_MODE } from '@discord-platform/shared';
import { cn } from '@/lib/utils';
import BindBotDialog from './bind-bot-dialog';
import EditChannelBotDialog from './edit-channel-bot-dialog';

interface ChannelBotManagerProps {
  channelId: string;
  guildId: string;
}

export default function ChannelBotManager({
  channelId,
  guildId,
}: ChannelBotManagerProps) {
  const { data: channelBots = [], isLoading } = useChannelBots(channelId);
  const unbindBot = useUnbindBot();

  const [bindOpen, setBindOpen] = useState(false);
  const [editBinding, setEditBinding] = useState<ChannelBotResponse | null>(
    null,
  );

  const handleUnbind = (binding: ChannelBotResponse) => {
    if (
      confirm(
        `Remove "${binding.botName}" from this channel? The bot definition will not be deleted.`,
      )
    ) {
      unbindBot.mutate({
        bindingId: binding.id,
        channelId: binding.channelId,
        botId: binding.botId,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-gray-700 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-white">Channel Bots</h4>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Bots bound to this channel with per-channel overrides.
          </p>
        </div>
        <Button
          onClick={() => setBindOpen(true)}
          size="sm"
          variant="outline"
          className="border-gray-600 text-gray-300 hover:text-white hover:bg-gray-700 h-7 text-xs"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Bind Bot
        </Button>
      </div>

      {/* Binding list */}
      {channelBots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-600 p-6 text-center">
          <Bot className="mx-auto h-8 w-8 text-gray-500 mb-2" />
          <p className="text-xs text-gray-400 mb-3">
            No bots bound to this channel yet.
          </p>
          <Button
            onClick={() => setBindOpen(true)}
            size="sm"
            variant="outline"
            className="border-gray-600 text-gray-300 hover:text-white hover:bg-gray-700 text-xs"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Bind a Bot
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {channelBots.map((binding) => (
            <ChannelBotCard
              key={binding.id}
              binding={binding}
              onEdit={setEditBinding}
              onUnbind={handleUnbind}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <BindBotDialog
        open={bindOpen}
        onOpenChange={setBindOpen}
        channelId={channelId}
        guildId={guildId}
      />
      <EditChannelBotDialog
        open={!!editBinding}
        onOpenChange={(open) => !open && setEditBinding(null)}
        binding={editBinding}
      />
    </div>
  );
}

// ── Channel Bot Card ──

interface ChannelBotCardProps {
  binding: ChannelBotResponse;
  onEdit: (binding: ChannelBotResponse) => void;
  onUnbind: (binding: ChannelBotResponse) => void;
}

const MODE_COLORS: Record<string, string> = {
  [EXECUTION_MODE.WEBHOOK]: 'bg-blue-600',
  [EXECUTION_MODE.BUILTIN]: 'bg-green-600',
  [EXECUTION_MODE.MANAGED_LLM]: 'bg-purple-600',
};

function ChannelBotCard({ binding, onEdit, onUnbind }: ChannelBotCardProps) {
  const avatarBg =
    MODE_COLORS[binding.executionMode] ?? MODE_COLORS[EXECUTION_MODE.WEBHOOK];

  return (
    <div
      className={cn(
        'rounded-lg border p-3 flex items-center gap-3 transition-colors',
        binding.enabled
          ? 'border-gray-600 bg-gray-800'
          : 'border-gray-700 bg-gray-800/50 opacity-60',
      )}
    >
      {/* Avatar */}
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage src={binding.botAvatar || undefined} />
        <AvatarFallback className={cn('text-white text-xs', avatarBg)}>
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-white truncate">
            {binding.botName}
          </span>
          <Badge
            variant="secondary"
            className={cn(
              'text-[9px] px-1 py-0',
              binding.enabled
                ? 'bg-green-500/20 text-green-300'
                : 'bg-gray-500/20 text-gray-400',
            )}
          >
            {binding.enabled ? 'On' : 'Off'}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {binding.overridePrompt && (
            <span className="text-[10px] text-cyan-400">Custom prompt</span>
          )}
          <span className="text-[10px] text-gray-500">
            Memory: {binding.memoryScope}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-gray-400 hover:text-white"
          onClick={() => onEdit(binding)}
          title="Edit channel binding"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-gray-400 hover:text-red-400"
          onClick={() => onUnbind(binding)}
          title="Remove from channel"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
