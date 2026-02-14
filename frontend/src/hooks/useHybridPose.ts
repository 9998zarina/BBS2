import { useCallback, useRef, useState } from 'react';
import { useMediaPipePose, type PoseResult, type PoseLandmark } from './useMediaPipePose';

// Backend API response type (matches realtime.py FrameAnalysisResponse)
interface YoloBackendResponse {
  has_pose: boolean;
  num_people: number;
  landmarks: Record<string, { x: number; y: number; visibility?: number }> | null;
  keypoints_2d: Array<{ name: string; x: number; y: number; visibility: number }> | null;
  error?: string;
}

// 하이브리드 결과
export interface HybridPoseResult {
  landmarks: PoseLandmark[];
  source: 'mediapipe' | 'yolo' | 'hybrid';
  mediapipeConfidence: number;
  yoloConfidence: number;
  timestamp: number;
}

// YOLO 키포인트를 MediaPipe 33 랜드마크로 변환
function yoloToMediaPipeLandmarks(yoloKeypoints: Record<string, { x: number; y: number; visibility?: number }>): PoseLandmark[] {
  // YOLO 17 keypoints -> MediaPipe 33 landmarks 매핑
  // MediaPipe indices: https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
  const landmarks: PoseLandmark[] = Array(33).fill(null).map(() => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  }));

  const mapping: Record<string, number[]> = {
    'nose': [0],
    'left_eye': [1, 2, 3],  // inner, center, outer
    'right_eye': [4, 5, 6], // inner, center, outer
    'left_ear': [7],
    'right_ear': [8],
    'left_shoulder': [11],
    'right_shoulder': [12],
    'left_elbow': [13],
    'right_elbow': [14],
    'left_wrist': [15],
    'right_wrist': [16],
    'left_hip': [23],
    'right_hip': [24],
    'left_knee': [25],
    'right_knee': [26],
    'left_ankle': [27],
    'right_ankle': [28],
  };

  for (const [yoloName, indices] of Object.entries(mapping)) {
    const keypoint = yoloKeypoints[yoloName];
    if (keypoint) {
      for (const idx of indices) {
        landmarks[idx] = {
          x: keypoint.x,
          y: keypoint.y,
          z: 0,
          visibility: keypoint.visibility ?? 1.0,
        };
      }
    }
  }

  return landmarks;
}

// 두 랜드마크 세트를 가중 평균으로 결합
function blendLandmarks(
  mpLandmarks: PoseLandmark[],
  yoloLandmarks: PoseLandmark[],
  yoloWeight: number = 0.3
): PoseLandmark[] {
  return mpLandmarks.map((mp, i) => {
    const yolo = yoloLandmarks[i];

    // YOLO visibility가 없으면 MediaPipe 사용
    if (!yolo || yolo.visibility < 0.3) {
      return mp;
    }

    // MediaPipe visibility가 낮으면 YOLO 사용
    if (mp.visibility < 0.3 && yolo.visibility > 0.5) {
      return yolo;
    }

    // 둘 다 있으면 가중 평균
    const mpWeight = 1 - yoloWeight;
    return {
      x: mp.x * mpWeight + yolo.x * yoloWeight,
      y: mp.y * mpWeight + yolo.y * yoloWeight,
      z: mp.z,
      visibility: Math.max(mp.visibility, yolo.visibility),
    };
  });
}

interface UseHybridPoseOptions {
  backendUrl?: string;
  yoloIntervalMs?: number;  // YOLO 요청 간격 (ms)
  enableYolo?: boolean;
  yoloWeight?: number;  // YOLO 결과 가중치 (0-1)
}

