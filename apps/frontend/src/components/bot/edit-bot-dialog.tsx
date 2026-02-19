'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Globe,
  LayoutTemplate,
  Cpu,
  Eye,
  EyeOff,
  Check,
  Plus,
  X,
  Bot,
} from 'lucide-react';
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
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useUpdateBot, useTemplates } from '@/hooks/use-bot';
import {
  BotResponse,
  BOT_STATUS,
  EXECUTION_MODE,
  LLM_PROVIDER,
  LLM_TOOL,
  TemplateInfo,
} from '@discord-platform/shared';
import { cn } from '@/lib/utils';

interface EditBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bot: BotResponse | null;
  guildId: string;
}

const PROVIDER_LABELS: Record<string, { name: string; placeholder: string }> = {
  [LLM_PROVIDER.OPENAI]: { name: 'OpenAI', placeholder: 'gpt-4o-mini' },
  [LLM_PROVIDER.DEEPSEEK]: { name: 'DeepSeek', placeholder: 'deepseek-chat' },
  [LLM_PROVIDER.GOOGLE]: {
    name: 'Google Gemini',
    placeholder: 'gemini-2.0-flash',
  },
  [LLM_PROVIDER.CUSTOM]: { name: 'Custom', placeholder: 'model-name' },
};

const TOOL_LABELS: Record<string, { name: string; description: string }> = {
  [LLM_TOOL.WEB_SEARCH]: {
    name: 'Web Search',
    description: 'Search the web for current info',
  },
  [LLM_TOOL.CODE_EXECUTION]: {
    name: 'Code Execution',
    description: 'Evaluate code and math',
  },
  [LLM_TOOL.SUMMARIZE_USER]: {
    name: 'Summarize User',
    description: 'Summarize what a user said in the channel',
  },
  [LLM_TOOL.CHANNEL_HISTORY]: {
    name: 'Channel History',
    description: 'Read recent channel messages for context',
  },
  [LLM_TOOL.GUILD_INFO]: {
    name: 'Guild Info',
    description: 'Get server info (channels, members, etc.)',
  },
  [LLM_TOOL.MEMBER_LIST]: {
    name: 'Member List',
    description: 'List all members in the server',
  },
};

