'use client';

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface MessageContentProps {
  content: string;
}

// Process @mentions before markdown rendering
function preprocessContent(content: string): string {
  // Escape any accidental markdown in mentions but preserve them
  return content;
}

// Check if content has markdown features worth rendering
function hasMarkdown(content: string): boolean {
  // Check for code blocks, bold, italic, links, lists, headers, strikethrough, tables
  return /```[\s\S]*```|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|~~[^~]+~~|\[.+\]\(.+\)|^#{1,6}\s|^[-*+]\s|^\d+\.\s|^\|/m.test(
    content,
  );
}

// Custom components for markdown rendering
const markdownComponents: Components = {
  // Code blocks with syntax highlighting styling
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded bg-gray-900 text-pink-300 text-[13px] font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={`${className} text-[13px]`} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 rounded-lg bg-gray-900 p-3 overflow-x-auto text-sm font-mono border border-gray-700">
      {children}
    </pre>
  ),
  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:underline"
    >
      {children}
    </a>
  ),
  // Bold
  strong: ({ children }) => (
    <strong className="font-bold text-white">{children}</strong>
  ),
  // Italic
  em: ({ children }) => <em className="italic">{children}</em>,
  // Strikethrough
  del: ({ children }) => (
    <del className="line-through text-gray-500">{children}</del>
  ),
  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-gray-600 pl-3 my-1 text-gray-300 italic">
      {children}
    </blockquote>
  ),
  // Lists
  ul: ({ children }) => (
    <ul className="list-disc list-inside my-1 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside my-1 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="text-gray-200">{children}</li>,
  // Headers (scale down since these are chat messages)
  h1: ({ children }) => (
    <h1 className="text-lg font-bold text-white mt-2 mb-1">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold text-white mt-2 mb-1">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-bold text-white mt-1 mb-0.5">{children}</h3>
  ),
  // Tables
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse border border-gray-700 text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-800">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-gray-700 px-3 py-1.5 text-left text-gray-300 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-700 px-3 py-1.5 text-gray-300">
      {children}
    </td>
  ),
  // Horizontal rule
  hr: () => <hr className="my-2 border-gray-700" />,
  // Paragraphs - no extra margin in chat
  p: ({ children }) => <p className="mb-0.5 last:mb-0">{children}</p>,
};

// Render @mentions with styled spans
function renderWithMentions(text: string): React.ReactNode[] {
  const mentionRegex = /@([^\s@]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span
        key={`mention-${match.index}`}
        className="rounded bg-indigo-500/20 px-1 text-indigo-200"
      >
        {match[0]}
      </span>,
    );
    lastIndex = mentionRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export default function MessageContent({ content }: MessageContentProps) {
  const processedContent = useMemo(() => preprocessContent(content), [content]);
  const shouldRenderMarkdown = useMemo(
    () => hasMarkdown(processedContent),
    [processedContent],
  );

  // For simple messages without markdown, use fast plain text rendering with mentions
  if (!shouldRenderMarkdown) {
    return (
      <p className="text-sm text-gray-200 break-words whitespace-pre-wrap mt-0.5">
        {renderWithMentions(processedContent)}
      </p>
    );
  }

  // For markdown content, use react-markdown
  return (
    <div className="text-sm text-gray-200 break-words mt-0.5 message-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
