'use client';

import { useState } from 'react';
import {
  Terminal,
  Clock,
  Zap,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SLASH_PARAM_TYPE,
  SLASH_HANDLER_TYPE,
  SCHEDULE_ACTION_TYPE,
  BOT_EVENT_SUB_TYPE,
  EVENT_ACTION_TYPE,
  LLM_TOOL,
  type SlashCommand,
  type SlashCommandParam,
  type BotSchedule,
  type BotEventSubscription,
  type ChannelResponse,
} from '@discord-platform/shared';
import { cn } from '@/lib/utils';

// Available tools for slash command tool handler
const AVAILABLE_TOOLS: {
  id: string;
  name: string;
  description: string;
}[] = [
  {
    id: LLM_TOOL.WEB_SEARCH,
    name: 'Web Search',
    description: 'Search the web for current information',
  },
  {
    id: LLM_TOOL.CODE_EXECUTION,
    name: 'Code Execution',
    description: 'Evaluate code and math expressions',
  },
  {
    id: LLM_TOOL.SUMMARIZE_USER,
    name: 'Summarize User',
    description: "Summarize a user's recent messages",
  },
  {
    id: LLM_TOOL.CHANNEL_HISTORY,
    name: 'Channel History',
    description: 'Read recent channel messages',
  },
  {
    id: LLM_TOOL.GUILD_INFO,
    name: 'Guild Info',
    description: 'Get server info (channels, members, etc.)',
  },
  {
    id: LLM_TOOL.MEMBER_LIST,
    name: 'Member List',
    description: 'List all members in the server',
  },
];

// ── Types ──
interface TriggerConfigSectionProps {
  commands: SlashCommand[];
  onCommandsChange: (commands: SlashCommand[]) => void;
  schedules: BotSchedule[];
  onSchedulesChange: (schedules: BotSchedule[]) => void;
  eventSubscriptions: BotEventSubscription[];
  onEventSubscriptionsChange: (subs: BotEventSubscription[]) => void;
  channels?: ChannelResponse[];
}

// ── Cron Presets ──
const CRON_PRESETS: { label: string; value: string }[] = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at 9am', value: '0 9 * * *' },
  { label: 'Every Monday at 9am', value: '0 9 * * 1' },
  { label: 'Custom', value: '' },
];

// ── Section toggle ──
type Section = 'commands' | 'schedules' | 'events';

export default function TriggerConfigSection({
  commands,
  onCommandsChange,
  schedules,
  onSchedulesChange,
  eventSubscriptions,
  onEventSubscriptionsChange,
  channels = [],
}: TriggerConfigSectionProps) {
  const [expanded, setExpanded] = useState<Record<Section, boolean>>({
    commands: commands.length > 0,
    schedules: schedules.length > 0,
    events: eventSubscriptions.length > 0,
  });

  const toggle = (section: Section) =>
    setExpanded((p) => ({ ...p, [section]: !p[section] }));

  return (
    <div className="space-y-3 pt-2">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
        Triggers & Automation
      </div>

      {/* ── Slash Commands ── */}
      <CollapsibleSection
        icon={<Terminal className="h-4 w-4 text-cyan-400" />}
        title="Slash Commands"
        count={commands.length}
        expanded={expanded.commands}
        onToggle={() => toggle('commands')}
      >
        <SlashCommandEditor commands={commands} onChange={onCommandsChange} />
      </CollapsibleSection>

      {/* ── Schedules ── */}
      <CollapsibleSection
        icon={<Clock className="h-4 w-4 text-amber-400" />}
        title="Schedules"
        count={schedules.length}
        expanded={expanded.schedules}
        onToggle={() => toggle('schedules')}
      >
        <ScheduleEditor
          schedules={schedules}
          onChange={onSchedulesChange}
          channels={channels}
        />
      </CollapsibleSection>

      {/* ── Event Subscriptions ── */}
      <CollapsibleSection
        icon={<Zap className="h-4 w-4 text-yellow-400" />}
        title="Event Triggers"
        count={eventSubscriptions.length}
        expanded={expanded.events}
        onToggle={() => toggle('events')}
      >
        <EventSubscriptionEditor
          subscriptions={eventSubscriptions}
          onChange={onEventSubscriptionsChange}
          channels={channels}
        />
      </CollapsibleSection>
    </div>
  );
}

