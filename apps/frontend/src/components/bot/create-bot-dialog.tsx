'use client';

import { useState, useMemo } from 'react';
import {
  Bot,
  Cpu,
  Globe,
  LayoutTemplate,
  ArrowLeft,
  Eye,
  EyeOff,
  Check,
  Plus,
  X,
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
import { useCreateBot, useTemplates } from '@/hooks/use-bot';
import {
  EXECUTION_MODE,
  LLM_PROVIDER,
  LLM_TOOL,
  TemplateInfo,
} from '@discord-platform/shared';
import { cn } from '@/lib/utils';

type Step = 'mode' | 'config' | 'success';

interface CreateBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guildId: string;
}

const PROVIDER_LABELS: Record<string, { name: string; placeholder: string }> = {
  [LLM_PROVIDER.OPENAI]: {
    name: 'OpenAI',
    placeholder: 'gpt-4o-mini',
  },
  [LLM_PROVIDER.DEEPSEEK]: {
    name: 'DeepSeek',
    placeholder: 'deepseek-chat',
  },
  [LLM_PROVIDER.GOOGLE]: {
    name: 'Google Gemini',
    placeholder: 'gemini-2.0-flash',
  },
  [LLM_PROVIDER.CUSTOM]: {
    name: 'Custom (OpenAI-compatible)',
    placeholder: 'model-name',
  },
};

const TOOL_LABELS: Record<string, { name: string; description: string }> = {
  [LLM_TOOL.WEB_SEARCH]: {
    name: 'Web Search',
    description: 'Search the web for current information',
  },
  [LLM_TOOL.CODE_EXECUTION]: {
    name: 'Code Execution',
    description: 'Evaluate code and math expressions',
  },
  [LLM_TOOL.IMAGE_GENERATION]: {
    name: 'Image Generation',
    description: 'Generate images from text descriptions',
  },
};