const MODE_META: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  [EXECUTION_MODE.WEBHOOK]: {
    icon: <Globe className="h-4 w-4" />,
    label: 'Webhook',
    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  [EXECUTION_MODE.BUILTIN]: {
    icon: <LayoutTemplate className="h-4 w-4" />,
    label: 'Template',
    color: 'bg-green-500/20 text-green-300 border-green-500/30',
  },
  [EXECUTION_MODE.MANAGED_LLM]: {
    icon: <Cpu className="h-4 w-4" />,
    label: 'AI Agent',
    color: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
};

export default function EditBotDialog({
  open,
  onOpenChange,
  bot,
  guildId,
}: EditBotDialogProps) {
  // Common fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>(BOT_STATUS.ACTIVE);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);

  // Webhook
  const [webhookUrl, setWebhookUrl] = useState('');

  // Template
  const [templateConfig, setTemplateConfig] = useState<Record<string, unknown>>(
    {},
  );

  // LLM
  const [llmProvider, setLlmProvider] = useState<string>(LLM_PROVIDER.OPENAI);
  const [llmModel, setLlmModel] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmSystemPrompt, setLlmSystemPrompt] = useState('');
  const [llmTemperature, setLlmTemperature] = useState(0.7);
  const [llmMaxTokens, setLlmMaxTokens] = useState(1024);
  const [llmTools, setLlmTools] = useState<string[]>([]);
  const [llmCustomBaseUrl, setLlmCustomBaseUrl] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  const updateBot = useUpdateBot();
  const { data: templates = [] } = useTemplates();

  const mode = bot?.executionMode ?? EXECUTION_MODE.WEBHOOK;
  const modeMeta = MODE_META[mode] ?? MODE_META[EXECUTION_MODE.WEBHOOK];

  const selectedTemplateInfo = useMemo(
    () => templates.find((t: TemplateInfo) => t.id === bot?.templateId),
    [templates, bot?.templateId],
  );

  // Populate fields when bot changes
  useEffect(() => {
    if (!bot) return;
    setName(bot.name);
    setDescription(bot.description || '');
    setStatus(bot.status);
    setAvatarPreview(bot.avatar || null);
    setAvatarBase64(null);

    // Webhook
    setWebhookUrl(bot.webhookUrl || '');

    // Template
    setTemplateConfig(bot.templateConfig ?? {});

    // LLM
    if (bot.llmConfig) {
      setLlmProvider(bot.llmConfig.provider);
      setLlmModel(bot.llmConfig.model);
      setLlmSystemPrompt(bot.llmConfig.systemPrompt || '');
      setLlmTemperature(bot.llmConfig.temperature ?? 0.7);
      setLlmMaxTokens(bot.llmConfig.maxTokens ?? 1024);
      setLlmTools(bot.llmConfig.tools ?? []);
      setLlmCustomBaseUrl(bot.llmConfig.customBaseUrl || '');
    }
    setLlmApiKey(''); // never pre-filled
    setShowApiKey(false);
  }, [bot]);

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (mode === EXECUTION_MODE.WEBHOOK && !webhookUrl.trim()) return false;
    return true;
  }, [name, mode, webhookUrl]);

  const handleSubmit = async () => {
    if (!bot || !canSubmit) return;

    try {
      const base: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        status: status as 'active' | 'inactive',
        ...(avatarBase64 !== null ? { avatar: avatarBase64 } : {}),
      };

      if (mode === EXECUTION_MODE.WEBHOOK) {
        base.webhookUrl = webhookUrl.trim();
      }

      if (mode === EXECUTION_MODE.BUILTIN) {
        base.templateConfig = templateConfig;
      }

      if (mode === EXECUTION_MODE.MANAGED_LLM) {
        const llm: Record<string, unknown> = {
          provider: llmProvider,
          model: llmModel.trim(),
          systemPrompt: llmSystemPrompt,
          temperature: llmTemperature,
          maxTokens: llmMaxTokens,
          tools: llmTools,
        };
        if (llmApiKey.trim()) llm.apiKey = llmApiKey.trim();
        if (llmProvider === LLM_PROVIDER.CUSTOM && llmCustomBaseUrl)
          llm.customBaseUrl = llmCustomBaseUrl;
        base.llmConfig = llm;
      }

      await updateBot.mutateAsync({
        botId: bot.id,
        guildId,
        data: base,
      });
      onOpenChange(false);
    } catch {
      // Error handled by mutation
    }
  };

  const toggleTool = (tool: string) => {
    setLlmTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.match(/^image\/(png|jpe?g|gif|webp)$/)) return;
    if (file.size > 2 * 1024 * 1024) return; // 2MB limit
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAvatarPreview(result);
      setAvatarBase64(result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Bot
            <Badge
              variant="secondary"
              className={cn(
                'text-[10px] px-1.5 py-0 flex items-center gap-1',
                modeMeta.color,
              )}
            >
              {modeMeta.icon} {modeMeta.label}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Update your bot&apos;s configuration. Execution mode cannot be
            changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Avatar ── */}
          <div>
            <Label className="text-gray-300 text-xs">Avatar</Label>
            <div className="flex items-center gap-3 mt-1">
              <div className="h-14 w-14 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center overflow-hidden">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Bot avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Bot className="h-7 w-7 text-gray-400" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="cursor-pointer rounded-md border border-gray-600 bg-gray-700/50 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 transition-colors text-center">
                  Upload Image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={handleAvatarSelect}
                  />
                </label>
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarPreview(null);
                      setAvatarBase64('');
                    }}
                    className="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Name ── */}
          <div>
            <Label htmlFor="edit-name" className="text-gray-300 text-xs">
              Bot Name
            </Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 bg-gray-900 border-gray-600 text-white"
              maxLength={50}
            />
          </div>

          {/* ── Webhook URL (webhook mode) ── */}
          {mode === EXECUTION_MODE.WEBHOOK && (
            <div>
              <Label htmlFor="edit-url" className="text-gray-300 text-xs">
                Webhook URL
              </Label>
              <Input
                id="edit-url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="mt-1 bg-gray-900 border-gray-600 text-white"
                type="url"
              />
            </div>
          )}

          {/* ── Template Config (builtin mode) ── */}
          {mode === EXECUTION_MODE.BUILTIN && selectedTemplateInfo && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{selectedTemplateInfo.icon}</span>
                <span className="text-sm text-gray-300">
                  {selectedTemplateInfo.name.replace(/^[^\w]+ /, '')}
                </span>
              </div>
              {Object.entries(selectedTemplateInfo.configSchema).map(
                ([key, field]) => (
                  <div key={key}>
                    <Label className="text-gray-400 text-[11px]">
                      {field.label}
                    </Label>
                    {field.description && field.type !== 'boolean' && (
                      <p className="text-[10px] text-gray-500 mt-0.5 mb-1">
                        {field.description}
                      </p>
                    )}
                    {field.type === 'string' && (
                      <Input
                        value={String(
                          templateConfig[key] ?? field.default ?? '',
                        )}
                        onChange={(e) =>
                          setTemplateConfig((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        className="mt-1 bg-gray-900 border-gray-600 text-white text-sm"
                        placeholder={field.description}
                      />
                    )}
                    {field.type === 'number' && (
                      <Input
                        type="number"
                        value={String(
                          templateConfig[key] ?? field.default ?? '',
                        )}
                        onChange={(e) =>
                          setTemplateConfig((prev) => ({
                            ...prev,
                            [key]: Number(e.target.value),
                          }))
                        }
                        className="mt-1 bg-gray-900 border-gray-600 text-white text-sm"
                        min={field.min}
                        max={field.max}
                      />
                    )}
                    {field.type === 'boolean' && (
                      <div className="flex items-center gap-2 mt-1">
                        <Switch
                          checked={Boolean(
                            templateConfig[key] ?? field.default,
                          )}
                          onCheckedChange={(checked) =>
                            setTemplateConfig((prev) => ({
                              ...prev,
                              [key]: checked,
                            }))
                          }
                        />
                        <span className="text-xs text-gray-400">
                          {field.description}
                        </span>
                      </div>
                    )}
                    {/* Array type: checkboxes for known options (e.g., enabledGames) */}
                    {field.type === 'array' && key === 'enabledGames' && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {['8ball', 'roll', 'guess', 'rps'].map((game) => {
                          const current =
                            (templateConfig[key] as string[]) ??
                            (field.default as string[]) ??
                            [];
                          const isSelected = current.includes(game);
                          return (
                            <button
                              key={game}
                              type="button"
                              onClick={() => {
                                const updated = isSelected
                                  ? current.filter((g) => g !== game)
                                  : [...current, game];
                                setTemplateConfig((prev) => ({
                                  ...prev,
                                  [key]: updated,
                                }));
                              }}
                              className={cn(
                                'rounded-md border px-2.5 py-1 text-xs font-medium transition-all',
                                isSelected
                                  ? 'border-green-500 bg-green-500/10 text-green-300'
                                  : 'border-gray-600 bg-gray-700/50 text-gray-400 hover:border-gray-500',
                              )}
                            >
                              <span className="flex items-center gap-1">
                                {isSelected && <Check className="h-3 w-3" />}
                                {game}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {/* Array type: auto-responder rules */}
                    {field.type === 'array' && key === 'rules' && (
                      <div className="space-y-2 mt-1">
                        {(
                          (templateConfig[key] as Array<
                            Record<string, unknown>
                          >) ?? []
                        ).map((rule, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-gray-600 bg-gray-900 p-2.5 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-gray-500">
                                Rule #{idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const rules = [
                                    ...((templateConfig[key] as Array<
                                      Record<string, unknown>
                                    >) ?? []),
                                  ];
                                  rules.splice(idx, 1);
                                  setTemplateConfig((prev) => ({
                                    ...prev,
                                    [key]: rules,
                                  }));
                                }}
                                className="text-gray-500 hover:text-red-400 transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <Input
                              value={String(rule.trigger ?? '')}
                              onChange={(e) => {
                                const rules = [
                                  ...((templateConfig[key] as Array<
                                    Record<string, unknown>
                                  >) ?? []),
                                ];
                                rules[idx] = {
                                  ...rules[idx],
                                  trigger: e.target.value,
                                };
                                setTemplateConfig((prev) => ({
                                  ...prev,
                                  [key]: rules,
                                }));
                              }}
                              placeholder="Trigger keyword or regex"
                              className="bg-gray-800 border-gray-600 text-white text-xs h-8"
                            />
                            <Input
                              value={String(rule.response ?? '')}
                              onChange={(e) => {
                                const rules = [
                                  ...((templateConfig[key] as Array<
                                    Record<string, unknown>
                                  >) ?? []),
                                ];
                                rules[idx] = {
                                  ...rules[idx],
                                  response: e.target.value,
                                };
                                setTemplateConfig((prev) => ({
                                  ...prev,
                                  [key]: rules,
                                }));
                              }}
                              placeholder="Response message"
                              className="bg-gray-800 border-gray-600 text-white text-xs h-8"
                            />
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                <Switch
                                  checked={Boolean(rule.isRegex)}
                                  onCheckedChange={(checked) => {
                                    const rules = [
                                      ...((templateConfig[key] as Array<
                                        Record<string, unknown>
                                      >) ?? []),
                                    ];
                                    rules[idx] = {
                                      ...rules[idx],
                                      isRegex: checked,
                                    };
                                    setTemplateConfig((prev) => ({
                                      ...prev,
                                      [key]: rules,
                                    }));
                                  }}
                                />
                                Regex
                              </label>
                              <label className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                <Switch
                                  checked={Boolean(rule.caseSensitive)}
                                  onCheckedChange={(checked) => {
                                    const rules = [
                                      ...((templateConfig[key] as Array<
                                        Record<string, unknown>
                                      >) ?? []),
                                    ];
                                    rules[idx] = {
                                      ...rules[idx],
                                      caseSensitive: checked,
                                    };
                                    setTemplateConfig((prev) => ({
                                      ...prev,
                                      [key]: rules,
                                    }));
                                  }}
                                />
                                Case Sensitive
                              </label>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const rules = [
                              ...((templateConfig[key] as Array<
                                Record<string, unknown>
                              >) ?? []),
                            ];
                            rules.push({
                              trigger: '',
                              response: '',
                              isRegex: false,
                              caseSensitive: false,
                            });
                            setTemplateConfig((prev) => ({
                              ...prev,
                              [key]: rules,
                            }));
                          }}
                          className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Rule
                        </button>
                      </div>
                    )}
                    {/* Object type: sub-fields (e.g., guessRange with min/max) */}
                    {field.type === 'object' && key === 'guessRange' && (
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div>
                          <Label className="text-gray-500 text-[10px]">
                            Min
                          </Label>
                          <Input
                            type="number"
                            value={String(
                              (templateConfig[key] as Record<string, unknown>)
                                ?.min ??
                                (field.default as Record<string, unknown>)
                                  ?.min ??
                                1,
                            )}
                            onChange={(e) =>
                              setTemplateConfig((prev) => ({
                                ...prev,
                                [key]: {
                                  ...((prev[key] as Record<string, unknown>) ??
                                    field.default ??
                                    {}),
                                  min: Number(e.target.value),
                                },
                              }))
                            }
                            className="mt-0.5 bg-gray-900 border-gray-600 text-white text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-gray-500 text-[10px]">
                            Max
                          </Label>
                          <Input
                            type="number"
                            value={String(
                              (templateConfig[key] as Record<string, unknown>)
                                ?.max ??
                                (field.default as Record<string, unknown>)
                                  ?.max ??
                                100,
                            )}
                            onChange={(e) =>
                              setTemplateConfig((prev) => ({
                                ...prev,
                                [key]: {
                                  ...((prev[key] as Record<string, unknown>) ??
                                    field.default ??
                                    {}),
                                  max: Number(e.target.value),
                                },
                              }))
                            }
                            className="mt-0.5 bg-gray-900 border-gray-600 text-white text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>
          )}

          {/* ── LLM Config (managed-llm mode) ── */}
          {mode === EXECUTION_MODE.MANAGED_LLM && (
            <>
              {/* Provider */}
              <div>
                <Label className="text-gray-300 text-xs mb-2 block">
                  LLM Provider
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PROVIDER_LABELS).map(([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setLlmProvider(key);
                        if (key !== llmProvider) setLlmModel('');
                      }}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                        llmProvider === key
                          ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                          : 'border-gray-600 bg-gray-700/50 text-gray-400 hover:border-gray-500',
                      )}
                    >
                      {info.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model */}
              <div>
                <Label htmlFor="edit-model" className="text-gray-300 text-xs">
                  Model
                </Label>
                <Input
                  id="edit-model"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder={
                    PROVIDER_LABELS[llmProvider]?.placeholder || 'model-name'
                  }
                  className="mt-1 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
                />
              </div>

              {/* API Key */}
              <div>
                <Label htmlFor="edit-key" className="text-gray-300 text-xs">
                  API Key
                  <span className="text-gray-500 ml-1">
                    (leave blank to keep current)
                  </span>
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="edit-key"
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    placeholder="sk-... (unchanged if empty)"
                    className="bg-gray-900 border-gray-600 text-white placeholder:text-gray-500 pr-10"
                    type={showApiKey ? 'text' : 'password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Custom Base URL */}
              {llmProvider === LLM_PROVIDER.CUSTOM && (
                <div>
                  <Label
                    htmlFor="edit-base-url"
                    className="text-gray-300 text-xs"
                  >
                    Custom Base URL
                  </Label>
                  <Input
                    id="edit-base-url"
                    value={llmCustomBaseUrl}
                    onChange={(e) => setLlmCustomBaseUrl(e.target.value)}
                    placeholder="https://your-api.example.com/v1"
                    className="mt-1 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
                    type="url"
                  />
                </div>
              )}

              {/* System Prompt */}
              <div>
                <Label htmlFor="edit-prompt" className="text-gray-300 text-xs">
                  System Prompt
                </Label>
                <Textarea
                  id="edit-prompt"
                  value={llmSystemPrompt}
                  onChange={(e) => setLlmSystemPrompt(e.target.value)}
                  className="mt-1 bg-gray-900 border-gray-600 text-white resize-none text-sm"
                  rows={3}
                  maxLength={4000}
                />
              </div>

              {/* Temperature + Max Tokens */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-300 text-xs">
                    Temperature:{' '}
                    <span className="text-purple-300">
                      {llmTemperature.toFixed(1)}
                    </span>
                  </Label>
                  <Slider
                    value={[llmTemperature]}
                    onValueChange={([v]) => setLlmTemperature(v)}
                    min={0}
                    max={2}
                    step={0.1}
                    className="mt-2"
                    trackClassName="bg-gray-600"
                    rangeClassName="bg-purple-500"
                    thumbClassName="border-purple-400 bg-gray-200"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-xs">Max Tokens</Label>
                  <Input
                    type="number"
                    value={llmMaxTokens}
                    onChange={(e) =>
                      setLlmMaxTokens(
                        Math.min(16384, Math.max(1, Number(e.target.value))),
                      )
                    }
                    className="mt-1 bg-gray-900 border-gray-600 text-white text-sm"
                    min={1}
                    max={16384}
                  />
                </div>
              </div>

              {/* Tools */}
              <div>
                <Label className="text-gray-300 text-xs mb-2 block">
                  Tools
                </Label>
                <div className="space-y-2">
                  {Object.entries(TOOL_LABELS).map(([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleTool(key)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all',
                        llmTools.includes(key)
                          ? 'border-purple-500/50 bg-purple-500/10'
                          : 'border-gray-600 bg-gray-700/30 hover:border-gray-500',
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                          llmTools.includes(key)
                            ? 'border-purple-500 bg-purple-500'
                            : 'border-gray-500',
                        )}
                      >
                        {llmTools.includes(key) && (
                          <Check className="h-3 w-3 text-white" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-white">
                          {info.name}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {info.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Description (all modes) ── */}
          <div>
            <Label htmlFor="edit-desc" className="text-gray-300 text-xs">
              Description
            </Label>
            <Textarea
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 bg-gray-900 border-gray-600 text-white resize-none"
              rows={2}
              maxLength={500}
            />
          </div>

          {/* ── Status (all modes) ── */}
          <div>
            <Label className="text-gray-300 text-xs mb-2 block">Status</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStatus(BOT_STATUS.ACTIVE)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  status === BOT_STATUS.ACTIVE
                    ? 'border-green-500 bg-green-500/10 text-green-300'
                    : 'border-gray-600 bg-gray-700/50 text-gray-400 hover:border-gray-500'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatus(BOT_STATUS.INACTIVE)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  status === BOT_STATUS.INACTIVE
                    ? 'border-gray-400 bg-gray-500/10 text-gray-300'
                    : 'border-gray-600 bg-gray-700/50 text-gray-400 hover:border-gray-500'
                }`}
              >
                Inactive
              </button>
            </div>
          </div>
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
            disabled={!canSubmit || updateBot.isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {updateBot.isPending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
            ) : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