// ═══════════════════════════════════════════
// Collapsible Section wrapper
// ═══════════════════════════════════════════
function CollapsibleSection({
  icon,
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-700/30"
      >
        {icon}
        <span className="text-sm font-medium text-gray-200">{title}</span>
        {count > 0 && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 bg-indigo-500/20 text-indigo-300"
          >
            {count}
          </Badge>
        )}
        <span className="flex-1" />
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-gray-700 px-3 py-3 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// Slash Command Editor
// ═══════════════════════════════════════════
function SlashCommandEditor({
  commands,
  onChange,
}: {
  commands: SlashCommand[];
  onChange: (cmds: SlashCommand[]) => void;
}) {
  const addCommand = () => {
    onChange([
      ...commands,
      {
        name: '',
        description: '',
        params: [],
        handler: {
          type: SLASH_HANDLER_TYPE.PROMPT as 'prompt' | 'tool',
          promptTemplate: '',
        },
      },
    ]);
  };

  const updateCommand = (idx: number, patch: Partial<SlashCommand>) => {
    const next = [...commands];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeCommand = (idx: number) => {
    onChange(commands.filter((_, i) => i !== idx));
  };

  const addParam = (cmdIdx: number) => {
    const next = [...commands];
    next[cmdIdx] = {
      ...next[cmdIdx],
      params: [
        ...next[cmdIdx].params,
        {
          name: '',
          description: '',
          type: SLASH_PARAM_TYPE.STRING as
            | 'string'
            | 'number'
            | 'boolean'
            | 'user',
          required: false,
        },
      ],
    };
    onChange(next);
  };

  const updateParam = (
    cmdIdx: number,
    paramIdx: number,
    patch: Partial<SlashCommandParam>,
  ) => {
    const next = [...commands];
    const params = [...next[cmdIdx].params];
    params[paramIdx] = { ...params[paramIdx], ...patch };
    next[cmdIdx] = { ...next[cmdIdx], params };
    onChange(next);
  };

  const removeParam = (cmdIdx: number, paramIdx: number) => {
    const next = [...commands];
    next[cmdIdx] = {
      ...next[cmdIdx],
      params: next[cmdIdx].params.filter((_, i) => i !== paramIdx),
    };
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {commands.map((cmd, idx) => (
        <div
          key={idx}
          className="rounded-md border border-gray-600 bg-gray-900/50 p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm">/</span>
            <Input
              value={cmd.name}
              onChange={(e) =>
                updateCommand(idx, {
                  name: e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9_-]/g, ''),
                })
              }
              placeholder="command-name"
              className="flex-1 h-8 bg-gray-800 border-gray-600 text-sm text-white"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-500 hover:text-red-400"
              onClick={() => removeCommand(idx)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Input
            value={cmd.description}
            onChange={(e) =>
              updateCommand(idx, { description: e.target.value })
            }
            placeholder="Command description"
            className="h-8 bg-gray-800 border-gray-600 text-xs text-white"
          />

          {/* Handler */}
          <div className="space-y-1.5">
            <Label className="text-gray-400 text-[11px]">Handler</Label>
            <div className="flex gap-2">
              <Select
                value={cmd.handler.type}
                onValueChange={(v) =>
                  updateCommand(idx, {
                    handler: { ...cmd.handler, type: v as 'prompt' | 'tool' },
                  })
                }
              >
                <SelectTrigger className="h-8 w-28 bg-gray-800 border-gray-600 text-xs text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700 text-gray-100">
                  <SelectItem value={SLASH_HANDLER_TYPE.PROMPT}>
                    Prompt
                  </SelectItem>
                  <SelectItem value={SLASH_HANDLER_TYPE.TOOL}>Tool</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cmd.handler.type === SLASH_HANDLER_TYPE.PROMPT && (
              <Textarea
                value={cmd.handler.promptTemplate || ''}
                onChange={(e) =>
                  updateCommand(idx, {
                    handler: { ...cmd.handler, promptTemplate: e.target.value },
                  })
                }
                placeholder="Prompt template (use {param_name} for variables)"
                className="h-16 bg-gray-800 border-gray-600 text-xs text-white resize-none"
              />
            )}
            {cmd.handler.type === SLASH_HANDLER_TYPE.TOOL && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-gray-500 mb-1">
                  Select a tool for this command to use:
                </div>
                <div className="space-y-1">
                  {AVAILABLE_TOOLS.map((tool) => {
                    const isSelected = cmd.handler.toolId === tool.id;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() =>
                          updateCommand(idx, {
                            handler: {
                              ...cmd.handler,
                              toolId: isSelected ? '' : tool.id,
                            },
                          })
                        }
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left transition-all',
                          isSelected
                            ? 'border-cyan-500/50 bg-cyan-500/10'
                            : 'border-gray-600 bg-gray-800/50 hover:border-gray-500',
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
                            isSelected
                              ? 'border-cyan-500 bg-cyan-500'
                              : 'border-gray-500',
                          )}
                        >
                          {isSelected && (
                            <div className="h-1.5 w-1.5 rounded-full bg-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium text-white">
                            {tool.name}
                          </div>
                          <div className="text-[10px] text-gray-400 truncate">
                            {tool.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Params */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-gray-400 text-[11px]">Parameters</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] text-indigo-400 hover:text-indigo-300 px-2"
                onClick={() => addParam(idx)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
            {cmd.params.map((param, pIdx) => (
              <div key={pIdx} className="flex items-center gap-1.5">
                <Input
                  value={param.name}
                  onChange={(e) =>
                    updateParam(idx, pIdx, {
                      name: e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9_]/g, ''),
                    })
                  }
                  placeholder="name"
                  className="w-24 h-7 bg-gray-800 border-gray-600 text-[11px] text-white"
                />
                <Select
                  value={param.type}
                  onValueChange={(v) =>
                    updateParam(idx, pIdx, {
                      type: v as 'string' | 'number' | 'boolean' | 'user',
                    })
                  }
                >
                  <SelectTrigger className="h-7 w-20 bg-gray-800 border-gray-600 text-[11px] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700 text-gray-100">
                    <SelectItem value={SLASH_PARAM_TYPE.STRING}>
                      String
                    </SelectItem>
                    <SelectItem value={SLASH_PARAM_TYPE.NUMBER}>
                      Number
                    </SelectItem>
                    <SelectItem value={SLASH_PARAM_TYPE.BOOLEAN}>
                      Boolean
                    </SelectItem>
                    <SelectItem value={SLASH_PARAM_TYPE.USER}>User</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={param.required}
                    onCheckedChange={(v) =>
                      updateParam(idx, pIdx, { required: v })
                    }
                    className="scale-75"
                  />
                  <span className="text-[10px] text-gray-500">Req</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-500 hover:text-red-400"
                  onClick={() => removeParam(idx, pIdx)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="w-full border-dashed border-gray-600 text-gray-400 hover:text-white text-xs h-8"
        onClick={addCommand}
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add Slash Command
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════
// Schedule Editor
// ═══════════════════════════════════════════
function ScheduleEditor({
  schedules,
  onChange,
  channels = [],
}: {
  schedules: BotSchedule[];
  onChange: (s: BotSchedule[]) => void;
  channels?: ChannelResponse[];
}) {
  const addSchedule = () => {
    onChange([
      ...schedules,
      {
        id: `sched_${Date.now()}`,
        cron: '0 9 * * *',
        channelId: '',
        action: {
          type: SCHEDULE_ACTION_TYPE.STATIC_MESSAGE as
            | 'prompt'
            | 'template_command'
            | 'static_message',
          message: '',
        },
        enabled: true,
        description: '',
      },
    ]);
  };

  const updateSchedule = (idx: number, patch: Partial<BotSchedule>) => {
    const next = [...schedules];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeSchedule = (idx: number) => {
    onChange(schedules.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      {schedules.map((sched, idx) => (
        <div
          key={sched.id}
          className="rounded-md border border-gray-600 bg-gray-900/50 p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <Input
              value={sched.description || ''}
              onChange={(e) =>
                updateSchedule(idx, { description: e.target.value })
              }
              placeholder="Schedule description"
              className="flex-1 h-8 bg-gray-800 border-gray-600 text-sm text-white"
            />
            <Switch
              checked={sched.enabled}
              onCheckedChange={(v) => updateSchedule(idx, { enabled: v })}
              className="scale-90"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-500 hover:text-red-400"
              onClick={() => removeSchedule(idx)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Cron */}
          <div className="space-y-1">
            <Label className="text-gray-400 text-[11px]">Cron Expression</Label>
            <div className="flex gap-2">
              <Select
                value={
                  CRON_PRESETS.find((p) => p.value === sched.cron)
                    ? sched.cron
                    : ''
                }
                onValueChange={(v) => {
                  if (v) updateSchedule(idx, { cron: v });
                }}
              >
                <SelectTrigger className="h-8 w-44 bg-gray-800 border-gray-600 text-xs text-white">
                  <SelectValue placeholder="Select preset..." />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700 text-gray-100">
                  {CRON_PRESETS.map((p) => (
                    <SelectItem key={p.label} value={p.value || '__custom__'}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={sched.cron}
                onChange={(e) => updateSchedule(idx, { cron: e.target.value })}
                placeholder="* * * * *"
                className="flex-1 h-8 bg-gray-800 border-gray-600 font-mono text-xs text-white"
              />
            </div>
          </div>

          {/* Channel */}
          <div className="space-y-1">
            <Label className="text-gray-400 text-[11px]">Target Channel</Label>
            {channels.length > 0 ? (
              <Select
                value={sched.channelId}
                onValueChange={(v) => updateSchedule(idx, { channelId: v })}
              >
                <SelectTrigger className="h-8 bg-gray-800 border-gray-600 text-xs text-white">
                  <SelectValue placeholder="Select a channel..." />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700 text-gray-100">
                  {channels.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      # {ch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={sched.channelId}
                onChange={(e) =>
                  updateSchedule(idx, { channelId: e.target.value })
                }
                placeholder="Paste channel ID"
                className="h-8 bg-gray-800 border-gray-600 text-xs text-white"
              />
            )}
          </div>

          {/* Action */}
          <div className="space-y-1.5">
            <Label className="text-gray-400 text-[11px]">Action</Label>
            <Select
              value={sched.action.type}
              onValueChange={(v) =>
                updateSchedule(idx, {
                  action: {
                    type: v as 'prompt' | 'template_command' | 'static_message',
                  },
                })
              }
            >
              <SelectTrigger className="h-8 bg-gray-800 border-gray-600 text-xs text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700 text-gray-100">
                <SelectItem value={SCHEDULE_ACTION_TYPE.STATIC_MESSAGE}>
                  Static Message
                </SelectItem>
                <SelectItem value={SCHEDULE_ACTION_TYPE.PROMPT}>
                  Prompt
                </SelectItem>
                <SelectItem value={SCHEDULE_ACTION_TYPE.TEMPLATE_COMMAND}>
                  Template Command
                </SelectItem>
              </SelectContent>
            </Select>
            {sched.action.type === SCHEDULE_ACTION_TYPE.STATIC_MESSAGE && (
              <Textarea
                value={sched.action.message || ''}
                onChange={(e) =>
                  updateSchedule(idx, {
                    action: { ...sched.action, message: e.target.value },
                  })
                }
                placeholder="Message to send"
                className="h-16 bg-gray-800 border-gray-600 text-xs text-white resize-none"
              />
            )}
            {sched.action.type === SCHEDULE_ACTION_TYPE.PROMPT && (
              <Textarea
                value={sched.action.prompt || ''}
                onChange={(e) =>
                  updateSchedule(idx, {
                    action: { ...sched.action, prompt: e.target.value },
                  })
                }
                placeholder="Prompt to send to the bot"
                className="h-16 bg-gray-800 border-gray-600 text-xs text-white resize-none"
              />
            )}
            {sched.action.type === SCHEDULE_ACTION_TYPE.TEMPLATE_COMMAND && (
              <Input
                value={sched.action.command || ''}
                onChange={(e) =>
                  updateSchedule(idx, {
                    action: { ...sched.action, command: e.target.value },
                  })
                }
                placeholder="Template command"
                className="h-8 bg-gray-800 border-gray-600 text-xs text-white"
              />
            )}
          </div>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="w-full border-dashed border-gray-600 text-gray-400 hover:text-white text-xs h-8"
        onClick={addSchedule}
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add Schedule
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════
// Event Subscription Editor
// ═══════════════════════════════════════════
function EventSubscriptionEditor({
  subscriptions,
  onChange,
  channels = [],
}: {
  subscriptions: BotEventSubscription[];
  onChange: (subs: BotEventSubscription[]) => void;
  channels?: ChannelResponse[];
}) {
  const addSubscription = () => {
    onChange([
      ...subscriptions,
      {
        eventType: BOT_EVENT_SUB_TYPE.MEMBER_JOIN as
          | 'member_join'
          | 'member_leave',
        channelId: '',
        action: {
          type: EVENT_ACTION_TYPE.STATIC_MESSAGE as 'prompt' | 'static_message',
          message: '',
        },
        enabled: true,
      },
    ]);
  };

  const updateSub = (idx: number, patch: Partial<BotEventSubscription>) => {
    const next = [...subscriptions];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeSub = (idx: number) => {
    onChange(subscriptions.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      {subscriptions.map((sub, idx) => (
        <div
          key={idx}
          className="rounded-md border border-gray-600 bg-gray-900/50 p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <Select
              value={sub.eventType}
              onValueChange={(v) =>
                updateSub(idx, {
                  eventType: v as 'member_join' | 'member_leave',
                })
              }
            >
              <SelectTrigger className="h-8 flex-1 bg-gray-800 border-gray-600 text-xs text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700 text-gray-100">
                <SelectItem value={BOT_EVENT_SUB_TYPE.MEMBER_JOIN}>
                  Member Join
                </SelectItem>
                <SelectItem value={BOT_EVENT_SUB_TYPE.MEMBER_LEAVE}>
                  Member Leave
                </SelectItem>
              </SelectContent>
            </Select>
            <Switch
              checked={sub.enabled}
              onCheckedChange={(v) => updateSub(idx, { enabled: v })}
              className="scale-90"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-500 hover:text-red-400"
              onClick={() => removeSub(idx)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Channel */}
          <div className="space-y-1">
            <Label className="text-gray-400 text-[11px]">Target Channel</Label>
            {channels.length > 0 ? (
              <Select
                value={sub.channelId}
                onValueChange={(v) => updateSub(idx, { channelId: v })}
              >
                <SelectTrigger className="h-8 bg-gray-800 border-gray-600 text-xs text-white">
                  <SelectValue placeholder="Select a channel..." />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700 text-gray-100">
                  {channels.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      # {ch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={sub.channelId}
                onChange={(e) => updateSub(idx, { channelId: e.target.value })}
                placeholder="Paste channel ID"
                className="h-8 bg-gray-800 border-gray-600 text-xs text-white"
              />
            )}
          </div>

          {/* Action */}
          <div className="space-y-1.5">
            <Label className="text-gray-400 text-[11px]">Action</Label>
            <Select
              value={sub.action.type}
              onValueChange={(v) =>
                updateSub(idx, {
                  action: { type: v as 'prompt' | 'static_message' },
                })
              }
            >
              <SelectTrigger className="h-8 bg-gray-800 border-gray-600 text-xs text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700 text-gray-100">
                <SelectItem value={EVENT_ACTION_TYPE.STATIC_MESSAGE}>
                  Static Message
                </SelectItem>
                <SelectItem value={EVENT_ACTION_TYPE.PROMPT}>Prompt</SelectItem>
              </SelectContent>
            </Select>
            {sub.action.type === EVENT_ACTION_TYPE.STATIC_MESSAGE && (
              <div>
                <Textarea
                  value={sub.action.message || ''}
                  onChange={(e) =>
                    updateSub(idx, {
                      action: { ...sub.action, message: e.target.value },
                    })
                  }
                  placeholder="Welcome {user} to the server!"
                  className="h-16 bg-gray-800 border-gray-600 text-xs text-white resize-none"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Variables: {'{user}'}, {'{userId}'}, {'{guild}'}
                </p>
              </div>
            )}
            {sub.action.type === EVENT_ACTION_TYPE.PROMPT && (
              <Textarea
                value={sub.action.prompt || ''}
                onChange={(e) =>
                  updateSub(idx, {
                    action: { ...sub.action, prompt: e.target.value },
                  })
                }
                placeholder="Generate a personalized welcome message for {user}"
                className="h-16 bg-gray-800 border-gray-600 text-xs text-white resize-none"
              />
            )}
          </div>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="w-full border-dashed border-gray-600 text-gray-400 hover:text-white text-xs h-8"
        onClick={addSubscription}
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add Event Trigger
      </Button>
    </div>
  );
}