export default function CreateBotDialog({
  open,
  onOpenChange,
  guildId,
}: CreateBotDialogProps) {
  const [step, setStep] = useState<Step>('mode');
  const [executionMode, setExecutionMode] = useState<string>(
    EXECUTION_MODE.WEBHOOK,
  );

  // Common fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);

  // Webhook mode
  const [webhookUrl, setWebhookUrl] = useState('');

  // Builtin mode
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templateConfig, setTemplateConfig] = useState<Record<string, unknown>>(
    {},
  );

  // LLM mode
  const [llmProvider, setLlmProvider] = useState<string>(LLM_PROVIDER.OPENAI);
  const [llmModel, setLlmModel] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmSystemPrompt, setLlmSystemPrompt] = useState(
    'You are a helpful assistant.',
  );
  const [llmTemperature, setLlmTemperature] = useState(0.7);
  const [llmMaxTokens, setLlmMaxTokens] = useState(1024);
  const [llmTools, setLlmTools] = useState<string[]>([]);
  const [llmCustomBaseUrl, setLlmCustomBaseUrl] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Success state
  const [secretResult, setSecretResult] = useState<{
    webhookSecret?: string;
    webhookToken?: string;
    mode: string;
  } | null>(null);

  const { data: templates = [] } = useTemplates();
  const createBot = useCreateBot();

  const selectedTemplateInfo = useMemo(
    () => templates.find((t: TemplateInfo) => t.id === selectedTemplate),
    [templates, selectedTemplate],
  );

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    switch (executionMode) {
      case EXECUTION_MODE.WEBHOOK:
        return !!webhookUrl.trim();
      case EXECUTION_MODE.BUILTIN:
        return !!selectedTemplate;
      case EXECUTION_MODE.MANAGED_LLM:
        return !!llmApiKey.trim() && !!llmModel.trim();
      default:
        return false;
    }
  }, [name, executionMode, webhookUrl, selectedTemplate, llmApiKey, llmModel]);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      const baseData = {
        name: name.trim(),
        guildId,
        description: description.trim() || '',
        executionMode: executionMode as 'webhook' | 'builtin' | 'managed-llm',
        ...(avatarBase64 ? { avatar: avatarBase64 } : {}),
      };

      let payload;
      switch (executionMode) {
        case EXECUTION_MODE.WEBHOOK:
          payload = {
            ...baseData,
            type: 'chatbot' as const,
            webhookUrl: webhookUrl.trim(),
          };
          break;
        case EXECUTION_MODE.BUILTIN:
          payload = {
            ...baseData,
            type: 'chatbot' as const,
            templateId: selectedTemplate as
              | 'welcome'
              | 'poll'
              | 'game'
              | 'reminder'
              | 'auto-responder',
            templateConfig,
          };
          break;
        case EXECUTION_MODE.MANAGED_LLM:
          payload = {
            ...baseData,
            type: 'agent' as const,
            llmConfig: {
              provider: llmProvider as
                | 'openai'
                | 'deepseek'
                | 'google'
                | 'custom',
              apiKey: llmApiKey.trim(),
              model: llmModel.trim(),
              systemPrompt: llmSystemPrompt,
              temperature: llmTemperature,
              maxTokens: llmMaxTokens,
              tools: llmTools as Array<
                'web-search' | 'code-execution' | 'image-generation'
              >,
              ...(llmProvider === LLM_PROVIDER.CUSTOM && llmCustomBaseUrl
                ? { customBaseUrl: llmCustomBaseUrl }
                : {}),
            },
          };
          break;
        default:
          return;
      }

      const result = await createBot.mutateAsync(payload);
      setSecretResult({
        webhookSecret: result?.webhookSecret,
        webhookToken: result?.webhookToken,
        mode: executionMode,
      });
      setStep('success');
    } catch {
      // Error handled by mutation
    }
  };

  const resetForm = () => {
    setStep('mode');
    setExecutionMode(EXECUTION_MODE.WEBHOOK);
    setName('');
    setDescription('');
    setAvatarPreview(null);
    setAvatarBase64(null);
    setWebhookUrl('');
    setSelectedTemplate('');
    setTemplateConfig({});
    setLlmProvider(LLM_PROVIDER.OPENAI);
    setLlmModel('');
    setLlmApiKey('');
    setLlmSystemPrompt('You are a helpful assistant.');
    setLlmTemperature(0.7);
    setLlmMaxTokens(1024);
    setLlmTools([]);
    setLlmCustomBaseUrl('');
    setShowApiKey(false);
    setSecretResult(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
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
      const base64 = reader.result as string;
      setAvatarPreview(base64);
      setAvatarBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  // ── Step: Success ──
  if (step === 'success' && secretResult) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-green-400">
              Bot Created Successfully!
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {secretResult.mode === EXECUTION_MODE.WEBHOOK
                ? 'Save these credentials now. The webhook secret will not be shown again.'
                : 'Your bot is ready to use. @mention it in any channel to get started.'}
            </DialogDescription>
          </DialogHeader>

          {secretResult.webhookToken && secretResult.webhookSecret && (
            <div className="space-y-4">
              <div>
                <Label className="text-gray-300 text-xs">Webhook Token</Label>
                <div className="mt-1 rounded bg-gray-900 p-2 font-mono text-xs text-gray-300 break-all select-all">
                  {secretResult.webhookToken}
                </div>
              </div>
              <div>
                <Label className="text-gray-300 text-xs">
                  Webhook Secret (HMAC Signing)
                </Label>
                <div className="mt-1 rounded bg-gray-900 p-2 font-mono text-xs text-amber-300 break-all select-all">
                  {secretResult.webhookSecret}
                </div>
                <p className="mt-1 text-[11px] text-red-400">
                  Save this secret now — it will NOT be shown again.
                </p>
              </div>
            </div>
          )}

          {secretResult.mode !== EXECUTION_MODE.WEBHOOK && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 text-sm text-green-300">
              <p>
                Your{' '}
                {secretResult.mode === EXECUTION_MODE.BUILTIN
                  ? 'template bot'
                  : 'AI agent'}{' '}
                <strong>{name}</strong> is now active.
              </p>
              <p className="mt-1 text-gray-400 text-xs">
                Type <code className="text-green-300">@{name}</code> in any
                channel to interact with it.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={handleClose}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {secretResult.mode === EXECUTION_MODE.WEBHOOK
                ? "I've Saved These Credentials"
                : 'Done'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Step: Mode Selection ──
  if (step === 'mode') {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a New Bot</DialogTitle>
            <DialogDescription className="text-gray-400">
              Choose how your bot will work. You can always change the
              configuration later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Webhook */}
            <button
              type="button"
              onClick={() => {
                setExecutionMode(EXECUTION_MODE.WEBHOOK);
                setStep('config');
              }}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-all hover:border-gray-400',
                'border-gray-600 bg-gray-700/50',
              )}
            >
              <Globe className="h-8 w-8 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-white">
                  Webhook Bot
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Connect your own bot server via webhook URL. Full control over
                  bot logic. Best for developers.
                </div>
              </div>
            </button>

            {/* Builtin Template */}
            <button
              type="button"
              onClick={() => {
                setExecutionMode(EXECUTION_MODE.BUILTIN);
                setStep('config');
              }}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-all hover:border-gray-400',
                'border-gray-600 bg-gray-700/50',
              )}
            >
              <LayoutTemplate className="h-8 w-8 text-green-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-white">
                  Built-in Template
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Use pre-built templates: Welcome, Poll, Game, Reminder, Auto
                  Responder. No coding needed.
                </div>
              </div>
            </button>

            {/* Managed LLM */}
            <button
              type="button"
              onClick={() => {
                setExecutionMode(EXECUTION_MODE.MANAGED_LLM);
                setStep('config');
              }}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-all hover:border-gray-400',
                'border-gray-600 bg-gray-700/50',
              )}
            >
              <Cpu className="h-8 w-8 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-white">AI Agent</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  LLM-powered intelligent agent. Provide your API key and
                  customize behavior with system prompts and tools.
                </div>
              </div>
            </button>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={handleClose}
              className="text-gray-400"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Step: Config ──
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <button
              onClick={() => setStep('mode')}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            {executionMode === EXECUTION_MODE.WEBHOOK && 'Create Webhook Bot'}
            {executionMode === EXECUTION_MODE.BUILTIN && 'Create Template Bot'}
            {executionMode === EXECUTION_MODE.MANAGED_LLM && 'Create AI Agent'}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {executionMode === EXECUTION_MODE.WEBHOOK &&
              'Connect your own bot server via webhook.'}
            {executionMode === EXECUTION_MODE.BUILTIN &&
              'Choose a template and customize its behavior.'}
            {executionMode === EXECUTION_MODE.MANAGED_LLM &&
              'Configure your AI agent with an LLM provider.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Template Selection (Builtin mode) ── */}
          {executionMode === EXECUTION_MODE.BUILTIN && (
            <div>
              <Label className="text-gray-300 text-xs mb-2 block">
                Select Template
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {templates.map((tpl: TemplateInfo) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      setSelectedTemplate(tpl.id);
                      if (!name) setName(tpl.name.replace(/^[^\w]+ /, ''));
                      // Initialize default config values
                      const defaults: Record<string, unknown> = {};
                      Object.entries(tpl.configSchema).forEach(
                        ([key, field]) => {
                          if (field.default !== undefined) {
                            defaults[key] = field.default;
                          }
                        },
                      );
                      setTemplateConfig(defaults);
                    }}
                    className={cn(
                      'flex items-start gap-2 rounded-lg border p-3 text-left transition-all',
                      selectedTemplate === tpl.id
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-gray-600 bg-gray-700/50 hover:border-gray-500',
                    )}
                  >
                    <span className="text-lg shrink-0">{tpl.icon}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-white truncate">
                        {tpl.name.replace(/^[^\w]+ /, '')}
                      </div>
                      <div className="text-[10px] text-gray-400 line-clamp-2">
                        {tpl.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Bot Avatar ── */}
          <div>
            <Label className="text-gray-300 text-xs mb-2 block">
              Bot Avatar (optional)
            </Label>
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center border-2 border-gray-600">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Bot avatar"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Bot className="h-8 w-8 text-gray-400" />
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="bot-avatar-upload"
                  className="cursor-pointer rounded-md border border-gray-600 bg-gray-700/50 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-600/50 hover:text-white transition-colors inline-block text-center"
                >
                  Upload Image
                  <input
                    id="bot-avatar-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={handleAvatarSelect}
                    className="hidden"
                  />
                </label>
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarPreview(null);
                      setAvatarBase64(null);
                    }}
                    className="text-[11px] text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                )}
                <p className="text-[10px] text-gray-500">
                  Defaults to robot icon if not set
                </p>
              </div>
            </div>
          </div>

          {/* ── Bot Name ── */}
          <div>
            <Label htmlFor="bot-name" className="text-gray-300 text-xs">
              Bot Name
            </Label>
            <Input
              id="bot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                executionMode === EXECUTION_MODE.MANAGED_LLM
                  ? 'e.g. SummaryAgent'
                  : executionMode === EXECUTION_MODE.BUILTIN
                    ? 'e.g. WelcomeBot'
                    : 'e.g. MyBot'
              }
              className="mt-1 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
              maxLength={50}
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Users will @mention this name to trigger the bot.
            </p>
          </div>

          {/* ── Webhook URL (Webhook mode) ── */}
          {executionMode === EXECUTION_MODE.WEBHOOK && (
            <div>
              <Label htmlFor="webhook-url" className="text-gray-300 text-xs">
                Webhook URL
              </Label>
              <Input
                id="webhook-url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-bot-server.com/webhook"
                className="mt-1 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
                type="url"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Your bot server endpoint that receives event payloads.
              </p>
            </div>
          )}

          {/* ── Template Config (Builtin mode) ── */}
          {executionMode === EXECUTION_MODE.BUILTIN && selectedTemplateInfo && (
            <div className="space-y-3">
              <Label className="text-gray-300 text-xs block">
                Template Configuration
              </Label>
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

          {/* ── LLM Configuration (Managed LLM mode) ── */}
          {executionMode === EXECUTION_MODE.MANAGED_LLM && (
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
                        setLlmModel('');
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
                <Label htmlFor="llm-model" className="text-gray-300 text-xs">
                  Model
                </Label>
                <Input
                  id="llm-model"
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
                <Label htmlFor="llm-key" className="text-gray-300 text-xs">
                  API Key
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="llm-key"
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    placeholder="sk-..."
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
                <p className="mt-1 text-[11px] text-gray-500">
                  Your API key is encrypted at rest and never exposed to the
                  frontend.
                </p>
              </div>

              {/* Custom Base URL (for Custom provider) */}
              {llmProvider === LLM_PROVIDER.CUSTOM && (
                <div>
                  <Label
                    htmlFor="llm-base-url"
                    className="text-gray-300 text-xs"
                  >
                    Custom Base URL
                  </Label>
                  <Input
                    id="llm-base-url"
                    value={llmCustomBaseUrl}
                    onChange={(e) => setLlmCustomBaseUrl(e.target.value)}
                    placeholder="https://your-api.example.com/v1"
                    className="mt-1 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
                    type="url"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">
                    Must be OpenAI-compatible API endpoint.
                  </p>
                </div>
              )}

              {/* System Prompt */}
              <div>
                <Label htmlFor="llm-prompt" className="text-gray-300 text-xs">
                  System Prompt
                </Label>
                <Textarea
                  id="llm-prompt"
                  value={llmSystemPrompt}
                  onChange={(e) => setLlmSystemPrompt(e.target.value)}
                  placeholder="You are a helpful assistant..."
                  className="mt-1 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500 resize-none text-sm"
                  rows={3}
                  maxLength={4000}
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Defines the AI agent&apos;s personality and behavior.
                </p>
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
                  <p className="mt-1 text-[10px] text-gray-500">
                    Lower = focused, Higher = creative
                  </p>
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
                  Tools (optional)
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
            <Label htmlFor="bot-desc" className="text-gray-300 text-xs">
              Description (optional)
            </Label>
            <Textarea
              id="bot-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this bot do?"
              className="mt-1 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500 resize-none"
              rows={2}
              maxLength={500}
            />
          </div>
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
            disabled={!canSubmit || createBot.isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {createBot.isPending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
            ) : null}
            Create{' '}
            {executionMode === EXECUTION_MODE.MANAGED_LLM ? 'Agent' : 'Bot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
