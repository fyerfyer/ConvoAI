'use client';

import { useState, useCallback } from 'react';
import {
  Search,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  User,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import MessageItem from './message-item';
import { useSearchMessages } from '@/hooks/use-chat';
import { MessageResponse, SEARCH_MODE } from '@discord-platform/shared';

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  channelName: string;
  currentUserId?: string;
}

const PAGE_SIZE = 25;

export default function SearchModal({
  open,
  onOpenChange,
  channelId,
  channelName,
  currentUserId,
}: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<string>(SEARCH_MODE.KEYWORD);
  const [authorId, setAuthorId] = useState('');
  const [dateAfter, setDateAfter] = useState('');
  const [dateBefore, setDateBefore] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [offset, setOffset] = useState(0);
  const [results, setResults] = useState<{
    messages: MessageResponse[];
    total: number;
  } | null>(null);

  const searchMutation = useSearchMessages();

  const doSearch = useCallback(
    (newOffset = 0) => {
      if (!query.trim()) return;
      setOffset(newOffset);
      searchMutation.mutate(
        {
          channelId,
          query: query.trim(),
          mode: searchMode,
          authorId: authorId || undefined,
          before: dateBefore || undefined,
          after: dateAfter || undefined,
          limit: PAGE_SIZE,
          offset: newOffset,
        },
        {
          onSuccess: (data) => {
            setResults(data ?? null);
          },
        },
      );
    },
    [channelId, query, searchMode, authorId, dateBefore, dateAfter, searchMutation],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      doSearch(0);
    }
  };

  const totalPages = results ? Math.ceil(results.total / PAGE_SIZE) : 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col bg-gray-800 border-gray-700 text-white p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5 text-gray-400" />
            Search in #{channelName}
          </DialogTitle>
        </DialogHeader>

        {/* Search Bar */}
        <div className="px-4 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search messages..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
                autoFocus
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery('');
                    setResults(null);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              onClick={() => doSearch(0)}
              disabled={!query.trim() || searchMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {searchMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Search'
              )}
            </Button>
          </div>

          {/* Search mode selector */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-gray-900 border border-gray-700 p-0.5">
              <button
                onClick={() => setSearchMode(SEARCH_MODE.KEYWORD)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  searchMode === SEARCH_MODE.KEYWORD
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Keyword
              </button>
              <button
                onClick={() => setSearchMode(SEARCH_MODE.FULLTEXT)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  searchMode === SEARCH_MODE.FULLTEXT
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Full-Text
              </button>
            </div>
            <span className="text-[10px] text-gray-500">
              {searchMode === SEARCH_MODE.KEYWORD
                ? 'Substring match (supports CJK)'
                : 'MongoDB full-text search'}
            </span>
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            {showFilters ? 'Hide filters' : 'Show filters'}
          </button>

          {/* Filters */}
          {showFilters && (
            <div className="grid grid-cols-3 gap-2 pb-2">
              <div>
                <label className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                  <User className="h-3 w-3" />
                  Author ID
                </label>
                <Input
                  placeholder="User ID"
                  value={authorId}
                  onChange={(e) => setAuthorId(e.target.value)}
                  className="h-8 text-xs bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                  <Calendar className="h-3 w-3" />
                  After
                </label>
                <Input
                  type="date"
                  value={dateAfter}
                  onChange={(e) => setDateAfter(e.target.value)}
                  className="h-8 text-xs bg-gray-900 border-gray-600 text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                  <Calendar className="h-3 w-3" />
                  Before
                </label>
                <Input
                  type="date"
                  value={dateBefore}
                  onChange={(e) => setDateBefore(e.target.value)}
                  className="h-8 text-xs bg-gray-900 border-gray-600 text-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-b border-gray-700" />

        {/* Results */}
        <ScrollArea className="flex-1 min-h-0">
          {!results && !searchMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Search className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">Enter a search term to find messages</p>
            </div>
          )}

          {searchMutation.isPending && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
            </div>
          )}

          {results && !searchMutation.isPending && (
            <>
              <div className="px-4 py-2 text-xs text-gray-400">
                {results.total} result{results.total !== 1 ? 's' : ''} found
              </div>
              {results.messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <p className="text-sm">No messages found</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-700/30">
                  {results.messages.map((message) => (
                    <MessageItem
                      key={message.id}
                      message={message}
                      currentUserId={currentUserId}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </ScrollArea>

        {/* Pagination */}
        {results && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-700">
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => doSearch(offset - PAGE_SIZE)}
              className="text-gray-400 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-xs text-gray-400">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => doSearch(offset + PAGE_SIZE)}
              className="text-gray-400 hover:text-white"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
