'use client';

import { EmbedResponse } from '@discord-platform/shared';

interface EmbedRendererProps {
  embed: EmbedResponse;
}

function intToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export default function EmbedRenderer({ embed }: EmbedRendererProps) {
  const borderColor = embed.color ? intToHex(embed.color) : '#5865F2'; // Discord blurple

  return (
    <div
      className="mt-1 max-w-[520px] rounded-lg bg-gray-800 overflow-hidden"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <div className="p-3">
        {/* Author row (could be added later) */}

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

            {/* Description */}
            {embed.description && (
              <p className="text-sm text-gray-300 whitespace-pre-wrap break-words mb-2">
                {embed.description}
              </p>
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
