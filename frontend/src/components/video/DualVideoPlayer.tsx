import { useRef, useState, useEffect, useCallback } from 'react';
import { videoApi, syncApi } from '../../services/api';
import { VideoWithSkeleton, type VideoWithSkeletonRef } from './VideoWithSkeleton';

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
  const frontVideoRef = useRef<VideoWithSkeletonRef>(null);
  const sideVideoRef = useRef<VideoWithSkeletonRef>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [manualOffset, setManualOffset] = useState(syncOffsetMs);

  // Auto sync states
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncConfidence, setSyncConfidence] = useState<number | null>(null);

  useEffect(() => {
    setManualOffset(syncOffsetMs);
  }, [syncOffsetMs]);

  // Reset playing state when video IDs change
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, [frontVideoId, sideVideoId]);

  // Auto sync function using Audio Cross-Correlation
  const handleAutoSync = useCallback(async () => {
    if (!frontVideoId || !sideVideoId) {
      setSyncStatus('두 영상이 모두 필요합니다');
      return;
    }

    setIsSyncing(true);
    setSyncStatus('Cross-Correlation 분석 중...');
    setSyncConfidence(null);

    try {
      // Start sync analysis
      const initialResult = await syncApi.analyze(frontVideoId, sideVideoId, 0);

      // Poll for results
      const pollInterval = setInterval(async () => {
        try {
          const status = await syncApi.getStatus(initialResult.jobId);

          if (status.status === 'completed') {
            clearInterval(pollInterval);

            const offsetMs = status.offsetMs || 0;
            setManualOffset(offsetMs);
            onOffsetChange?.(offsetMs);
            setSyncConfidence(status.confidence || 0);
            setSyncStatus(`싱크 완료! (신뢰도: ${Math.round((status.confidence || 0) * 100)}%)`);
            setIsSyncing(false);

            // Apply offset to side video
            const sideVideo = sideVideoRef.current;
            const frontVideo = frontVideoRef.current;
            if (sideVideo && frontVideo) {
              const offsetSeconds = offsetMs / 1000;
              sideVideo.currentTime = Math.max(0, frontVideo.currentTime + offsetSeconds);
            }
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            setSyncStatus(`싱크 실패: ${status.error || '알 수 없는 오류'}`);
            setIsSyncing(false);
          } else {
            setSyncStatus('Cross-Correlation 계산 중...');
          }
        } catch (err) {
          clearInterval(pollInterval);
          setSyncStatus('싱크 상태 확인 중 오류 발생');
          setIsSyncing(false);
        }
      }, 1000);

    } catch (err) {
      setSyncStatus(`싱크 시작 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
      setIsSyncing(false);
    }
  }, [frontVideoId, sideVideoId, onOffsetChange]);

  const handlePlayPause = useCallback(async () => {
    const frontVideo = frontVideoRef.current;
    const sideVideo = sideVideoRef.current;

    if (!frontVideo && !sideVideo) return;

    if (isPlaying) {
      frontVideo?.pause();
      sideVideo?.pause();
      setIsPlaying(false);
    } else {
      // Apply sync offset before playing
      if (sideVideo && frontVideo) {
        const offsetSeconds = manualOffset / 1000;
        sideVideo.currentTime = Math.max(0, frontVideo.currentTime + offsetSeconds);
      }

      // Play with error handling
      try {
        const playPromises: Promise<void>[] = [];
        if (frontVideo) playPromises.push(frontVideo.play());
        if (sideVideo) playPromises.push(sideVideo.play());
        await Promise.all(playPromises);
        setIsPlaying(true);
      } catch (err) {
        // Ignore AbortError (happens when play is interrupted)
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Play error:', err);
        }
      }
    }
  }, [isPlaying, manualOffset]);

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

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleVideoPause = useCallback(() => {
    // Only update state if both videos are paused
    const frontVideo = frontVideoRef.current;
    const sideVideo = sideVideoRef.current;

    const frontPaused = !frontVideo || frontVideo.paused;
    const sidePaused = !sideVideo || sideVideo.paused;

    if (frontPaused && sidePaused) {
      setIsPlaying(false);
    }
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
              <VideoWithSkeleton
                ref={frontVideoRef}
                src={videoApi.getVideoUrl(frontVideoId)}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleVideoEnded}
                onPause={handleVideoPause}
                showSkeleton={showSkeleton}
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
              <VideoWithSkeleton
                ref={sideVideoRef}
                src={videoApi.getVideoUrl(sideVideoId)}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleVideoEnded}
                onPause={handleVideoPause}
                showSkeleton={showSkeleton}
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
        {/* Playback controls */}
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

          {/* Skeleton toggle */}
          <button
            onClick={() => setShowSkeleton(!showSkeleton)}
            className={`p-2 rounded-full transition-colors ${
              showSkeleton
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            title={showSkeleton ? '스켈레톤 숨기기' : '스켈레톤 표시'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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

        {/* Auto Sync Button */}
        {frontVideoId && sideVideoId && (
          <div className="flex items-center gap-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
            <button
              onClick={handleAutoSync}
              disabled={isSyncing}
              className={`
                px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2
                ${isSyncing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-700'
                }
              `}
            >
              {isSyncing ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  분석 중...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  Cross-Correlation 싱크
                </>
              )}
            </button>

            <div className="flex-1">
              {syncStatus && (
                <div className={`text-sm ${syncConfidence !== null ? 'text-green-600' : 'text-gray-600'}`}>
                  {syncStatus}
                </div>
              )}
              {!syncStatus && (
                <div className="text-sm text-gray-500">
                  오디오 Cross-Correlation으로 두 영상의 싱크를 맞춥니다
                </div>
              )}
            </div>

            {syncConfidence !== null && (
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${
                  syncConfidence > 0.7 ? 'bg-green-500' :
                  syncConfidence > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
                <span className="text-xs text-gray-500">
                  {syncConfidence > 0.7 ? '높음' : syncConfidence > 0.4 ? '중간' : '낮음'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Manual offset slider */}
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
          <span className={`text-sm min-w-[80px] text-right font-mono ${
            manualOffset !== 0 ? 'text-purple-600 font-medium' : 'text-gray-600'
          }`}>
            {manualOffset > 0 ? '+' : ''}{manualOffset}ms
          </span>
        </div>

        {/* Offset visualization */}
        {manualOffset !== 0 && (
          <div className="text-xs text-gray-500 text-center">
            {manualOffset > 0
              ? `측면 영상이 ${Math.abs(manualOffset)}ms 뒤에 재생됩니다`
              : `측면 영상이 ${Math.abs(manualOffset)}ms 앞서 재생됩니다`
            }
          </div>
        )}
      </div>
    </div>
  );
}
