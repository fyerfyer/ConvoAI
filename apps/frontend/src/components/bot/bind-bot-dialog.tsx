'use client';

import { useState, useMemo } from 'react';
import { Bot, Check, Cpu, Globe, LayoutTemplate } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useBots, useBindBot, useChannelBots } from '@/hooks/use-bot';
import {
  BotResponse,
  BOT_SCOPE,
  BOT_STATUS,
  EXECUTION_MODE,
  LLM_TOOL,
  MEMORY_SCOPE,
} from '@discord-platform/shared';
import { cn } from '@/lib/utils';

interface BindBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  guildId: string;
}

const TOOL_LABELS: Record<string, string> = {
  [LLM_TOOL.WEB_SEARCH]: 'Web Search',
  [LLM_TOOL.CODE_EXECUTION]: 'Code Execution',
  [LLM_TOOL.SUMMARIZE_USER]: 'Summarize User',
  [LLM_TOOL.CHANNEL_HISTORY]: 'Channel History',
  [LLM_TOOL.GUILD_INFO]: 'Guild Info',
  [LLM_TOOL.MEMBER_LIST]: 'Member List',
};

export default function BindBotDialog({
  open,
  onOpenChange,
  channelId,
  guildId,
}: BindBotDialogProps) {
  const { data: allBots = [] } = useBots(guildId);
  const { data: channelBots = [] } = useChannelBots(channelId);
  const bindBot = useBindBot();

  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [overridePrompt, setOverridePrompt] = useState('');
  const [overrideTools, setOverrideTools] = useState<string[]>([]);
  const [useToolOverride, setUseToolOverride] = useState(false);
  const [memoryScope, setMemoryScope] = useState<string>(
    MEMORY_SCOPE.CHANNEL,
  );

  // Filter to channel-scope bots not yet bound to this channel
  const alreadyBoundBotIds = new Set(channelBots.map((cb) => cb.botId));
  const availableBots = useMemo(
    () =>
      allBots.filter(
        (b: BotResponse) =>
          b.scope === BOT_SCOPE.CHANNEL &&
          b.status === BOT_STATUS.ACTIVE &&
          !alreadyBoundBotIds.has(b.id),
      ),
    [allBots, alreadyBoundBotIds],
  );

  const selectedBot = availableBots.find(
    (b: BotResponse) => b.id === selectedBotId,
  );

  const handleSubmit = async () => {
    if (!selectedBotId) return;

    try {
      await bindBot.mutateAsync({
        botId: selectedBotId,
        channelId,
        enabled: true,
        memoryScope: memoryScope as 'channel' | 'ephemeral',
        ...(overridePrompt.trim()
          ? { overridePrompt: overridePrompt.trim() }
          : {}),
        ...(useToolOverride
          ? {
              overrideTools: overrideTools as Array<
                | 'web-search'
                | 'code-execution'
                | 'image-generation'
                | 'summarize-user'
                | 'channel-history'
                | 'guild-info'
                | 'member-list'
              >,
            }
          : {}),
      });
      handleClose();
    } catch {
      // handled by mutation
    }
  };

  const handleClose = () => {
    setSelectedBotId('');
    setOverridePrompt('');
    setOverrideTools([]);
    setUseToolOverride(false);
    setMemoryScope(MEMORY_SCOPE.CHANNEL);
    onOpenChange(false);
  };

  const toggleTool = (tool: string) => {
    setOverrideTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  };

  const modeIcon = (mode: string) => {
    if (mode === EXECUTION_MODE.WEBHOOK)
      return <Globe className="h-3.5 w-3.5 text-blue-400" />;
    if (mode === EXECUTION_MODE.BUILTIN)
      return <LayoutTemplate className="h-3.5 w-3.5 text-green-400" />;
    return <Cpu className="h-3.5 w-3.5 text-purple-400" />;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bind Bot to Channel</DialogTitle>
          <DialogDescription className="text-gray-400">
            Select a channel-scoped bot and optionally override its
            configuration for this channel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bot Selection */}
          <div>
            <Label className="text-gray-300 text-xs mb-2 block">
              Select Bot
            </Label>
            {availableBots.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">
                No available channel-scoped bots to bind. Create a
                channel-scoped bot first.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {availableBots.map((bot: BotResponse) => (
                  <button
                    key={bot.id}
                    type="button"
                    onClick={() => setSelectedBotId(bot.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-all',
                      selectedBotId === bot.id
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-gray-600 bg-gray-700/50 hover:border-gray-500',
                    )}
                  >
                    {modeIcon(bot.executionMode)}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-white truncate block">
                        {bot.name}
                      </span>
                      {bot.description && (
                        <span className="text-[10px] text-gray-400 truncate block">
                          {bot.description}
                        </span>
                      )}
                    </div>
                    {selectedBotId === bot.id && (
                      <Check className="h-4 w-4 text-cyan-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Channel-level overrides (only for managed LLM bots) */}
          {selectedBot?.executionMode === EXECUTION_MODE.MANAGED_LLM && (
            <>
              {/* Override System Prompt */}
              <div>
                <Label className="text-gray-300 text-xs">
                  Override System Prompt (optional)
                </Label>
                <Textarea
                  value={overridePrompt}
                  onChange={(e) => setOverridePrompt(e.target.value)}
                  placeholder="Leave empty to use the bot's default prompt..."
                  className="mt-1 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500 resize-none text-sm"
                  rows={3}
                  maxLength={4000}
                />
                <p className="mt-1 text-[10px] text-gray-500">
                  Replaces the bot&apos;s default system prompt for this channel
                  only.
                </p>
              </div>

              {/* Override Tools */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Switch
                    checked={useToolOverride}
                    onCheckedChange={setUseToolOverride}
                  />
                  <Label className="text-gray-300 text-xs">
                    Override tools for this channel
                  </Label>
                </div>
                {useToolOverride && (
                  <div className="space-y-1.5">
                    {Object.entries(TOOL_LABELS).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleTool(key)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all',
                          overrideTools.includes(key)
                            ? 'border-cyan-500/50 bg-cyan-500/10'
                            : 'border-gray-600 bg-gray-700/30 hover:border-gray-500',
                        )}
                      >
                        <div
                          className={cn(
                            'h-3.5 w-3.5 rounded-sm border flex items-center justify-center',
                            overrideTools.includes(key)
                              ? 'border-cyan-500 bg-cyan-500'
                              : 'border-gray-500',
                          )}
                        >
                          {overrideTools.includes(key) && (
                            <Check className="h-2.5 w-2.5 text-white" />
                          )}
                        </div>
                        <span className="text-xs text-white">{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Memory Scope */}
              <div>
                <Label className="text-gray-300 text-xs mb-2 block">
                  Memory Scope
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMemoryScope(MEMORY_SCOPE.CHANNEL)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left transition-all',
                      memoryScope === MEMORY_SCOPE.CHANNEL
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-gray-600 bg-gray-700/50 hover:border-gray-500',
                    )}
                  >
                    <div className="text-xs font-medium text-white">
                      Channel
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      Full channel history as context
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMemoryScope(MEMORY_SCOPE.EPHEMERAL)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left transition-all',
                      memoryScope === MEMORY_SCOPE.EPHEMERAL
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-gray-600 bg-gray-700/50 hover:border-gray-500',
                    )}
                  >
                    <div className="text-xs font-medium text-white">
                      Ephemeral
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      No conversation history
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleClose}
            className="text-gray-400"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedBotId || bindBot.isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {bindBot.isPending && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
            )}
            Bind Bot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
