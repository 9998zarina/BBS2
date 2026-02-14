import { useRef, useCallback, useState, useEffect } from 'react';
import {
  PoseLandmarker,
  FilesetResolver,
} from '@mediapipe/tasks-vision';

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseResult {
  landmarks: PoseLandmark[];
  worldLandmarks: PoseLandmark[];
  timestamp: number;
}

// MediaPipe Pose 33 keypoint names
export const POSE_LANDMARK_NAMES = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
  'left_index', 'right_index', 'left_thumb', 'right_thumb',
  'left_hip', 'right_hip', 'left_knee', 'right_knee',
  'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index'
];

// Skeleton connections for drawing
export const POSE_CONNECTIONS = [
  // Face
  [0, 1], [1, 2], [2, 3], [3, 7], // left eye
  [0, 4], [4, 5], [5, 6], [6, 8], // right eye
  // Body
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso
  [23, 24], // hips
  [23, 25], [25, 27], [27, 29], [29, 31], // left leg
  [24, 26], [26, 28], [28, 30], [30, 32], // right leg
];

interface UseMediaPipePoseOptions {
  onPoseDetected?: (result: PoseResult) => void;
  modelComplexity?: 0 | 1 | 2;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

export function useMediaPipePose(options: UseMediaPipePoseOptions = {}) {
  const {
    onPoseDetected,
    minDetectionConfidence = 0.5,
    minTrackingConfidence = 0.5,
  } = options;

  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastVideoTimeRef = useRef(-1);

  // Initialize MediaPipe
  const initialize = useCallback(async () => {
    if (poseLandmarkerRef.current || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log('[MediaPipe] Initializing...');

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: minDetectionConfidence,
        minTrackingConfidence: minTrackingConfidence,
      });

      setIsReady(true);
      console.log('[MediaPipe] Ready!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MediaPipe initialization failed';
      console.error('[MediaPipe] Error:', message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, minDetectionConfidence, minTrackingConfidence]);

  // Process video frame
  const detectPose = useCallback((
    video: HTMLVideoElement,
    timestamp?: number
  ): PoseResult | null => {
    if (!poseLandmarkerRef.current || !isReady) return null;

    // 비디오가 재생 중인지 확인
    if (video.readyState < 2 || video.paused || video.videoWidth === 0) {
      return null;
    }

    // 실시간 스트림에서는 currentTime이 아닌 timestamp로 중복 프레임 체크
    const currentTimestamp = timestamp ?? performance.now();

    // 최소 30ms (약 33fps) 간격으로 처리
    if (currentTimestamp - lastVideoTimeRef.current < 30) {
      return null;
    }

    lastVideoTimeRef.current = currentTimestamp;
    const startTime = currentTimestamp;

    try {
      const results = poseLandmarkerRef.current.detectForVideo(video, startTime);

      if (results.landmarks && results.landmarks.length > 0) {
        const poseResult: PoseResult = {
          landmarks: results.landmarks[0].map(lm => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: lm.visibility ?? 1.0,
          })),
          worldLandmarks: results.worldLandmarks?.[0]?.map(lm => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: lm.visibility ?? 1.0,
          })) || [],
          timestamp: startTime,
        };

        onPoseDetected?.(poseResult);
        return poseResult;
      } else {
        // 5% 확률로 로그 출력 (스팸 방지)
        if (Math.random() < 0.05) {
          console.log('[MediaPipe] No pose detected in frame');
        }
      }
    } catch (err) {
      console.error('[MediaPipe] Detection error:', err);
    }

    return null;
  }, [isReady, onPoseDetected]);

  // Draw skeleton on canvas
  const drawSkeleton = useCallback((
    canvas: HTMLCanvasElement,
    result: PoseResult,
    videoWidth: number,
    videoHeight: number
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 캔버스 크기 설정
    if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
      canvas.width = videoWidth;
      canvas.height = videoHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const landmarks = result.landmarks;
    const visibilityThreshold = 0.2;  // 더 낮은 임계값

    // 그림자 효과 (글로우)
    ctx.shadowColor = '#00FF00';
    ctx.shadowBlur = 10;

    // Draw connections (두꺼운 선)
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];

      if (start && end &&
          start.visibility > visibilityThreshold &&
          end.visibility > visibilityThreshold) {
        ctx.beginPath();
        ctx.moveTo(start.x * videoWidth, start.y * videoHeight);
        ctx.lineTo(end.x * videoWidth, end.y * videoHeight);
        ctx.stroke();
      }
    }

    // 그림자 리셋
    ctx.shadowBlur = 0;

    // Draw keypoints (더 큰 점)
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (lm.visibility > visibilityThreshold) {
        const x = lm.x * videoWidth;
        const y = lm.y * videoHeight;

        // 주요 관절은 더 크게 (어깨, 골반, 무릎, 발목)
        const isMainJoint = [11, 12, 23, 24, 25, 26, 27, 28].includes(i);
        const radius = isMainJoint ? 10 : 6;

        // 외곽선
        ctx.beginPath();
        ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        // 내부
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = isMainJoint ? '#FF3366' : '#FF6B6B';
        ctx.fill();
      }
    }
  }, []);

  // Convert to YOLO-compatible format (17 keypoints)
  const toYoloFormat = useCallback((result: PoseResult): Record<string, {x: number; y: number; z: number; visibility: number}> => {
    const landmarks = result.landmarks;

    // MediaPipe to YOLO mapping
    const mapping: Record<string, number> = {
      'nose': 0,
      'left_eye': 2,
      'right_eye': 5,
      'left_ear': 7,
      'right_ear': 8,
      'left_shoulder': 11,
      'right_shoulder': 12,
      'left_elbow': 13,
      'right_elbow': 14,
      'left_wrist': 15,
      'right_wrist': 16,
      'left_hip': 23,
      'right_hip': 24,
      'left_knee': 25,
      'right_knee': 26,
      'left_ankle': 27,
      'right_ankle': 28,
      'left_heel': 29,
      'right_heel': 30,
      'left_foot_index': 31,
      'right_foot_index': 32,
    };

    const result_dict: Record<string, {x: number; y: number; z: number; visibility: number}> = {};

    for (const [name, idx] of Object.entries(mapping)) {
      if (landmarks[idx]) {
        result_dict[name] = {
          x: landmarks[idx].x,
          y: landmarks[idx].y,
          z: landmarks[idx].z,
          visibility: landmarks[idx].visibility,
        };
      }
    }

    return result_dict;
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (poseLandmarkerRef.current) {
        poseLandmarkerRef.current.close();
        poseLandmarkerRef.current = null;
      }
    };
  }, []);

  return {
    initialize,
    detectPose,
    drawSkeleton,
    toYoloFormat,
    isReady,
    isLoading,
    error,
  };
}
