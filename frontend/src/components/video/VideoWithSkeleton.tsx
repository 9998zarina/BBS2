import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { usePoseDetection, type MultiPoseResult } from '../../hooks/usePoseDetection';

interface VideoWithSkeletonProps {
  src: string;
  onTimeUpdate?: () => void;
  onLoadedMetadata?: () => void;
  onEnded?: () => void;
  onPause?: () => void;
  showSkeleton?: boolean;
  onPoseDetected?: (result: MultiPoseResult | null) => void;
}

export interface VideoWithSkeletonRef {
  play: () => Promise<void>;
  pause: () => void;
  get currentTime(): number;
  set currentTime(time: number);
  get duration(): number;
  get paused(): boolean;
}

export const VideoWithSkeleton = forwardRef<VideoWithSkeletonRef, VideoWithSkeletonProps>(({
  src,
  onTimeUpdate,
  onLoadedMetadata,
  onEnded,
  onPause,
  showSkeleton = true,
  onPoseDetected,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [poseCount, setPoseCount] = useState(0);

  const { initialize, detectMultiPose, drawMultiSkeleton, resetFilters, isReady, isLoading } = usePoseDetection();

  // Initialize MediaPipe on mount
  useEffect(() => {
    if (showSkeleton) {
      initialize();
    }
  }, [initialize, showSkeleton]);

  // Reset filters when video source changes
  useEffect(() => {
    resetFilters();
    setPoseCount(0);
  }, [src, resetFilters]);

  // Expose video methods via ref
  useImperativeHandle(ref, () => ({
    play: async () => {
      if (videoRef.current) {
        await videoRef.current.play();
      }
    },
    pause: () => {
      videoRef.current?.pause();
    },
    get currentTime() {
      return videoRef.current?.currentTime ?? 0;
    },
    set currentTime(time: number) {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    },
    get duration() {
      return videoRef.current?.duration ?? 0;
    },
    get paused() {
      return videoRef.current?.paused ?? true;
    },
  }));

  // Pose detection loop during video playback
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !showSkeleton || !isReady) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const video = videoRef.current;

    // Skip if video is paused or not ready
    if (video.paused || video.readyState < 2) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const now = performance.now();
    const result = detectMultiPose(video, now);

    if (result && result.poses.length > 0) {
      setPoseCount(result.poses.length);
      drawMultiSkeleton(canvasRef.current, result, video.videoWidth, video.videoHeight);
      onPoseDetected?.(result);
    } else {
      setPoseCount(0);
      onPoseDetected?.(null);
    }

    animationRef.current = requestAnimationFrame(processFrame);
  }, [showSkeleton, isReady, detectMultiPose, drawMultiSkeleton, onPoseDetected]);

  // Start/stop animation loop based on video state
  useEffect(() => {
    if (showSkeleton && isVideoReady) {
      animationRef.current = requestAnimationFrame(processFrame);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [showSkeleton, isVideoReady, processFrame]);

  // Clear canvas when skeleton is disabled
  useEffect(() => {
    if (!showSkeleton && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, [showSkeleton]);

  const handleLoadedMetadata = useCallback(() => {
    setIsVideoReady(true);
    onLoadedMetadata?.();
  }, [onLoadedMetadata]);

  return (
    <div className="relative w-full h-full">
      {/* Video */}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={onEnded}
        onPause={onPause}
        playsInline
      />

      {/* Skeleton overlay canvas */}
      {showSkeleton && (
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
          style={{ objectFit: 'contain' }}
        />
      )}

      {/* Loading indicator */}
      {showSkeleton && isLoading && (
        <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          AI Loading...
        </div>
      )}

      {/* Pose detection status */}
      {showSkeleton && isReady && isVideoReady && (
        <div className={`absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded text-xs ${
          poseCount > 0 ? 'bg-green-600 text-white' : 'bg-yellow-600 text-white'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${poseCount > 0 ? 'bg-green-300' : 'bg-yellow-300 animate-pulse'}`} />
          {poseCount > 0 ? `${poseCount}명 감지` : '감지 중...'}
        </div>
      )}
    </div>
  );
});

VideoWithSkeleton.displayName = 'VideoWithSkeleton';
