'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  url: string;
  duration?: number;
  filename?: string;
  compact?: boolean;
}

export default function AudioPlayer({
  url,
  duration: initialDuration,
  filename,
  compact = false,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      const progress = progressRef.current;
      if (!audio || !progress || !duration) return;

      const rect = progress.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      audio.currentTime = percentage * duration;
    },
    [duration],
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Generate waveform bars (decorative)
  const waveformBars = Array.from({ length: compact ? 20 : 40 }, (_, i) => {
    const height = 20 + Math.sin(i * 0.8) * 30 + Math.cos(i * 1.5) * 20;
    return Math.max(15, Math.min(100, height));
  });

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg bg-gray-800 border border-gray-700',
        compact ? 'p-2 max-w-[280px]' : 'p-3 max-w-sm',
      )}
    >
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Play/Pause button */}
      <button
        onClick={togglePlayPause}
        className={cn(
          'flex items-center justify-center rounded-full shrink-0 transition-colors',
          compact ? 'h-8 w-8' : 'h-10 w-10',
          'bg-green-600 hover:bg-green-700 text-white',
        )}
      >
        {isPlaying ? (
          <Pause className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        ) : (
          <Play className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4', 'ml-0.5')} />
        )}
      </button>

      <div className="flex-1 min-w-0">
        {/* Waveform visualization */}
        <div
          ref={progressRef}
          className="flex items-center gap-[1px] h-6 cursor-pointer"
          onClick={handleProgressClick}
        >
          {waveformBars.map((height, i) => {
            const barProgress = (i / waveformBars.length) * 100;
            return (
              <div
                key={i}
                className={cn(
                  'w-[2px] rounded-full transition-colors duration-100',
                  barProgress <= progress ? 'bg-green-400' : 'bg-gray-600',
                )}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>

        {/* Time display */}
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-gray-400">
            {formatTime(currentTime)}
          </span>
          <div className="flex items-center gap-1">
            {filename && !compact && <Mic className="h-3 w-3 text-gray-500" />}
            <span className="text-[10px] text-gray-400">
              {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
