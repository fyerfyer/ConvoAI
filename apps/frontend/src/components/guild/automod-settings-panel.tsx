'use client';

import { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  AlertTriangle,
  ScrollText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  GuildResponse,
  AutoModRuleResponse,
  UpdateAutoModConfigDTO,
  EscalationConfigResponse,
  EscalationThresholdResponse,
  AUTOMOD_TRIGGER,
  AUTOMOD_ACTION,
  AUTOMOD_DEFAULTS,
  ESCALATION_ACTION,
} from '@discord-platform/shared';
import {
  useAutoModConfig,
  useUpdateAutoModConfig,
  useAutoModLogs,
} from '@/hooks/use-automod';

// ── Trigger / Action labels ──

const TRIGGER_INFO: Record<string, { label: string; description: string }> = {
  [AUTOMOD_TRIGGER.KEYWORD]: {
    label: 'Keyword Filter',
    description: 'Block messages containing specific words or phrases',
  },
  [AUTOMOD_TRIGGER.SPAM]: {
    label: 'Anti-Spam',
    description: 'Detect rapid duplicate messages',
  },
  [AUTOMOD_TRIGGER.TOXIC_CONTENT]: {
    label: 'Toxic Content (AI)',
    description: 'Detect toxicity, insults, and threats using AI model',
  },
};

const ACTION_INFO: Record<string, { label: string }> = {
  [AUTOMOD_ACTION.BLOCK_MESSAGE]: { label: 'Block Message' },
  [AUTOMOD_ACTION.MUTE_USER]: { label: 'Mute User' },
  [AUTOMOD_ACTION.WARN_USER]: { label: 'Warn User' },
};

const DEFAULT_ESCALATION_THRESHOLD: EscalationThresholdResponse = {
  count: 3,
  action: ESCALATION_ACTION.MUTE,
  muteDurationMs: 30 * 60_000,
};

// ── Rule Editor ──

function KeywordRuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: AutoModRuleResponse;
  onChange: (updated: AutoModRuleResponse) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg bg-gray-700/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={rule.enabled}
            onCheckedChange={(enabled) => onChange({ ...rule, enabled })}
            className="data-[state=checked]:bg-indigo-500 data-[state=unchecked]:bg-gray-600"
          />
          <div>
            <p className="text-sm font-medium text-white">Keyword Filter</p>
            <p className="text-xs text-gray-500">
              Block messages containing specific words or phrases
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-gray-400 hover:text-red-400 hover:bg-red-500/10"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase">
          Keywords (comma-separated)
        </label>
        <Input
          value={(rule.keywords ?? []).join(', ')}
          onChange={(e) =>
            onChange({
              ...rule,
              keywords: e.target.value
                .split(',')
                .map((k) => k.trim())
                .filter(Boolean),
            })
          }
          placeholder="badword, spam, scam"
          className="mt-1 bg-gray-900 border-gray-600 text-white text-sm"
        />
      </div>
    </div>
  );
}

// ── Escalation Editor ──

const ESCALATION_ACTION_INFO: Record<string, string> = {
  [ESCALATION_ACTION.MUTE]: 'Mute',
  [ESCALATION_ACTION.KICK]: 'Kick',
};

const WINDOW_OPTIONS = [
  { label: '1 hour', value: 60 * 60 * 1000 },
  { label: '6 hours', value: 6 * 60 * 60 * 1000 },
  { label: '12 hours', value: 12 * 60 * 60 * 1000 },
  { label: '24 hours', value: 24 * 60 * 60 * 1000 },
  { label: '3 days', value: 3 * 24 * 60 * 60 * 1000 },
  { label: '7 days', value: 7 * 24 * 60 * 60 * 1000 },
];

