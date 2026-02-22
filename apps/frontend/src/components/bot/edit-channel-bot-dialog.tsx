'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Check } from 'lucide-react';
import { useUpdateChannelBot } from '@/hooks/use-bot';
import {
  ChannelBotResponse,
  EXECUTION_MODE,
  LLM_TOOL,
  MEMORY_SCOPE,
} from '@discord-platform/shared';
import { cn } from '@/lib/utils';

interface EditChannelBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binding: ChannelBotResponse | null;
}

const TOOL_LABELS: Record<string, string> = {
  [LLM_TOOL.WEB_SEARCH]: 'Web Search',
  [LLM_TOOL.CODE_EXECUTION]: 'Code Execution',
  [LLM_TOOL.SUMMARIZE_USER]: 'Summarize User',
  [LLM_TOOL.CHANNEL_HISTORY]: 'Channel History',
  [LLM_TOOL.GUILD_INFO]: 'Guild Info',
  [LLM_TOOL.MEMBER_LIST]: 'Member List',
};

export default function EditChannelBotDialog({
  open,
  onOpenChange,
  binding,
}: EditChannelBotDialogProps) {
  const [enabled, setEnabled] = useState(true);
  const [overridePrompt, setOverridePrompt] = useState('');
  const [overrideTools, setOverrideTools] = useState<string[]>([]);
  const [useToolOverride, setUseToolOverride] = useState(false);
  const [memoryScope, setMemoryScope] = useState<string>(MEMORY_SCOPE.CHANNEL);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [canSummarize, setCanSummarize] = useState(true);
  const [canUseTools, setCanUseTools] = useState(true);

  const updateChannelBot = useUpdateChannelBot();

  useEffect(() => {
    if (!binding) return;
    setEnabled(binding.enabled);
    setOverridePrompt(binding.overridePrompt || '');
    setOverrideTools(binding.overrideTools || []);
    setUseToolOverride(
      !!binding.overrideTools && binding.overrideTools.length > 0,
    );
    setMemoryScope(binding.memoryScope);
    setMaxTokens(binding.policy?.maxTokensPerRequest ?? 4096);
    setCanSummarize(binding.policy?.canSummarize ?? true);
    setCanUseTools(binding.policy?.canUseTools ?? true);
  }, [binding]);

  const handleSubmit = async () => {
    if (!binding) return;

    try {
      await updateChannelBot.mutateAsync({
        bindingId: binding.id,
        channelId: binding.channelId,
        botId: binding.botId,
        data: {
          enabled,
          overridePrompt: overridePrompt.trim() || undefined,
          overrideTools: useToolOverride
            ? (overrideTools as Array<
                | 'web-search'
                | 'code-execution'
                | 'image-generation'
                | 'summarize-user'
                | 'channel-history'
                | 'guild-info'
                | 'member-list'
              >)
            : undefined,
          memoryScope: memoryScope as 'channel' | 'ephemeral',
          policy: {
            canSummarize,
            canUseTools,
            maxTokensPerRequest: maxTokens,
          },
        },
      });
      onOpenChange(false);
    } catch {
      // handled by mutation
    }
  };

  const toggleTool = (tool: string) => {
    setOverrideTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  };

  const isLlm = binding?.executionMode === EXECUTION_MODE.MANAGED_LLM;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Channel Binding — {binding?.botName}</DialogTitle>
          <DialogDescription className="text-gray-400">
            Configure per-channel overrides for this bot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Enabled */}
          <div className="flex items-center justify-between">
            <Label className="text-gray-300 text-xs">Enabled</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {isLlm && (
            <>
              {/* Override Prompt */}
              <div>
                <Label className="text-gray-300 text-xs">
                  Override System Prompt
                </Label>
                <Textarea
                  value={overridePrompt}
                  onChange={(e) => setOverridePrompt(e.target.value)}
                  placeholder="Leave empty to use bot default..."
                  className="mt-1 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500 resize-none text-sm"
                  rows={3}
                  maxLength={4000}
                />
              </div>

              {/* Override Tools */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Switch
                    checked={useToolOverride}
                    onCheckedChange={setUseToolOverride}
                  />
                  <Label className="text-gray-300 text-xs">
                    Override tools
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
                    <div className="text-[10px] text-gray-400">
                      Full history context
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
                    <div className="text-[10px] text-gray-400">No history</div>
                  </button>
                </div>
              </div>

              {/* Policy */}
              <div>
                <Label className="text-gray-300 text-xs mb-2 block">
                  Channel Policy
                </Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Can summarize</span>
                    <Switch
                      checked={canSummarize}
                      onCheckedChange={setCanSummarize}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Can use tools</span>
                    <Switch
                      checked={canUseTools}
                      onCheckedChange={setCanUseTools}
                    />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-[11px]">
                      Max tokens per request
                    </Label>
                    <Input
                      type="number"
                      value={maxTokens}
                      onChange={(e) =>
                        setMaxTokens(
                          Math.min(16384, Math.max(1, Number(e.target.value))),
                        )
                      }
                      className="mt-1 bg-gray-900 border-gray-600 text-white text-sm"
                      min={1}
                      max={16384}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-gray-400"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={updateChannelBot.isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {updateChannelBot.isPending && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
            )}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
