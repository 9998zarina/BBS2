import { useRef, useState, useEffect, useCallback } from 'react';
import { videoApi } from '../../services/api';

interface DualVideoPlayerProps {
  frontVideoId: string | null;
  sideVideoId: string | null;
  syncOffsetMs: number;
  onOffsetChange?: (offsetMs: number) => void;
}

export function DualVideoPlayer({
  frontVideoId,
  sideVideoId,
  syncOffsetMs,
  onOffsetChange,
}: DualVideoPlayerProps) {
  const frontVideoRef = useRef<HTMLVideoElement>(null);
  const sideVideoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [manualOffset, setManualOffset] = useState(syncOffsetMs);

  useEffect(() => {
    setManualOffset(syncOffsetMs);
  }, [syncOffsetMs]);

  const handlePlayPause = useCallback(() => {
    const frontVideo = frontVideoRef.current;
    const sideVideo = sideVideoRef.current;

    if (!frontVideo && !sideVideo) return;

    if (isPlaying) {
      frontVideo?.pause();
      sideVideo?.pause();
      setIsPlaying(false);
    } else {
      frontVideo?.play();
      sideVideo?.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    const frontVideo = frontVideoRef.current;
    const sideVideo = sideVideoRef.current;

    if (frontVideo) {
      frontVideo.currentTime = time;
    }
    if (sideVideo) {
      const offsetSeconds = manualOffset / 1000;
      sideVideo.currentTime = Math.max(0, time + offsetSeconds);
    }
    setCurrentTime(time);
  }, [manualOffset]);

  const handleTimeUpdate = useCallback(() => {
    const frontVideo = frontVideoRef.current;
    if (frontVideo) {
      setCurrentTime(frontVideo.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const frontVideo = frontVideoRef.current;
    const sideVideo = sideVideoRef.current;

    const frontDuration = frontVideo?.duration || 0;
    const sideDuration = sideVideo?.duration || 0;
    setDuration(Math.max(frontDuration, sideDuration));
  }, []);

  const handleOffsetChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const offset = parseFloat(e.target.value);
    setManualOffset(offset);
    onOffsetChange?.(offset);

    const sideVideo = sideVideoRef.current;
    const frontVideo = frontVideoRef.current;
    if (sideVideo && frontVideo) {
      const offsetSeconds = offset / 1000;
      sideVideo.currentTime = Math.max(0, frontVideo.currentTime + offsetSeconds);
    }
  }, [onOffsetChange]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleReset = useCallback(() => {
    const frontVideo = frontVideoRef.current;
    const sideVideo = sideVideoRef.current;

    if (frontVideo) frontVideo.currentTime = 0;
    if (sideVideo) sideVideo.currentTime = Math.max(0, manualOffset / 1000);
    setCurrentTime(0);
  }, [manualOffset]);

  if (!frontVideoId && !sideVideoId) {
    return (
      <div className="bg-gray-100 rounded-lg p-8 text-center text-gray-500">
        영상을 업로드하면 여기에서 재생됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 text-center">정면 영상</h4>
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            {frontVideoId ? (
              <video
                ref={frontVideoRef}
                src={videoApi.getVideoUrl(frontVideoId)}
                className="w-full h-full object-contain"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                playsInline
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                영상 없음
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 text-center">측면 영상</h4>
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            {sideVideoId ? (
              <video
                ref={sideVideoRef}
                src={videoApi.getVideoUrl(sideVideoId)}
                className="w-full h-full object-contain"
                onLoadedMetadata={handleLoadedMetadata}
                playsInline
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                영상 없음
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handlePlayPause}
            className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
            disabled={!frontVideoId && !sideVideoId}
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            onClick={handleReset}
            className="p-2 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <div className="flex-1">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <span className="text-sm text-gray-600 min-w-[80px] text-right">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-600 min-w-[100px]">
            동기화 오프셋:
          </label>
          <input
            type="range"
            min={-5000}
            max={5000}
            step={10}
            value={manualOffset}
            onChange={handleOffsetChange}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-sm text-gray-600 min-w-[80px] text-right">
            {manualOffset > 0 ? '+' : ''}{manualOffset}ms
          </span>
        </div>
      </div>
    </div>
  );
}
