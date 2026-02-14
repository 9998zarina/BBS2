import { useRef, useEffect, useState, useCallback } from 'react';

interface CameraCaptureProps {
  onFrame?: (imageData: string, timestamp: number) => void;
  onVideoRef?: (video: HTMLVideoElement | null) => void;
  onError?: (error: string) => void;
  isCapturing: boolean;
  frameRate?: number;
  facingMode?: 'user' | 'environment';
  width?: number;
  height?: number;
}

export function CameraCapture({
  onFrame,
  onVideoRef,
  onError,
  isCapturing,
  frameRate = 10,
  facingMode = 'user', // 기본값을 전면 카메라로 변경
  width = 640,
  height = 480,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // 카메라 스트림 시작
  const startCamera = useCallback(async () => {
    // 이미 스트림이 있으면 중복 실행 방지
    if (streamRef.current) {
      return;
    }

    try {
      setCameraError(null);
      console.log('카메라 시작 시도...');

      // 먼저 기본 설정으로 시도
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: width },
            height: { ideal: height },
          },
          audio: false,
        });
      } catch {
        // facingMode가 실패하면 기본 비디오로 재시도
        console.log('facingMode 실패, 기본 설정으로 재시도...');
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      console.log('카메라 스트림 획득 성공');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // onloadedmetadata 이벤트 대기
        await new Promise<void>((resolve, reject) => {
          if (!videoRef.current) {
            reject(new Error('Video element not found'));
            return;
          }

          videoRef.current.onloadedmetadata = () => {
            console.log('비디오 메타데이터 로드됨');
            resolve();
          };

          videoRef.current.onerror = () => {
            reject(new Error('Video load error'));
          };

          // 타임아웃 설정
          setTimeout(() => resolve(), 3000);
        });

        try {
          await videoRef.current.play();
          console.log('비디오 재생 시작');
          setIsStreamReady(true);
          setIsInitialized(true);
          // Notify parent about video element
          onVideoRef?.(videoRef.current);
        } catch (playError) {
          console.error('비디오 재생 실패:', playError);
          // 자동 재생 정책으로 인한 실패 시 muted로 재시도
          if (videoRef.current) {
            videoRef.current.muted = true;
            await videoRef.current.play();
            setIsStreamReady(true);
            setIsInitialized(true);
            // Notify parent about video element
            onVideoRef?.(videoRef.current);
          }
        }
      }
    } catch (err) {
      console.error('카메라 에러:', err);
      const errorMessage = err instanceof Error ? err.message : '카메라 접근 실패';
      setCameraError(errorMessage);
      onError?.(errorMessage);
    }
  }, [facingMode, width, height, onError, onVideoRef]);

  // 카메라 스트림 중지
  const stopCamera = useCallback(() => {
    console.log('카메라 중지');

    // Notify parent that video is no longer available
    onVideoRef?.(null);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log('트랙 중지:', track.kind);
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsStreamReady(false);
  }, [onVideoRef]);

  // 프레임 캡처
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isStreamReady) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // 비디오가 실제로 재생 중인지 확인
    if (video.readyState < 2) return;

    canvas.width = video.videoWidth || width;
    canvas.height = video.videoHeight || height;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    const timestamp = Date.now();

    onFrame?.(imageData, timestamp);
  }, [isStreamReady, width, height, onFrame]);

  // 캡처 시작/중지
  useEffect(() => {
    if (isCapturing && isStreamReady) {
      const interval = 1000 / frameRate;
      intervalRef.current = window.setInterval(captureFrame, interval);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isCapturing, isStreamReady, frameRate, captureFrame]);

  // 컴포넌트 마운트 시 카메라 시작 (한 번만 실행)
  useEffect(() => {
    if (!isInitialized) {
      startCamera();
    }

    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 수동 재시도
  const handleRetry = () => {
    stopCamera();
    setIsInitialized(false);
    setTimeout(() => {
      startCamera();
    }, 100);
  };

  return (
    <div className="relative bg-black" style={{ minHeight: '300px' }}>
      {cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white p-4 rounded-lg z-10">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm mb-2">{cameraError}</p>
            <p className="text-xs text-gray-400 mb-3">
              브라우저에서 카메라 권한을 허용해주세요.
            </p>
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-blue-600 rounded-lg text-sm hover:bg-blue-700"
            >
              다시 시도
            </button>
          </div>
        </div>
      )}

      {!isStreamReady && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white z-10">
          <div className="text-center">
            <svg className="w-8 h-8 mx-auto mb-2 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm">카메라 연결 중...</p>
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        className="w-full h-auto rounded-lg"
        playsInline
        muted
        autoPlay
        style={{
          display: 'block',
          minHeight: '300px',
          objectFit: 'cover'
        }}
      />

      <canvas ref={canvasRef} className="hidden" />

      {isCapturing && isStreamReady && (
        <div className="absolute top-3 left-3 flex items-center gap-2 z-20">
          <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <span className="text-white text-sm font-medium bg-black/50 px-2 py-1 rounded">
            실시간 분석 중
          </span>
        </div>
      )}

      {isStreamReady && (
        <div className="absolute bottom-3 right-3 z-20">
          <span className="text-white text-xs bg-green-600/80 px-2 py-1 rounded">
            카메라 연결됨
          </span>
        </div>
      )}
    </div>
  );
}
