'use client';

import {
  useState,
  useRef,
  useCallback,
  KeyboardEvent,
  useMemo,
  useEffect,
} from 'react';
import {
  Send,
  PlusCircle,
  X,
  FileIcon,
  Bot,
  Mic,
  Terminal,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AttachmentDto,
  MAX_ATTACHMENT_SIZE,
  ChannelSlashCommandInfo,
} from '@discord-platform/shared';
import { toast } from '@/hooks/use-toast';
import { useMembers } from '@/hooks/use-member';
import { useBots, useChannelCommands } from '@/hooks/use-bot';
import AudioRecorder from './audio-recorder';

interface PendingFile {
  file: File;
  preview?: string; // data URL for images
}

interface MessageInputProps {
  guildId: string;
  channelId: string;
  channelName: string;
  onSendMessage: (content: string, attachments?: AttachmentDto[]) => void;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
  isUploading?: boolean;
  onFilesSelected?: (files: File[]) => Promise<AttachmentDto[]>;
}

// Slash command completion state machine
type SlashState =
  | { phase: 'idle' }
  | { phase: 'picking-command'; query: string }
  | {
      phase: 'filling-params';
      command: ChannelSlashCommandInfo;
      filledParams: Record<string, string>;
      currentParamIndex: number;
    };

export default function MessageInput({
  guildId,
  channelId,
  channelName,
  onSendMessage,
  onTyping,
  disabled = false,
  isUploading = false,
  onFilesSelected,
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [showRecorder, setShowRecorder] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);

  // Slash command state
  const [slashState, setSlashState] = useState<SlashState>({ phase: 'idle' });
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: guildMembers = [] } = useMembers(guildId);
  const { data: gots = [] } = useBots(guildId);
  const { data: channelCommands = [] } = useChannelCommands(channelId);

  // ── Slash command candidates ──
  const slashCandidates = useMemo(() => {
    if (slashState.phase !== 'picking-command') return [];
    const q = slashState.query.toLowerCase();
    return channelCommands
      .filter(
        (cmd) =>
          q.length === 0 ||
          cmd.name.includes(q) ||
          cmd.description.toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [channelCommands, slashState]);

  // Currently filling param info
  const currentParam = useMemo(() => {
    if (slashState.phase !== 'filling-params') return null;
    const params = slashState.command.params || [];
    if (slashState.currentParamIndex >= params.length) return null;
    return params[slashState.currentParamIndex];
  }, [slashState]);

  const closeSlash = useCallback(() => {
    setSlashState({ phase: 'idle' });
    setSlashSelectedIndex(0);
  }, []);

  const applySlashCommand = useCallback(
    (index: number) => {
      const cmd = slashCandidates[index];
      if (!cmd) return;

      const params = cmd.params || [];
      if (params.length === 0) {
        // No params, just insert the command
        setContent(`/${cmd.name} `);
        setSlashState({ phase: 'idle' });
      } else {
        // Start param filling mode
        setContent(`/${cmd.name} `);
        setSlashState({
          phase: 'filling-params',
          command: cmd,
          filledParams: {},
          currentParamIndex: 0,
        });
      }
      setSlashSelectedIndex(0);

      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    },
    [slashCandidates],
  );

  const updateSlashState = useCallback(
    (nextContent: string) => {
      // ── Already in param-filling mode ──
      if (slashState.phase === 'filling-params') {
        const trimmed = nextContent.trim();
        const parts = trimmed.split(/\s+/);
        const cmdName = parts[0]?.slice(1); // remove leading /
        if (!cmdName || cmdName !== slashState.command.name) {
          closeSlash();
          return;
        }

        const paramValues = parts.slice(1);
        const params = slashState.command.params || [];
        if (params.length === 0) {
          setSlashState({ phase: 'idle' });
          return;
        }

        const filledParams: Record<string, string> = {};
        paramValues.forEach((val, i) => {
          if (i < params.length) {
            filledParams[params[i].name] = val;
          }
        });

        // Cap at last param so multi-word values for the final param stay visible
        const trailingSpace = nextContent.endsWith(' ');
        const rawIdx = trailingSpace
          ? paramValues.length
          : Math.max(0, paramValues.length - 1);
        const currentIdx = Math.min(rawIdx, params.length - 1);

        setSlashState({
          phase: 'filling-params',
          command: slashState.command,
          filledParams,
          currentParamIndex: currentIdx,
        });
        return;
      }

      // ── Not a slash command ──
      const trimmed = nextContent;
      if (!trimmed.startsWith('/')) {
        if (slashState.phase !== 'idle') closeSlash();
        return;
      }

      const firstSpace = trimmed.indexOf(' ');
      if (firstSpace > 0) {
        // User typed /commandname + space — try to auto-enter param filling
        const typedCmd = trimmed.slice(1, firstSpace).toLowerCase();
        const matchedCmd = channelCommands.find((c) => c.name === typedCmd);

        if (matchedCmd && (matchedCmd.params || []).length > 0) {
          // Auto-enter filling-params regardless of whether autocomplete was used
          const splitParts = trimmed.split(/\s+/);
          const paramValues = splitParts.slice(1).filter((v) => v.length > 0);
          const params = matchedCmd.params || [];
          const filledParams: Record<string, string> = {};
          paramValues.forEach((val, i) => {
            if (i < params.length) filledParams[params[i].name] = val;
          });

          const trailingSpace = trimmed.endsWith(' ');
          const rawIdx = trailingSpace
            ? paramValues.length
            : Math.max(0, paramValues.length - 1);
          const currentIdx = Math.min(rawIdx, params.length - 1);

          setSlashState({
            phase: 'filling-params',
            command: matchedCmd,
            filledParams,
            currentParamIndex: currentIdx,
          });
          setSlashSelectedIndex(0);
        } else if (slashState.phase === 'picking-command') {
          closeSlash();
        }
        return;
      }

      // Still typing the command name — show autocomplete picker
      const query = trimmed.slice(1); // remove /
      setSlashState({ phase: 'picking-command', query });
      setSlashSelectedIndex(0);
    },
    [slashState, closeSlash, channelCommands],
  );

  // Unified mention candidates: members + bots
  const mentionCandidates = useMemo(() => {
    if (!mentionOpen) return [];
    const normalizedQuery = mentionQuery.toLowerCase();

    type MentionCandidate = {
      id: string;
      displayName: string;
      subtitle?: string;
      isBot: boolean;
      type?: string;
    };

    const memberCandidates: MentionCandidate[] = guildMembers
      .filter((member) => {
        const displayName = (
          member.nickname ||
          member.user?.name ||
          ''
        ).toLowerCase();
        return (
          normalizedQuery.length === 0 || displayName.includes(normalizedQuery)
        );
      })
      .map((member) => ({
        id: member.id,
        displayName: member.nickname || member.user?.name || 'Unknown',
        subtitle: member.nickname ? member.user?.name : undefined,
        isBot: false,
      }));

    const botCandidates: MentionCandidate[] = gots
      .filter((bot) => {
        return (
          bot.status === 'active' &&
          (normalizedQuery.length === 0 ||
            bot.name.toLowerCase().includes(normalizedQuery))
        );
      })
      .map((bot) => ({
        id: `bot-${bot.id}`,
        displayName: bot.name,
        subtitle: bot.type === 'agent' ? 'AI Agent' : 'Bot',
        isBot: true,
        type: bot.type,
      }));

    return [...botCandidates, ...memberCandidates].slice(0, 8);
  }, [guildMembers, gots, mentionOpen, mentionQuery]);

  const closeMention = useCallback(() => {
    setMentionOpen(false);
    setMentionQuery('');
    setMentionStart(null);
    setMentionSelectedIndex(0);
  }, []);

  useEffect(() => {
    const handleMentionEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ displayName?: string }>;
      const displayName = customEvent.detail?.displayName?.trim();
      if (!displayName) return;

      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorStart = textarea.selectionStart ?? content.length;
      const cursorEnd = textarea.selectionEnd ?? content.length;
      const mentionText = `@${displayName} `;

      const nextContent =
        content.slice(0, cursorStart) + mentionText + content.slice(cursorEnd);

      setContent(nextContent);
      closeMention();

      requestAnimationFrame(() => {
        const nextCursor = cursorStart + mentionText.length;
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
      });
    };

    window.addEventListener('discord:mention-user', handleMentionEvent);
    return () => {
      window.removeEventListener('discord:mention-user', handleMentionEvent);
    };
  }, [content, closeMention]);

  const updateMentionState = useCallback(
    (nextContent: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        closeMention();
        return;
      }

      const cursor = textarea.selectionStart ?? nextContent.length;
      const beforeCursor = nextContent.slice(0, cursor);
      const atIndex = beforeCursor.lastIndexOf('@');

      if (atIndex === -1) {
        closeMention();
        return;
      }

      const hasValidPrefix =
        atIndex === 0 || /\s/.test(beforeCursor[atIndex - 1]);
      if (!hasValidPrefix) {
        closeMention();
        return;
      }

      const query = beforeCursor.slice(atIndex + 1);
      if (/\s/.test(query)) {
        closeMention();
        return;
      }

      setMentionOpen(true);
      setMentionStart(atIndex);
      setMentionQuery(query);
      setMentionSelectedIndex(0);
    },
    [closeMention],
  );

  const applyMention = useCallback(
    (memberIndex: number) => {
      if (!mentionOpen || mentionStart === null) return;
      const candidate = mentionCandidates[memberIndex];
      const textarea = textareaRef.current;
      if (!candidate || !textarea) return;

      const cursor = textarea.selectionStart ?? content.length;
      const displayName = candidate.displayName;
      const mentionText = `@${displayName} `;
      const nextContent =
        content.slice(0, mentionStart) + mentionText + content.slice(cursor);

      setContent(nextContent);
      closeMention();

      requestAnimationFrame(() => {
        const nextCursor = mentionStart + mentionText.length;
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [content, mentionCandidates, mentionOpen, mentionStart, closeMention],
  );

  const handleTyping = useCallback(() => {
    if (!onTyping) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping(true);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onTyping(false);
    }, 3000);
  }, [onTyping]);

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed && pendingFiles.length === 0) return;

    let attachments: AttachmentDto[] | undefined;

    // Upload pending files first
    if (pendingFiles.length > 0 && onFilesSelected) {
      try {
        attachments = await onFilesSelected(pendingFiles.map((pf) => pf.file));
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'File upload failed';
        toast({
          variant: 'destructive',
          title: 'Upload Error',
          description: message,
        });
        return;
      }
    }

    onSendMessage(trimmed || '', attachments);
    setContent('');
    setPendingFiles([]);
    closeMention();
    closeSlash();

    // Stop typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (isTypingRef.current && onTyping) {
      isTypingRef.current = false;
      onTyping(false);
    }

    // Auto-resize textarea back
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [
    content,
    pendingFiles,
    onSendMessage,
    onTyping,
    onFilesSelected,
    closeMention,
    closeSlash,
  ]);

  const handleRecordingComplete = useCallback(
    async (blob: Blob, durationSec: number) => {
      if (!onFilesSelected) return;
      const file = new File([blob], `voice-message-${Date.now()}.webm`, {
        type: 'audio/webm',
      });
      try {
        const attachments = await onFilesSelected([file]);
        // Add duration to the attachment dto
        const attachmentsWithDuration = attachments.map((att) => ({
          ...att,
          duration: Math.round(durationSec),
        }));
        onSendMessage('', attachmentsWithDuration);
        setShowRecorder(false);
      } catch {
        toast({
          variant: 'destructive',
          title: 'Upload Error',
          description: 'Failed to upload voice message',
        });
      }
    },
    [onFilesSelected, onSendMessage],
  );

  // Determine which popup is active (slash takes priority)
  const isSlashActive =
    slashState.phase === 'picking-command' ||
    slashState.phase === 'filling-params';

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Slash command keyboard navigation
      if (
        slashState.phase === 'picking-command' &&
        slashCandidates.length > 0
      ) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashSelectedIndex((prev) => (prev + 1) % slashCandidates.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashSelectedIndex((prev) =>
            prev === 0 ? slashCandidates.length - 1 : prev - 1,
          );
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          applySlashCommand(slashSelectedIndex);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeSlash();
          return;
        }
      }

      // Param filling: Tab to confirm param and move to next
      if (slashState.phase === 'filling-params') {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeSlash();
          return;
        }
      }

      // Mention keyboard navigation
      if (!isSlashActive && mentionOpen && mentionCandidates.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionSelectedIndex(
            (prev) => (prev + 1) % mentionCandidates.length,
          );
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionSelectedIndex((prev) =>
            prev === 0 ? mentionCandidates.length - 1 : prev - 1,
          );
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          applyMention(mentionSelectedIndex);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeMention();
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [
      slashState,
      slashCandidates,
      slashSelectedIndex,
      applySlashCommand,
      closeSlash,
      isSlashActive,
      mentionOpen,
      mentionCandidates,
      mentionSelectedIndex,
      applyMention,
      closeMention,
      handleSend,
    ],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = e.target.value;
      setContent(nextValue);
      handleTyping();

      // Update slash state first (takes priority)
      updateSlashState(nextValue);

      // Only update mention state if not in slash mode
      if (!nextValue.startsWith('/')) {
        updateMentionState(nextValue);
      } else {
        closeMention();
      }

      // Auto-resize textarea
      const textarea = e.target;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    },
    [handleTyping, updateSlashState, updateMentionState, closeMention],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      // Validate file sizes before adding to pending
      const maxMB = Math.round(MAX_ATTACHMENT_SIZE / (1024 * 1024));
      const oversized = files.filter((f) => f.size > MAX_ATTACHMENT_SIZE);
      if (oversized.length > 0) {
        const names = oversized.map((f) => f.name).join(', ');
        toast({
          variant: 'destructive',
          title: 'File Too Large',
          description: `File${oversized.length > 1 ? 's' : ''} exceed${oversized.length === 1 ? 's' : ''} the max size of ${maxMB}MB: ${names}`,
        });
      }

      const validFiles = files.filter((f) => f.size <= MAX_ATTACHMENT_SIZE);
      if (validFiles.length === 0) {
        e.target.value = '';
        return;
      }

      const newPendingFiles: PendingFile[] = validFiles.map((file) => {
        const pending: PendingFile = { file };
        if (file.type.startsWith('image/')) {
          pending.preview = URL.createObjectURL(file);
        }
        return pending;
      });

      setPendingFiles((prev) => [...prev, ...newPendingFiles].slice(0, 10));

      // Reset the input so the same file can be selected again
      e.target.value = '';
    },
    [],
  );

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => {
      const removed = prev[index];
      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="px-4 pb-4 pt-2">
      {/* Voice Recorder */}
      {showRecorder && (
        <div className="mb-2">
          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            onCancel={() => setShowRecorder(false)}
          />
        </div>
      )}

      {/* Pending Files Preview */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-t-lg bg-gray-600 px-4 py-3">
          {pendingFiles.map((pf, idx) => (
            <div
              key={idx}
              className="relative group rounded-lg bg-gray-700 overflow-hidden"
            >
              {pf.preview ? (
                <div className="w-[120px] h-[120px]">
                  <img
                    src={pf.preview}
                    alt={pf.file.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-[120px] h-[120px] flex flex-col items-center justify-center p-2">
                  <FileIcon className="h-8 w-8 text-gray-400 mb-1" />
                  <p className="text-[10px] text-gray-300 truncate w-full text-center">
                    {pf.file.name}
                  </p>
                  <p className="text-[9px] text-gray-500">
                    {formatFileSize(pf.file.size)}
                  </p>
                </div>
              )}
              <button
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-gray-900/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removePendingFile(idx)}
              >
                <X className="h-3 w-3 text-white" />
              </button>
              {pf.preview && (
                <div className="absolute bottom-0 left-0 right-0 bg-gray-900/70 px-1 py-0.5">
                  <p className="text-[9px] text-gray-300 truncate">
                    {pf.file.name}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        className={`relative flex items-end bg-gray-600 px-4 py-2 transition-colors focus-within:ring-1 focus-within:ring-indigo-500 ${pendingFiles.length > 0 ? 'rounded-b-lg' : 'rounded-lg'}`}
      >
        {/* ── Slash Command Autocomplete Popup ── */}
        {slashState.phase === 'picking-command' &&
          slashCandidates.length > 0 && (
            <div className="absolute bottom-full left-4 right-4 mb-2 rounded-lg border border-gray-600 bg-gray-800 shadow-xl overflow-hidden z-20">
              <div className="px-3 py-2 border-b border-gray-700 bg-gray-800/80">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Slash Commands
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {slashCandidates.map((cmd, index) => (
                  <button
                    key={`${cmd.botId}-${cmd.name}`}
                    type="button"
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                      index === slashSelectedIndex
                        ? 'bg-indigo-500/20 text-white'
                        : 'text-gray-300 hover:bg-gray-700/70'
                    }`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applySlashCommand(index);
                    }}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/20">
                      <Terminal className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-emerald-300 font-semibold">
                          /{cmd.name}
                        </span>
                        {cmd.params && cmd.params.length > 0 && (
                          <span className="text-[10px] text-gray-500">
                            {cmd.params.length} param
                            {cmd.params.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {cmd.description && (
                        <span className="text-xs text-gray-400 truncate block">
                          {cmd.description}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">
                      {cmd.botName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

        {/* ── Param Filling Guide ── */}
        {slashState.phase === 'filling-params' && currentParam && (
          <div className="absolute bottom-full left-4 right-4 mb-2 rounded-lg border border-gray-600 bg-gray-800 shadow-xl overflow-hidden z-20">
            <div className="px-3 py-2 border-b border-gray-700 bg-gray-800/80">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10">
                  <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                </div>
                <span className="font-mono text-sm text-emerald-300 font-semibold">
                  /{slashState.command.name}
                </span>
                <ChevronRight className="h-3 w-3 text-gray-500" />
                <span className="text-sm text-yellow-300 font-medium">
                  {currentParam.name}
                  {currentParam.required && (
                    <span className="text-red-400 ml-0.5">*</span>
                  )}
                </span>
                <span className="ml-1 rounded-full bg-gray-700 px-2 py-0.5 text-[10px] text-gray-400">
                  {currentParam.type}
                </span>
              </div>
            </div>
            <div className="px-3 py-2.5">
              {currentParam.description && (
                <p className="text-xs text-gray-400 mb-2">
                  {currentParam.description}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {(slashState.command.params || []).map((p, i) => {
                  const filledValue = slashState.filledParams[p.name];
                  const isCurrent = i === slashState.currentParamIndex;
                  const isDone = i < slashState.currentParamIndex;
                  return (
                    <span
                      key={p.name}
                      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
                        isDone
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : isCurrent
                            ? 'border-yellow-400/30 bg-yellow-400/10 text-yellow-300 font-medium'
                            : 'border-gray-600 bg-gray-700/50 text-gray-500'
                      }`}
                    >
                      {isDone ? '✓ ' : ''}
                      {p.name}
                      {p.required ? '*' : ''}
                      {isDone && filledValue && (
                        <span className="text-emerald-400/70 max-w-[80px] truncate">
                          ={filledValue}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
              {/* Hint for last param */}
              {slashState.currentParamIndex ===
                (slashState.command.params || []).length - 1 &&
                (slashState.command.params || []).length > 0 && (
                  <p className="mt-2 text-[10px] text-gray-500 flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-gray-700 text-gray-400 text-[9px] font-mono">
                      Enter
                    </kbd>
                    to send
                  </p>
                )}
            </div>
          </div>
        )}

        {/* ── @Mention Popup ── */}
        {!isSlashActive && mentionOpen && (
          <div className="absolute bottom-full left-4 right-4 mb-2 rounded-md border border-gray-600 bg-gray-800 shadow-lg overflow-hidden z-20">
            {mentionCandidates.length > 0 ? (
              mentionCandidates.map((candidate, index) => {
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                      index === mentionSelectedIndex
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-300 hover:bg-gray-700/70'
                    }`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applyMention(index);
                    }}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {candidate.isBot && (
                        <Bot className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      )}
                      <span className="truncate">{candidate.displayName}</span>
                      {candidate.isBot && (
                        <span className="shrink-0 rounded bg-blue-500/20 px-1 py-0.5 text-[10px] text-blue-300">
                          {candidate.type === 'agent' ? 'Agent' : 'Bot'}
                        </span>
                      )}
                    </span>
                    {candidate.subtitle && !candidate.isBot && (
                      <span className="ml-3 truncate text-xs text-gray-400">
                        {candidate.subtitle}
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-sm text-gray-400">
                No members or bots found
              </div>
            )}
          </div>
        )}

        {/* Attachment Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-gray-400 hover:text-gray-200 mb-0.5"
          disabled={disabled || isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <PlusCircle className="h-5 w-5" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
        />
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={`Message #${channelName}  •  Type / for commands`}
          className="mx-2 flex-1 resize-none bg-transparent text-gray-200 placeholder:text-gray-400 outline-none text-sm max-h-[200px] py-1.5"
          rows={1}
          disabled={disabled || isUploading}
        />
        {/* Voice Record Button */}
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 shrink-0 mb-0.5 ${showRecorder ? 'text-red-400 hover:text-red-300' : 'text-gray-400 hover:text-gray-200'}`}
          disabled={disabled || isUploading}
          onClick={() => setShowRecorder((prev) => !prev)}
        >
          <Mic className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-gray-400 hover:text-gray-200 mb-0.5 disabled:opacity-40"
          onClick={handleSend}
          disabled={
            disabled ||
            isUploading ||
            (!content.trim() && pendingFiles.length === 0)
          }
        >
          {isUploading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-white" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  );
}
