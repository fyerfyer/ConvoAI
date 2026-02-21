'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EmbedResponse } from '@discord-platform/shared';

interface EmbedRendererProps {
  embed: EmbedResponse;
}

function intToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Detect if description contains markdown formatting worth rendering */
function hasMarkdown(text: string): boolean {
  return /(\*\*|__|~~|```|`[^`]+`|\[.+\]\(.+\)|^#{1,3}\s|^[-*]\s|^\d+\.\s)/m.test(
    text,
  );
}

export default function EmbedRenderer({ embed }: EmbedRendererProps) {
  const borderColor = embed.color ? intToHex(embed.color) : '#5865F2';

  return (
    <div
      className="mt-1 max-w-[520px] rounded-lg bg-gray-800 overflow-hidden"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <div className="p-3">
        {/* Provider name */}
        {embed.provider && (
          <div className="text-[11px] text-gray-500 uppercase font-semibold mb-1">
            {embed.provider.url ? (
              <a
                href={embed.provider.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {embed.provider.name}
              </a>
            ) : (
              embed.provider.name
            )}
          </div>
        )}

        {/* Author row */}
        {embed.author && (
          <div className="flex items-center gap-2 mb-1.5">
            {embed.author.icon_url && (
              <img
                src={embed.author.icon_url}
                alt=""
                className="h-6 w-6 rounded-full"
              />
            )}
            {embed.author.url ? (
              <a
                href={embed.author.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-white hover:underline"
              >
                {embed.author.name}
              </a>
            ) : (
              <span className="text-sm font-semibold text-white">
                {embed.author.name}
              </span>
            )}
          </div>
        )}

        <div className="flex gap-4">
          {/* Main content area */}
          <div className="flex-1 min-w-0">
            {/* Title */}
            {embed.title && (
              <div className="mb-1">
                {embed.url ? (
                  <a
                    href={embed.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-blue-400 hover:underline"
                  >
                    {embed.title}
                  </a>
                ) : (
                  <h4 className="text-sm font-semibold text-white">
                    {embed.title}
                  </h4>
                )}
              </div>
            )}

            {/* Description - with markdown support */}
            {embed.description && (
              <div className="text-sm text-gray-300 break-words mb-2">
                {hasMarkdown(embed.description) ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => (
                        <p className="mb-1 last:mb-0">{children}</p>
                      ),
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
                      strong: ({ children }) => (
                        <strong className="font-bold text-white">
                          {children}
                        </strong>
                      ),
                      em: ({ children }) => (
                        <em className="italic">{children}</em>
                      ),
                      code: ({ className, children, ...props }) => {
                        const isInline = !className;
                        return isInline ? (
                          <code className="bg-gray-900 px-1 py-0.5 rounded text-[13px] text-gray-100">
                            {children}
                          </code>
                        ) : (
                          <code
                            className={`${className || ''} text-[13px]`}
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                      pre: ({ children }) => (
                        <pre className="bg-gray-900 rounded p-2 overflow-x-auto my-1 text-[13px]">
                          {children}
                        </pre>
                      ),
                    }}
                  >
                    {embed.description}
                  </ReactMarkdown>
                ) : (
                  <p className="whitespace-pre-wrap">{embed.description}</p>
                )}
              </div>
            )}

            {/* Fields */}
            {embed.fields && embed.fields.length > 0 && (
              <div
                className="grid gap-2 mb-2"
                style={{
                  gridTemplateColumns: embed.fields.some((f) => f.inline)
                    ? 'repeat(3, 1fr)'
                    : '1fr',
                }}
              >
                {embed.fields.map((field, idx) => (
                  <div
                    key={idx}
                    className={field.inline ? '' : 'col-span-full'}
                  >
                    <h5 className="text-xs font-semibold text-white mb-0.5">
                      {field.name}
                    </h5>
                    <p className="text-xs text-gray-300 whitespace-pre-wrap">
                      {field.value}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Thumbnail */}
          {embed.thumbnail && (
            <div className="shrink-0">
              <img
                src={embed.thumbnail.url}
                alt=""
                className="w-20 h-20 rounded object-cover"
              />
            </div>
          )}
        </div>

        {/* Image */}
        {embed.image && (
          <div className="mt-2">
            <img
              src={embed.image.url}
              alt=""
              className="max-w-full max-h-[300px] rounded object-contain"
            />
          </div>
        )}

        {/* Footer */}
        {(embed.footer || embed.timestamp) && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
            {embed.footer?.icon_url && (
              <img
                src={embed.footer.icon_url}
                alt=""
                className="h-4 w-4 rounded-full"
              />
            )}
            {embed.footer?.text && <span>{embed.footer.text}</span>}
            {embed.footer?.text && embed.timestamp && <span>•</span>}
            {embed.timestamp && (
              <span>
                {new Date(embed.timestamp).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