export function useHybridPose(options: UseHybridPoseOptions = {}) {
  const {
    backendUrl = 'http://localhost:8000/api/v1/realtime',
    yoloIntervalMs = 500,  // 0.5초마다 YOLO 요청
    enableYolo = true,
    yoloWeight = 0.3,
  } = options;

  const {
    initialize: initializeMediaPipe,
    detectPose: detectMediaPipe,
    drawSkeleton,
    isReady: isMediaPipeReady,
    isLoading: isMediaPipeLoading,
    error: mediaPipeError,
  } = useMediaPipePose();

  const [isYoloAvailable, setIsYoloAvailable] = useState(false);
  const [yoloError, setYoloError] = useState<string | null>(null);

  const lastYoloRequestRef = useRef<number>(0);
  const lastYoloResultRef = useRef<PoseLandmark[] | null>(null);
  const yoloConfidenceRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // YOLO 백엔드 연결 확인
  const checkYoloBackend = useCallback(async () => {
    try {
      // 백엔드 루트 URL에서 health 체크
      const baseUrl = backendUrl.replace('/realtime', '');
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        setIsYoloAvailable(true);
        setYoloError(null);
        console.log('[Hybrid] YOLO backend available');
        return true;
      }
    } catch (err) {
      console.warn('[Hybrid] YOLO backend not available:', err);
      setIsYoloAvailable(false);
      setYoloError('YOLO 백엔드 연결 실패 (MediaPipe만 사용)');
    }
    return false;
  }, [backendUrl]);

  // 비디오 프레임을 base64로 변환
  const frameToBase64 = useCallback((video: HTMLVideoElement): string | null => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    return canvas.toDataURL('image/jpeg', 0.7).split(',')[1];  // base64만 추출
  }, []);

  // YOLO 백엔드로 프레임 전송
  const detectYolo = useCallback(async (video: HTMLVideoElement): Promise<PoseLandmark[] | null> => {
    if (!enableYolo || !isYoloAvailable) return null;

    const now = Date.now();
    if (now - lastYoloRequestRef.current < yoloIntervalMs) {
      return lastYoloResultRef.current;  // 캐시된 결과 반환
    }

    lastYoloRequestRef.current = now;

    try {
      const base64Image = frameToBase64(video);
      if (!base64Image) return null;

      const response = await fetch(`${backendUrl}/frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_data: base64Image,  // 백엔드 API에 맞춤
          timestamp_ms: now,
        }),
        signal: AbortSignal.timeout(1000),  // 1초 타임아웃
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: YoloBackendResponse = await response.json();

      if (data.has_pose && data.landmarks) {
        // 백엔드 응답에서 landmarks 추출
        const landmarks = yoloToMediaPipeLandmarks(data.landmarks);
        lastYoloResultRef.current = landmarks;

        // 평균 visibility를 confidence로 사용
        let avgVisibility = 0.8;
        if (data.keypoints_2d && data.keypoints_2d.length > 0) {
          const sum = data.keypoints_2d.reduce(
            (acc: number, kp: { visibility: number }) => acc + kp.visibility, 0
          );
          avgVisibility = sum / data.keypoints_2d.length;
        }
        yoloConfidenceRef.current = avgVisibility;

        if (Math.random() < 0.1) {
          console.log(`[Hybrid] YOLO detected: conf=${yoloConfidenceRef.current.toFixed(2)}`);
        }

        return landmarks;
      }
    } catch (err) {
      // YOLO 실패 시 조용히 무시 (MediaPipe가 메인)
      if (Math.random() < 0.05) {
        console.warn('[Hybrid] YOLO request failed:', err);
      }
    }

    return lastYoloResultRef.current;
  }, [enableYolo, isYoloAvailable, backendUrl, yoloIntervalMs, frameToBase64]);

  // 하이브리드 포즈 감지
  const detectPose = useCallback(async (
    video: HTMLVideoElement,
    timestamp?: number
  ): Promise<HybridPoseResult | null> => {
    // MediaPipe 먼저 실행 (항상)
    const mpResult = detectMediaPipe(video, timestamp);

    if (!mpResult) {
      return null;
    }

    // YOLO 결과 가져오기 (비동기, 캐시 사용)
    const yoloLandmarks = await detectYolo(video);

    let finalLandmarks = mpResult.landmarks;
    let source: 'mediapipe' | 'yolo' | 'hybrid' = 'mediapipe';

    if (yoloLandmarks && yoloConfidenceRef.current > 0.5) {
      // YOLO 결과가 있으면 하이브리드로 결합
      finalLandmarks = blendLandmarks(mpResult.landmarks, yoloLandmarks, yoloWeight);
      source = 'hybrid';
    }

    // MediaPipe 평균 confidence 계산
    const mpConfidence = mpResult.landmarks.reduce((sum, lm) => sum + lm.visibility, 0) / mpResult.landmarks.length;

    return {
      landmarks: finalLandmarks,
      source,
      mediapipeConfidence: mpConfidence,
      yoloConfidence: yoloConfidenceRef.current,
      timestamp: mpResult.timestamp,
    };
  }, [detectMediaPipe, detectYolo, yoloWeight]);

  // 초기화
  const initialize = useCallback(async () => {
    await initializeMediaPipe();

    if (enableYolo) {
      await checkYoloBackend();
    }
  }, [initializeMediaPipe, enableYolo, checkYoloBackend]);

  // PoseResult로 변환 (기존 훅과 호환성)
  const toPoseResult = useCallback((hybrid: HybridPoseResult): PoseResult => {
    return {
      landmarks: hybrid.landmarks,
      worldLandmarks: [],
      timestamp: hybrid.timestamp,
    };
  }, []);

  return {
    initialize,
    detectPose,
    drawSkeleton,
    toPoseResult,
    isReady: isMediaPipeReady,
    isLoading: isMediaPipeLoading,
    isYoloAvailable,
    error: mediaPipeError || yoloError,
    checkYoloBackend,
  };
}
