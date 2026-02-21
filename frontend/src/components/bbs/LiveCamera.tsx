import { useRef, useEffect, useState, useCallback } from 'react';
import { usePoseDetection, type PersonPose } from '../../hooks/usePoseDetection';
import type { YoloLandmarks } from '../../hooks/usePoseDetection';

// 환자 위치 정보 (위치 기반 추적만 사용)
interface PatientPosition {
  centerX: number;        // 중심 x 좌표 (0-1)
  centerY: number;        // 중심 y 좌표 (0-1)
}

interface LiveCameraProps {
  onFrame: (landmarks: YoloLandmarks, timestamp: number) => void;
  isActive: boolean;
  onPatientIdentified?: () => void;  // 환자 식별 시 콜백
  resetPatientTracking?: boolean;     // true로 설정하면 환자 추적 리셋
}

// 환자 위치 추출
function getPatientPosition(pose: PersonPose): PatientPosition {
  // 엉덩이 중심점으로 위치 추적 (가장 안정적)
  const landmarks = pose.landmarks;
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  if (leftHip && rightHip) {
    return {
      centerX: (leftHip.x + rightHip.x) / 2,
      centerY: (leftHip.y + rightHip.y) / 2,
    };
  }

  // 폴백: 바운딩 박스 중심
  if (pose.boundingBox) {
    return {
      centerX: (pose.boundingBox.minX + pose.boundingBox.maxX) / 2,
      centerY: (pose.boundingBox.minY + pose.boundingBox.maxY) / 2,
    };
  }

  return { centerX: 0.5, centerY: 0.5 };
}

// 환자와의 거리 계산 (위치 기반만)
function calculateDistance(pose: PersonPose, patientPos: PatientPosition): number {
  const currentPos = getPatientPosition(pose);

  // 단순 유클리드 거리
  return Math.sqrt(
    Math.pow(currentPos.centerX - patientPos.centerX, 2) +
    Math.pow(currentPos.centerY - patientPos.centerY, 2)
  );
}

