'use client';

import {
  useState,
  useRef,
  useCallback,
  KeyboardEvent,
  useMemo,
  useEffect,
} from 'react';
import { Send, PlusCircle, X, FileIcon, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AttachmentDto, MAX_ATTACHMENT_SIZE } from '@discord-platform/shared';
import { toast } from '@/hooks/use-toast';
import { useMembers } from '@/hooks/use-member';
import { useBots } from '@/hooks/use-bot';

interface PendingFile {
  file: File;
  preview?: string; // data URL for images
}

interface MessageInputProps {
  guildId: string;
  channelName: string;
  onSendMessage: (content: string, attachments?: AttachmentDto[]) => void;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
  isUploading?: boolean;
  onFilesSelected?: (files: File[]) => Promise<AttachmentDto[]>;
}

export default function MessageInput({
  guildId,
  channelName,
  onSendMessage,
  onTyping,
  disabled = false,
  isUploading = false,
  onFilesSelected,
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: guildMembers = [] } = useMembers(guildId);
  const { data: gots = [] } = useBots(guildId);

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
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionOpen && mentionCandidates.length > 0) {
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
      updateMentionState(nextValue);

      // Auto-resize textarea
      const textarea = e.target;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    },
    [handleTyping, updateMentionState],
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
    <div className="px-4 pb-6 pt-2">
      {/* Pending Files Preview */}
      {pendingFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 rounded-t-lg bg-gray-600 px-4 py-3">
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

      <div className="relative flex items-end rounded-lg bg-gray-600 px-4 py-2">
        {mentionOpen && (
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
          placeholder={`Message #${channelName}`}
          className="mx-2 flex-1 resize-none bg-transparent text-gray-200 placeholder:text-gray-400 outline-none text-sm max-h-[200px] py-1.5"
          rows={1}
          disabled={disabled || isUploading}
        />
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