function EscalationEditor({
  escalation,
  onChange,
}: {
  escalation: EscalationConfigResponse;
  onChange: (updated: EscalationConfigResponse) => void;
}) {
  const addThreshold = () => {
    const maxCount =
      escalation.thresholds.length > 0
        ? Math.max(...escalation.thresholds.map((t) => t.count))
        : 0;
    onChange({
      ...escalation,
      thresholds: [
        ...escalation.thresholds,
        {
          count: maxCount + 3,
          action: ESCALATION_ACTION.MUTE,
          muteDurationMs: 30 * 60_000,
        },
      ],
    });
  };

  const handleToggleEnabled = (enabled: boolean) => {
    if (enabled && escalation.thresholds.length === 0) {
      // Auto-create a default threshold when enabling escalation
      onChange({
        ...escalation,
        enabled,
        thresholds: [{ ...DEFAULT_ESCALATION_THRESHOLD }],
      });
    } else {
      onChange({ ...escalation, enabled });
    }
  };

  const updateThreshold = (
    index: number,
    updated: EscalationThresholdResponse,
  ) => {
    const next = [...escalation.thresholds];
    next[index] = updated;
    onChange({ ...escalation, thresholds: next });
  };

  const removeThreshold = (index: number) => {
    onChange({
      ...escalation,
      thresholds: escalation.thresholds.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="rounded-lg bg-gray-700/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={escalation.enabled}
            onCheckedChange={handleToggleEnabled}
            className="data-[state=checked]:bg-indigo-500 data-[state=unchecked]:bg-gray-600"
          />
          <div>
            <p className="text-sm font-medium text-white">Escalation</p>
            <p className="text-xs text-gray-500">
              Automatically mute or kick users after repeated violations
            </p>
          </div>
        </div>
      </div>

      {escalation.enabled && (
        <>
          {/* Time window */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase">
              Time Window
            </label>
            <select
              value={
                escalation.windowMs ?? AUTOMOD_DEFAULTS.ESCALATION_WINDOW_MS
              }
              onChange={(e) =>
                onChange({ ...escalation, windowMs: parseInt(e.target.value) })
              }
              className="mt-1 w-full rounded-md bg-gray-900 border border-gray-600 text-white text-sm px-3 py-1.5"
            >
              {WINDOW_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">
              Violations within this window are counted for escalation
            </p>
          </div>

          {/* Thresholds */}
          <div className="space-y-2">
            {escalation.thresholds.map((threshold, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md bg-gray-800/60 p-2"
              >
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  After
                </span>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={threshold.count}
                  onChange={(e) =>
                    updateThreshold(i, {
                      ...threshold,
                      count: Math.max(1, parseInt(e.target.value) || 1),
                    })
                  }
                  className="w-16 h-7 text-xs bg-gray-900 border-gray-600 text-white"
                />
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  violations →
                </span>
                <select
                  value={threshold.action}
                  onChange={(e) =>
                    updateThreshold(i, { ...threshold, action: e.target.value })
                  }
                  className="rounded-md bg-gray-900 border border-gray-600 text-white text-xs px-2 py-1"
                >
                  {Object.entries(ESCALATION_ACTION_INFO).map(
                    ([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
                {threshold.action === ESCALATION_ACTION.MUTE && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">for</span>
                    <Input
                      type="number"
                      min={1}
                      max={10080}
                      value={Math.round(
                        (threshold.muteDurationMs ?? 30 * 60_000) / 60_000,
                      )}
                      onChange={(e) =>
                        updateThreshold(i, {
                          ...threshold,
                          muteDurationMs:
                            Math.max(1, parseInt(e.target.value) || 30) *
                            60_000,
                        })
                      }
                      className="w-16 h-7 text-xs bg-gray-900 border-gray-600 text-white"
                    />
                    <span className="text-xs text-gray-400">min</span>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-400 hover:text-red-400 hover:bg-red-500/10 ml-auto"
                  onClick={() => removeThreshold(i)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}

            {escalation.thresholds.length < 5 && (
              <Button
                variant="outline"
                size="sm"
                onClick={addThreshold}
                className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Threshold
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Logs View ──

function AutoModLogsView({
  guildId,
  onBack,
}: {
  guildId: string;
  onBack: () => void;
}) {
  const { data, isLoading } = useAutoModLogs(guildId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8 text-gray-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-semibold text-white">AutoMod Logs</h3>
      </div>

      {isLoading && (
        <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
      )}

      {!isLoading && (!data || data.logs.length === 0) && (
        <p className="text-sm text-gray-500 text-center py-8">
          No automod logs yet.
        </p>
      )}

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {data?.logs.map((log) => (
          <div key={log.id} className="rounded-lg bg-gray-700/30 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                <span className="text-xs font-medium text-yellow-400">
                  {TRIGGER_INFO[log.trigger]?.label ?? log.trigger}
                </span>
              </div>
              <span className="text-[10px] text-gray-500">
                {new Date(log.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-sm text-gray-300 truncate">
              <span className="text-gray-500">User:</span> {log.userName}
            </p>
            <p className="text-sm text-gray-300 truncate">
              <span className="text-gray-500">Message:</span>{' '}
              {log.messageContent}
            </p>
            <p className="text-xs text-gray-500">{log.reason}</p>
            <div className="flex gap-1.5 flex-wrap">
              {log.actions.map((a) => (
                <span
                  key={a}
                  className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-300"
                >
                  {ACTION_INFO[a]?.label ?? a}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── New Rule Creator ──

function newKeywordRule(): AutoModRuleResponse {
  return {
    enabled: true,
    trigger: AUTOMOD_TRIGGER.KEYWORD,
    keywords: [],
    actions: [AUTOMOD_ACTION.BLOCK_MESSAGE],
  };
}

// ── Main Panel ──

type PanelView = { type: 'config' } | { type: 'logs' };

interface AutoModSettingsPanelProps {
  guild: GuildResponse;
}

export default function AutoModSettingsPanel({
  guild,
}: AutoModSettingsPanelProps) {
  const [view, setView] = useState<PanelView>({ type: 'config' });
  const { data: config, isLoading } = useAutoModConfig(guild.id);
  const updateMutation = useUpdateAutoModConfig();

  const [enabled, setEnabled] = useState(false);
  // Only keyword rules are user-editable; non-keyword rules are preserved from server
  const [keywordRules, setKeywordRules] = useState<AutoModRuleResponse[]>([]);
  const [builtInRules, setBuiltInRules] = useState<AutoModRuleResponse[]>([]);
  const [escalation, setEscalation] = useState<EscalationConfigResponse>({
    enabled: false,
    thresholds: [],
  });
  const [dirty, setDirty] = useState(false);

  // Sync from server
  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setKeywordRules(
        config.rules.filter((r) => r.trigger === AUTOMOD_TRIGGER.KEYWORD),
      );
      setBuiltInRules(
        config.rules.filter((r) => r.trigger !== AUTOMOD_TRIGGER.KEYWORD),
      );
      setEscalation(config.escalation ?? { enabled: false, thresholds: [] });
      setDirty(false);
    }
  }, [config]);

  const updateRule = (index: number, updated: AutoModRuleResponse) => {
    const next = [...keywordRules];
    next[index] = updated;
    setKeywordRules(next);
    setDirty(true);
  };

  const removeRule = (index: number) => {
    setKeywordRules(keywordRules.filter((_, i) => i !== index));
    setDirty(true);
  };

  const addKeywordRule = () => {
    setKeywordRules([...keywordRules, newKeywordRule()]);
    setDirty(true);
  };

  const handleSave = () => {
    // Merge user keyword rules with preserved built-in rules
    const allRules = [...builtInRules, ...keywordRules];
    updateMutation.mutate(
      {
        guildId: guild.id,
        data: {
          enabled,
          rules: allRules,
          escalation,
        } as UpdateAutoModConfigDTO,
      },
      { onSuccess: () => setDirty(false) },
    );
  };

  const handleReset = () => {
    if (config) {
      setEnabled(config.enabled);
      setKeywordRules(
        config.rules.filter((r) => r.trigger === AUTOMOD_TRIGGER.KEYWORD),
      );
      setBuiltInRules(
        config.rules.filter((r) => r.trigger !== AUTOMOD_TRIGGER.KEYWORD),
      );
      setEscalation(config.escalation ?? { enabled: false, thresholds: [] });
      setDirty(false);
    }
  };

  if (view.type === 'logs') {
    return (
      <AutoModLogsView
        guildId={guild.id}
        onBack={() => setView({ type: 'config' })}
      />
    );
  }

  if (isLoading) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        Loading automod settings...
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-indigo-400" />
            Adding Rules
          </h3>
          <p className="text-sm text-gray-400">
            Add custom keyword filters to block messages containing specific
            words or phrases. Built-in rules (toxicity, spam) run automatically.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setView({ type: 'logs' })}
          className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
        >
          <ScrollText className="h-4 w-4 mr-1" />
          Logs
        </Button>
      </div>

      {/* Global toggle */}
      <div className="flex items-center justify-between rounded-lg bg-gray-700/30 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-white">Enable AutoMod</p>
          <p className="text-xs text-gray-500">
            Toggle all automod rules on or off
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(v);
            setDirty(true);
          }}
          className="data-[state=checked]:bg-indigo-500 data-[state=unchecked]:bg-gray-600"
        />
      </div>

      {/* Keyword Rules */}
      <div className="space-y-3">
        {keywordRules.map((rule, i) => (
          <KeywordRuleEditor
            key={`keyword-${i}`}
            rule={rule}
            onChange={(updated) => updateRule(i, updated)}
            onRemove={() => removeRule(i)}
          />
        ))}

        {keywordRules.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            No keyword rules added. Add a rule to get started.
          </p>
        )}
      </div>

      {/* Add keyword rule */}
      <Button
        variant="outline"
        size="sm"
        onClick={addKeywordRule}
        className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
      >
        <Plus className="h-4 w-4 mr-1" />
        Add Keyword Rule
      </Button>

      {/* Escalation */}
      <EscalationEditor
        escalation={escalation}
        onChange={(updated) => {
          setEscalation(updated);
          setDirty(true);
        }}
      />

      {/* Save bar */}
      {dirty && (
        <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 -mx-4 px-4 py-3 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={handleReset}
            className="text-gray-300 hover:text-white hover:bg-gray-700"
          >
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="bg-indigo-500 hover:bg-indigo-600"
          >
            <Save className="h-4 w-4 mr-1" />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}
    </div>
  );
}