export function LiveCamera({ onFrame, isActive, onPatientIdentified, resetPatientTracking }: LiveCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  const [isStreamReady, setIsStreamReady] = useState(false);
  const [poseCount, setPoseCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [patientTracked, setPatientTracked] = useState(false);

  // 환자 위치 저장 (처음 감지된 사람의 위치)
  const patientPositionRef = useRef<PatientPosition | null>(null);
  const patientIdentifiedRef = useRef(false);

  const { initialize, detectMultiPose, drawMultiSkeleton, toYoloFormat, isReady, isLoading } = usePoseDetection();

  // 환자 추적 리셋
  useEffect(() => {
    if (resetPatientTracking) {
      patientPositionRef.current = null;
      patientIdentifiedRef.current = false;
      setPatientTracked(false);
      console.log('[LiveCamera] 환자 추적 리셋됨');
    }
  }, [resetPatientTracking]);

  // Initialize MediaPipe on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Start camera
  const startCamera = useCallback(async () => {
    if (streamRef.current) return;

    try {
      setError(null);

      let stream: MediaStream;
      try {
        // 고해상도 카메라 설정 (정확도 향상)
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
            frameRate: { ideal: 30, min: 15 },
          },
          audio: false,
        });
      } catch {
        // 폴백: 기본 설정
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => resolve();
          }
        });
        videoRef.current.muted = true;
        await videoRef.current.play();
        setIsStreamReady(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Camera access failed';
      setError(message);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsStreamReady(false);
  }, []);

  // Start camera on mount
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Pose detection loop
  useEffect(() => {
    if (!isActive || !isReady || !isStreamReady || !videoRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const video = videoRef.current;
    let frameCount = 0;
    let lastFpsUpdate = performance.now();

    const processFrame = () => {
      if (!isActive) return;

      const now = performance.now();
      const result = detectMultiPose(video, now);

      if (result && result.poses.length > 0) {
        setPoseCount(result.poses.length);

        // Draw skeleton for all people
        if (canvasRef.current) {
          drawMultiSkeleton(canvasRef.current, result, video.videoWidth, video.videoHeight);
        }

        // 환자 식별 및 추적 로직 (처음 감지된 사람 = 환자)
        let patientPose: PersonPose;

        if (!patientPositionRef.current) {
          // 첫 번째 감지: 처음 감지된 사람을 환자로 등록
          patientPose = result.poses[0];
          patientPositionRef.current = getPatientPosition(patientPose);

          if (!patientIdentifiedRef.current) {
            patientIdentifiedRef.current = true;
            setPatientTracked(true);
            onPatientIdentified?.();
            console.log('[LiveCamera] 환자 등록됨 (위치):', patientPositionRef.current);
          }
        } else if (result.poses.length === 1) {
          // 한 명만 감지: 그 사람이 환자
          patientPose = result.poses[0];
          // 환자 위치 업데이트
          patientPositionRef.current = getPatientPosition(patientPose);
        } else {
          // 여러 명 감지: 저장된 환자 위치와 가장 가까운 사람 찾기
          let minDistance = Infinity;
          let bestMatch = result.poses[0];

          for (const pose of result.poses) {
            const distance = calculateDistance(pose, patientPositionRef.current);
            if (distance < minDistance) {
              minDistance = distance;
              bestMatch = pose;
            }
          }

          patientPose = bestMatch;
          // 환자 위치 업데이트 (위치 추적 유지)
          patientPositionRef.current = getPatientPosition(patientPose);

          console.log(`[LiveCamera] ${result.poses.length}명 중 환자 추적 (거리: ${minDistance.toFixed(3)})`);
        }

        const yoloLandmarks = toYoloFormat(
          { landmarks: patientPose.landmarks, worldLandmarks: patientPose.worldLandmarks, timestamp: now },
          video.videoWidth,
          video.videoHeight
        );
        onFrame(yoloLandmarks, now);
      } else {
        setPoseCount(0);
      }

      // FPS calculation
      frameCount++;
      if (now - lastFpsUpdate >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsUpdate = now;
      }

      animationRef.current = requestAnimationFrame(processFrame);
    };

    animationRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, isReady, isStreamReady, detectMultiPose, drawMultiSkeleton, toYoloFormat, onFrame]);

  // Error state
  if (error) {
    return (
      <div className="relative bg-gray-900 rounded-xl overflow-hidden" style={{ minHeight: '360px' }}>
        <div className="absolute inset-0 flex items-center justify-center text-white p-4">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm mb-2">{error}</p>
            <button
              onClick={() => { setError(null); startCamera(); }}
              className="px-4 py-2 bg-blue-600 rounded-lg text-sm hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-black rounded-xl overflow-hidden">
      {/* Loading states */}
      {(!isStreamReady || isLoading) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white z-10">
          <div className="text-center">
            <svg className="w-8 h-8 mx-auto mb-2 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm">{isLoading ? 'AI Loading...' : 'Camera connecting...'}</p>
          </div>
        </div>
      )}

      {/* Video */}
      <video
        ref={videoRef}
        className="w-full h-auto"
        playsInline
        muted
        style={{ display: 'block', minHeight: '360px', objectFit: 'cover' }}
      />

      {/* Skeleton overlay */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
      />

      {/* Recording indicator */}
      {isActive && isStreamReady && (
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          <span className="text-sm font-medium">REC</span>
        </div>
      )}

      {/* FPS & Status */}
      {isActive && isStreamReady && (
        <>
          <div className="absolute top-3 right-3 bg-black/60 text-white px-2 py-1 rounded text-xs font-mono">
            {fps} FPS
          </div>
          <div className={`absolute bottom-3 left-3 flex items-center gap-2 px-3 py-1 rounded-lg ${
            poseCount > 0 ? 'bg-green-600' : 'bg-yellow-600'
          } text-white text-sm`}>
            <span className={`w-2 h-2 rounded-full ${poseCount > 0 ? 'bg-green-300' : 'bg-yellow-300 animate-pulse'}`} />
            {poseCount > 0 ? `${poseCount}명 감지` : '감지 중...'}
          </div>
          {poseCount > 1 && patientTracked && (
            <div className="absolute bottom-3 right-3 bg-purple-600 text-white px-3 py-1 rounded-lg text-sm">
              환자 추적 중 (검사자 {poseCount - 1}명)
            </div>
          )}
          {patientTracked && poseCount === 1 && (
            <div className="absolute bottom-3 right-3 bg-blue-600 text-white px-3 py-1 rounded-lg text-sm">
              환자 분석 중
            </div>
          )}
        </>
      )}
    </div>
  );
}
