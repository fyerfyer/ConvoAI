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
  AUTOMOD_TRIGGER,
  AUTOMOD_ACTION,
  AUTOMOD_DEFAULTS,
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

// ── Rule Editor ──

function RuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: AutoModRuleResponse;
  onChange: (updated: AutoModRuleResponse) => void;
  onRemove: () => void;
}) {
  const isKeyword = rule.trigger === AUTOMOD_TRIGGER.KEYWORD;
  const isToxic = rule.trigger === AUTOMOD_TRIGGER.TOXIC_CONTENT;

  const toggleAction = (action: string) => {
    const actions = rule.actions.includes(action)
      ? rule.actions.filter((a) => a !== action)
      : [...rule.actions, action];
    onChange({ ...rule, actions });
  };

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
            <p className="text-sm font-medium text-white">
              {TRIGGER_INFO[rule.trigger]?.label ?? rule.trigger}
            </p>
            <p className="text-xs text-gray-500">
              {TRIGGER_INFO[rule.trigger]?.description}
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

      {/* Keyword-specific: keyword list */}
      {isKeyword && (
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
      )}

      {/* Toxic-specific: threshold slider */}
      {isToxic && (
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase">
            Toxicity Threshold:{' '}
            {(
              rule.toxicityThreshold ?? AUTOMOD_DEFAULTS.TOXICITY_THRESHOLD
            ).toFixed(2)}
          </label>
          <input
            type="range"
            min={0.3}
            max={0.95}
            step={0.05}
            value={
              rule.toxicityThreshold ?? AUTOMOD_DEFAULTS.TOXICITY_THRESHOLD
            }
            onChange={(e) =>
              onChange({
                ...rule,
                toxicityThreshold: parseFloat(e.target.value),
              })
            }
            className="mt-1 w-full accent-indigo-500"
          />
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>Sensitive (0.3)</span>
            <span>Strict (0.95)</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase mb-1 block">
          Actions
        </label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ACTION_INFO).map(([key, info]) => {
            const active = rule.actions.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleAction(key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500'
                }`}
              >
                {info.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mute duration (if mute action is selected) */}
      {rule.actions.includes(AUTOMOD_ACTION.MUTE_USER) && (
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase">
            Mute Duration (minutes)
          </label>
          <Input
            type="number"
            min={1}
            max={1440}
            value={Math.round(
              (rule.muteDurationMs ?? AUTOMOD_DEFAULTS.MUTE_DURATION_MS) /
                60_000,
            )}
            onChange={(e) =>
              onChange({
                ...rule,
                muteDurationMs:
                  Math.max(1, parseInt(e.target.value) || 5) * 60_000,
              })
            }
            className="mt-1 w-24 bg-gray-900 border-gray-600 text-white text-sm"
          />
        </div>
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

function newDefaultRule(trigger: string): AutoModRuleResponse {
  const base: AutoModRuleResponse = {
    enabled: true,
    trigger,
    actions: [AUTOMOD_ACTION.BLOCK_MESSAGE],
  };

  if (trigger === AUTOMOD_TRIGGER.KEYWORD) {
    base.keywords = [];
  }
  if (trigger === AUTOMOD_TRIGGER.TOXIC_CONTENT) {
    base.toxicityThreshold = AUTOMOD_DEFAULTS.TOXICITY_THRESHOLD;
  }
  return base;
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
  const [rules, setRules] = useState<AutoModRuleResponse[]>([]);
  const [dirty, setDirty] = useState(false);

  // Sync from server
  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setRules(config.rules);
      setDirty(false);
    }
  }, [config]);

  const updateRule = (index: number, updated: AutoModRuleResponse) => {
    const next = [...rules];
    next[index] = updated;
    setRules(next);
    setDirty(true);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
    setDirty(true);
  };

  const addRule = (trigger: string) => {
    setRules([...rules, newDefaultRule(trigger)]);
    setDirty(true);
  };

  const handleSave = () => {
    updateMutation.mutate(
      {
        guildId: guild.id,
        data: { enabled, rules } as UpdateAutoModConfigDTO,
      },
      { onSuccess: () => setDirty(false) },
    );
  };

  const handleReset = () => {
    if (config) {
      setEnabled(config.enabled);
      setRules(config.rules);
      setDirty(false);
    }
  };

  // Determine which triggers are not yet added
  const usedTriggers = new Set(rules.map((r) => r.trigger));
  const availableTriggers = Object.values(AUTOMOD_TRIGGER).filter(
    (t) => !usedTriggers.has(t),
  );

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
            AutoMod
          </h3>
          <p className="text-sm text-gray-400">
            Automatically moderate messages with keyword filters, anti-spam, and
            AI toxicity detection.
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

      {/* Rules */}
      <div className="space-y-3">
        {rules.map((rule, i) => (
          <RuleEditor
            key={`${rule.trigger}-${i}`}
            rule={rule}
            onChange={(updated) => updateRule(i, updated)}
            onRemove={() => removeRule(i)}
          />
        ))}

        {rules.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            No rules configured. Add a rule to get started.
          </p>
        )}
      </div>

      {/* Add rule */}
      {availableTriggers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {availableTriggers.map((trigger) => (
            <Button
              key={trigger}
              variant="outline"
              size="sm"
              onClick={() => addRule(trigger)}
              className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              <Plus className="h-4 w-4 mr-1" />
              {TRIGGER_INFO[trigger]?.label ?? trigger}
            </Button>
          ))}
        </div>
      )}

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
