import { useRef, useCallback, useState, useEffect } from 'react';
import {
  PoseLandmarker,
  FilesetResolver,
} from '@mediapipe/tasks-vision';

// Pose landmark interface
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

// 다중 인물 감지 결과
export interface MultiPoseResult {
  poses: PersonPose[];
  timestamp: number;
}

export interface PersonPose {
  landmarks: PoseLandmark[];
  worldLandmarks: PoseLandmark[];
  boundingBox: BoundingBox;
  size: number; // 바운딩 박스 면적 (비율)
}

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

// 전체 33개 MediaPipe 랜드마크에 대한 스켈레톤 연결 (더 세밀한 표현)
const POSE_CONNECTIONS = [
  // 얼굴
  [0, 1], [1, 2], [2, 3], [3, 7],   // 왼쪽 눈
  [0, 4], [4, 5], [5, 6], [6, 8],   // 오른쪽 눈
  [9, 10],                           // 입
  // 몸통
  [11, 12],                          // 어깨
  [11, 23], [12, 24],                // 어깨-엉덩이
  [23, 24],                          // 엉덩이
  // 왼팔
  [11, 13], [13, 15],                // 어깨-팔꿈치-손목
  [15, 17], [15, 19], [15, 21],      // 손목-손가락
  [17, 19],                          // 손 연결
  // 오른팔
  [12, 14], [14, 16],                // 어깨-팔꿈치-손목
  [16, 18], [16, 20], [16, 22],      // 손목-손가락
  [18, 20],                          // 손 연결
  // 왼쪽 다리
  [23, 25], [25, 27],                // 엉덩이-무릎-발목
  [27, 29], [27, 31], [29, 31],      // 발
  // 오른쪽 다리
  [24, 26], [26, 28],                // 엉덩이-무릎-발목
  [28, 30], [28, 32], [30, 32],      // 발
];

// MediaPipe to YOLO keypoint mapping
const MEDIAPIPE_TO_YOLO: Record<string, number> = {
  'nose': 0,
  'left_eye_inner': 1,
  'left_eye': 2,
  'left_eye_outer': 3,
  'right_eye_inner': 4,
  'right_eye': 5,
  'right_eye_outer': 6,
  'left_ear': 7,
  'right_ear': 8,
  'mouth_left': 9,
  'mouth_right': 10,
  'left_shoulder': 11,
  'right_shoulder': 12,
  'left_elbow': 13,
  'right_elbow': 14,
  'left_wrist': 15,
  'right_wrist': 16,
  'left_pinky': 17,
  'right_pinky': 18,
  'left_index': 19,
  'right_index': 20,
  'left_thumb': 21,
  'right_thumb': 22,
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

export type YoloLandmarks = Record<string, { x: number; y: number; z: number; visibility: number }>;

// ========== One Euro Filter (고급 스무딩) ==========
class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  filter(x: number, alpha: number): number {
    if (this.y === null) {
      this.y = x;
      this.s = x;
    } else {
      this.y = alpha * x + (1 - alpha) * (this.s as number);
      this.s = this.y;
    }
    return this.y;
  }

  reset() {
    this.y = null;
    this.s = null;
  }
}

class OneEuroFilter {
  private freq: number;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter: LowPassFilter;
  private dxFilter: LowPassFilter;
  private lastTime: number | null = null;

  constructor(freq: number = 30, minCutoff: number = 1.0, beta: number = 0.007, dCutoff: number = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
  }

  private alpha(cutoff: number): number {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  filter(x: number, timestamp?: number): number {
    if (this.lastTime !== null && timestamp !== undefined) {
      this.freq = 1.0 / ((timestamp - this.lastTime) / 1000);
    }
    this.lastTime = timestamp ?? Date.now();

    const prevX = this.xFilter.filter(x, this.alpha(this.minCutoff));
    const dx = (x - prevX) * this.freq;
    const edx = this.dxFilter.filter(dx, this.alpha(this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    return this.xFilter.filter(x, this.alpha(cutoff));
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

// 각 랜드마크의 x, y, z에 대한 필터
interface LandmarkFilters {
  x: OneEuroFilter;
  y: OneEuroFilter;
  z: OneEuroFilter;
}

// ========== 해부학적 검증 (다른 사람 손 오인식 방지) ==========

// 두 랜드마크 사이의 거리 계산
function landmarkDistance(a: PoseLandmark, b: PoseLandmark): number {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)
  );
}

// 팔 길이 최대 비율 (몸통 길이 대비)
// 실제 인체 비율: 팔 길이 ≈ 몸통 길이의 1.0~1.2배
const MAX_ARM_TO_TORSO_RATIO = 1.5;

// 점이 확장된 바운딩 박스 내에 있는지 확인
function isWithinExtendedBoundingBox(
  point: { x: number; y: number },
  landmarks: PoseLandmark[],
  extensionRatio: number = 0.3
): boolean {
  // 주요 몸통 랜드마크로 바운딩 박스 계산
  const bodyIndices = [11, 12, 23, 24]; // 어깨, 엉덩이
  const validLandmarks = bodyIndices
    .map(i => landmarks[i])
    .filter(lm => lm && lm.visibility > 0.3);

  if (validLandmarks.length < 3) return true; // 기준점 부족하면 검증 불가

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const lm of validLandmarks) {
    minX = Math.min(minX, lm.x);
    minY = Math.min(minY, lm.y);
    maxX = Math.max(maxX, lm.x);
    maxY = Math.max(maxY, lm.y);
  }

  // 바운딩 박스 확장 (팔 범위 고려)
  const width = maxX - minX;
  const height = maxY - minY;
  minX -= width * extensionRatio;
  maxX += width * extensionRatio;
  minY -= height * extensionRatio * 0.5; // 위쪽은 덜 확장
  maxY += height * extensionRatio * 0.5;

  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

// 손이 해부학적으로 올바른 위치인지 검증
function validateArmLandmarks(
  landmarks: PoseLandmark[],
  previousLandmarks: PoseLandmark[] | null
): PoseLandmark[] {
  const validatedLandmarks = [...landmarks];

  // 필요한 랜드마크 인덱스
  const LEFT_SHOULDER = 11;
  const RIGHT_SHOULDER = 12;
  const LEFT_ELBOW = 13;
  const RIGHT_ELBOW = 14;
  const LEFT_WRIST = 15;
  const RIGHT_WRIST = 16;
  const LEFT_HIP = 23;
  const RIGHT_HIP = 24;

  // 손 관련 랜드마크 (손목 외에 손가락 등)
  const LEFT_HAND_LANDMARKS = [15, 17, 19, 21]; // 왼쪽 손목, 새끼, 검지, 엄지
  const RIGHT_HAND_LANDMARKS = [16, 18, 20, 22]; // 오른쪽 손목, 새끼, 검지, 엄지

  const leftShoulder = landmarks[LEFT_SHOULDER];
  const rightShoulder = landmarks[RIGHT_SHOULDER];
  const leftHip = landmarks[LEFT_HIP];
  const rightHip = landmarks[RIGHT_HIP];

  // 몸통 길이 계산 (어깨 중심 ~ 엉덩이 중심)
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip ||
      leftShoulder.visibility < 0.3 || rightShoulder.visibility < 0.3 ||
      leftHip.visibility < 0.3 || rightHip.visibility < 0.3) {
    return validatedLandmarks; // 기준점 없으면 검증 불가
  }

  const shoulderCenter = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
  };
  const hipCenter = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
  };

  const torsoLength = Math.sqrt(
    Math.pow(shoulderCenter.x - hipCenter.x, 2) +
    Math.pow(shoulderCenter.y - hipCenter.y, 2)
  );

  const maxArmLength = torsoLength * MAX_ARM_TO_TORSO_RATIO;

  // 왼쪽 팔 검증
  const leftWrist = landmarks[LEFT_WRIST];
  const leftElbow = landmarks[LEFT_ELBOW];

  if (leftWrist && leftWrist.visibility > 0.3) {
    const distFromShoulder = landmarkDistance(leftShoulder, leftWrist);
    const isInBounds = isWithinExtendedBoundingBox(leftWrist, landmarks, 0.5);

    // 거리 초과 또는 바운딩 박스 밖이면 잘못된 인식
    if (distFromShoulder > maxArmLength || !isInBounds) {
      // 손목이 너무 멀리 있음 - 다른 사람 손일 가능성
      const reason = !isInBounds ? '바운딩박스 밖' : '거리 초과';
      console.log(`[해부학] 왼손 필터링 (${reason}): dist=${distFromShoulder.toFixed(3)}, max=${maxArmLength.toFixed(3)}, inBounds=${isInBounds}`);

      // 이전 유효 값 사용 또는 visibility 낮추기
      if (previousLandmarks?.[LEFT_WRIST] && previousLandmarks[LEFT_WRIST].visibility > 0.3) {
        for (const idx of LEFT_HAND_LANDMARKS) {
          if (previousLandmarks[idx]) {
            validatedLandmarks[idx] = {
              ...validatedLandmarks[idx],
              x: previousLandmarks[idx].x,
              y: previousLandmarks[idx].y,
              z: previousLandmarks[idx].z,
              visibility: previousLandmarks[idx].visibility * 0.8,
            };
          }
        }
      } else {
        // 이전 값 없으면 팔꿈치 기준으로 보간
        if (leftElbow && leftElbow.visibility > 0.3) {
          const armDir = {
            x: leftElbow.x - leftShoulder.x,
            y: leftElbow.y - leftShoulder.y,
          };
          const armDirLength = Math.sqrt(armDir.x * armDir.x + armDir.y * armDir.y);
          if (armDirLength > 0) {
            // 팔꿈치 방향으로 적절한 거리에 손목 위치 추정
            const estimatedWrist = {
              x: leftElbow.x + armDir.x * 0.8,
              y: leftElbow.y + armDir.y * 0.8,
            };
            for (const idx of LEFT_HAND_LANDMARKS) {
              validatedLandmarks[idx] = {
                ...validatedLandmarks[idx],
                x: estimatedWrist.x,
                y: estimatedWrist.y,
                visibility: 0.3, // 낮은 신뢰도
              };
            }
          }
        } else {
          // 팔꿈치도 없으면 visibility만 낮춤
          for (const idx of LEFT_HAND_LANDMARKS) {
            validatedLandmarks[idx] = {
              ...validatedLandmarks[idx],
              visibility: 0.1,
            };
          }
        }
      }
    }
  }

  // 오른쪽 팔 검증
  const rightWrist = landmarks[RIGHT_WRIST];
  const rightElbow = landmarks[RIGHT_ELBOW];

  if (rightWrist && rightWrist.visibility > 0.3) {
    const distFromShoulder = landmarkDistance(rightShoulder, rightWrist);
    const isInBounds = isWithinExtendedBoundingBox(rightWrist, landmarks, 0.5);

    // 거리 초과 또는 바운딩 박스 밖이면 잘못된 인식
    if (distFromShoulder > maxArmLength || !isInBounds) {
      const reason = !isInBounds ? '바운딩박스 밖' : '거리 초과';
      console.log(`[해부학] 오른손 필터링 (${reason}): dist=${distFromShoulder.toFixed(3)}, max=${maxArmLength.toFixed(3)}, inBounds=${isInBounds}`);

      if (previousLandmarks?.[RIGHT_WRIST] && previousLandmarks[RIGHT_WRIST].visibility > 0.3) {
        for (const idx of RIGHT_HAND_LANDMARKS) {
          if (previousLandmarks[idx]) {
            validatedLandmarks[idx] = {
              ...validatedLandmarks[idx],
              x: previousLandmarks[idx].x,
              y: previousLandmarks[idx].y,
              z: previousLandmarks[idx].z,
              visibility: previousLandmarks[idx].visibility * 0.8,
            };
          }
        }
      } else {
        if (rightElbow && rightElbow.visibility > 0.3) {
          const armDir = {
            x: rightElbow.x - rightShoulder.x,
            y: rightElbow.y - rightShoulder.y,
          };
          const armDirLength = Math.sqrt(armDir.x * armDir.x + armDir.y * armDir.y);
          if (armDirLength > 0) {
            const estimatedWrist = {
              x: rightElbow.x + armDir.x * 0.8,
              y: rightElbow.y + armDir.y * 0.8,
            };
            for (const idx of RIGHT_HAND_LANDMARKS) {
              validatedLandmarks[idx] = {
                ...validatedLandmarks[idx],
                x: estimatedWrist.x,
                y: estimatedWrist.y,
                visibility: 0.3,
              };
            }
          }
        } else {
          for (const idx of RIGHT_HAND_LANDMARKS) {
            validatedLandmarks[idx] = {
              ...validatedLandmarks[idx],
              visibility: 0.1,
            };
          }
        }
      }
    }
  }

  return validatedLandmarks;
}

export function usePoseDetection() {
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastTimestampRef = useRef(-1);

  // 각 랜드마크에 대한 One Euro Filter (다중 인물 지원: [personIdx][landmarkIdx])
  const filtersRef = useRef<LandmarkFilters[][]>([[], []]);

  // 이전 유효한 랜드마크 저장 (누락 시 보간용) - 다중 인물
  const previousLandmarksRef = useRef<(PoseLandmark[] | null)[]>([null, null]);

  // 필터 초기화 (특정 인물 인덱스용)
  const initFiltersForPerson = useCallback((personIdx: number, numLandmarks: number) => {
    if (!filtersRef.current[personIdx] || filtersRef.current[personIdx].length !== numLandmarks) {
      filtersRef.current[personIdx] = Array.from({ length: numLandmarks }, () => ({
        x: new OneEuroFilter(30, 1.0, 0.007, 1.0),
        y: new OneEuroFilter(30, 1.0, 0.007, 1.0),
        z: new OneEuroFilter(30, 1.5, 0.01, 1.0),
      }));
    }
  }, []);

  // 단일 인물용 필터 초기화 (기존 호환성)
  const initFilters = useCallback((numLandmarks: number) => {
    initFiltersForPerson(0, numLandmarks);
  }, [initFiltersForPerson]);

  // 바운딩 박스 계산
  const calculateBoundingBox = useCallback((landmarks: PoseLandmark[]): BoundingBox => {
    const validLandmarks = landmarks.filter(lm => lm.visibility > 0.3);
    if (validLandmarks.length === 0) {
      return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const lm of validLandmarks) {
      minX = Math.min(minX, lm.x);
      minY = Math.min(minY, lm.y);
      maxX = Math.max(maxX, lm.x);
      maxY = Math.max(maxY, lm.y);
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }, []);

  // Initialize MediaPipe with FULL model
  const initialize = useCallback(async () => {
    if (poseLandmarkerRef.current || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log('[MediaPipe] Initializing with FULL model (balanced speed/accuracy)...');

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          // FULL 모델 사용 (속도와 정확도 균형)
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 2, // 최대 2명 감지
        // 신뢰도 낮춤 - 머리가 잘려도 감지 가능하도록
        minPoseDetectionConfidence: 0.3,
        minTrackingConfidence: 0.3,
        minPosePresenceConfidence: 0.3,
      });

      setIsReady(true);
      console.log('[MediaPipe] Ready with FULL Pose Estimation model!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MediaPipe initialization failed';
      console.error('[MediaPipe] Error:', message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  // Process video frame with smoothing
  const detectPose = useCallback((
    video: HTMLVideoElement,
    timestamp?: number
  ): PoseResult | null => {
    if (!poseLandmarkerRef.current || !isReady) return null;

    if (video.readyState < 2 || video.paused || video.videoWidth === 0) {
      return null;
    }

    const currentTimestamp = timestamp ?? performance.now();

    // 최소 25ms 간격 (40fps)
    if (currentTimestamp - lastTimestampRef.current < 25) {
      return null;
    }

    lastTimestampRef.current = currentTimestamp;

    try {
      const results = poseLandmarkerRef.current.detectForVideo(video, currentTimestamp);

      if (results.landmarks && results.landmarks.length > 0) {
        const rawLandmarks = results.landmarks[0];

        // 필터 초기화
        initFilters(rawLandmarks.length);

        // One Euro Filter 적용하여 스무딩
        const smoothedLandmarks: PoseLandmark[] = rawLandmarks.map((lm, i) => {
          const filters = filtersRef.current[0]?.[i];
          const prevLm = previousLandmarksRef.current[0]?.[i];

          // visibility가 낮으면 이전 값 사용
          if (!filters) {
            return {
              x: lm.x,
              y: lm.y,
              z: lm.z,
              visibility: lm.visibility ?? 1.0,
            };
          }

          if (lm.visibility !== undefined && lm.visibility < 0.3 && prevLm) {
            return {
              x: filters.x.filter(prevLm.x, currentTimestamp),
              y: filters.y.filter(prevLm.y, currentTimestamp),
              z: filters.z.filter(prevLm.z, currentTimestamp),
              visibility: prevLm.visibility * 0.9, // 점점 감소
            };
          }

          return {
            x: filters.x.filter(lm.x, currentTimestamp),
            y: filters.y.filter(lm.y, currentTimestamp),
            z: filters.z.filter(lm.z, currentTimestamp),
            visibility: lm.visibility ?? 1.0,
          };
        });

        // 이전 랜드마크 저장
        previousLandmarksRef.current[0] = smoothedLandmarks;

        // World landmarks도 스무딩
        const worldLandmarks = results.worldLandmarks?.[0]?.map((lm, i) => ({
          x: lm.x,
          y: lm.y,
          z: lm.z,
          visibility: smoothedLandmarks[i]?.visibility ?? (lm.visibility ?? 1.0),
        })) || [];

        return {
          landmarks: smoothedLandmarks,
          worldLandmarks,
          timestamp: currentTimestamp,
        };
      }
    } catch (err) {
      console.error('[MediaPipe] Detection error:', err);
    }

    return null;
  }, [isReady, initFilters]);

  // 다중 인물 감지
  const detectMultiPose = useCallback((
    video: HTMLVideoElement,
    timestamp?: number
  ): MultiPoseResult | null => {
    if (!poseLandmarkerRef.current || !isReady) return null;

    if (video.readyState < 2 || video.paused || video.videoWidth === 0) {
      return null;
    }

    const currentTimestamp = timestamp ?? performance.now();

    // 최소 25ms 간격 (40fps)
    if (currentTimestamp - lastTimestampRef.current < 25) {
      return null;
    }

    lastTimestampRef.current = currentTimestamp;

    try {
      const results = poseLandmarkerRef.current.detectForVideo(video, currentTimestamp);

      if (results.landmarks && results.landmarks.length > 0) {
        const poses: PersonPose[] = [];

        for (let pIdx = 0; pIdx < results.landmarks.length; pIdx++) {
          const rawLandmarks = results.landmarks[pIdx];

          // 필터 초기화
          initFiltersForPerson(pIdx, rawLandmarks.length);

          // One Euro Filter 적용하여 스무딩
          const smoothedLandmarks: PoseLandmark[] = rawLandmarks.map((lm, i) => {
            const filters = filtersRef.current[pIdx]?.[i];
            const prevLm = previousLandmarksRef.current[pIdx]?.[i];

            if (!filters) {
              return {
                x: lm.x,
                y: lm.y,
                z: lm.z,
                visibility: lm.visibility ?? 1.0,
              };
            }

            if (lm.visibility !== undefined && lm.visibility < 0.3 && prevLm) {
              return {
                x: filters.x.filter(prevLm.x, currentTimestamp),
                y: filters.y.filter(prevLm.y, currentTimestamp),
                z: filters.z.filter(prevLm.z, currentTimestamp),
                visibility: prevLm.visibility * 0.9,
              };
            }

            return {
              x: filters.x.filter(lm.x, currentTimestamp),
              y: filters.y.filter(lm.y, currentTimestamp),
              z: filters.z.filter(lm.z, currentTimestamp),
              visibility: lm.visibility ?? 1.0,
            };
          });

          // 해부학적 검증 적용 (다른 사람 손 오인식 방지)
          const validatedLandmarks = validateArmLandmarks(
            smoothedLandmarks,
            previousLandmarksRef.current[pIdx]
          );

          // 이전 랜드마크 저장 (검증된 랜드마크)
          previousLandmarksRef.current[pIdx] = validatedLandmarks;

          // World landmarks
          const worldLandmarks = results.worldLandmarks?.[pIdx]?.map((lm, i) => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: validatedLandmarks[i]?.visibility ?? (lm.visibility ?? 1.0),
          })) || [];

          // 바운딩 박스 계산
          const boundingBox = calculateBoundingBox(validatedLandmarks);
          const size = boundingBox.width * boundingBox.height;

          poses.push({
            landmarks: validatedLandmarks,
            worldLandmarks,
            boundingBox,
            size,
          });
        }

        // 감지된 순서 유지 (첫 번째 = 환자)
        return {
          poses,
          timestamp: currentTimestamp,
        };
      }
    } catch (err) {
      console.error('[MediaPipe] Multi-detection error:', err);
    }

    return null;
  }, [isReady, initFiltersForPerson, calculateBoundingBox]);

  // Draw skeleton with improved visuals
  const drawSkeleton = useCallback((
    canvas: HTMLCanvasElement,
    result: PoseResult,
    videoWidth: number,
    videoHeight: number
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
      canvas.width = videoWidth;
      canvas.height = videoHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const landmarks = result.landmarks;
    const visibilityThreshold = 0.4; // 더 높은 임계값

    // 안티앨리어싱
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 그림자 효과 (깊이감)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // 연결선 그리기 (부위별 색상)
    const getConnectionColor = (startIdx: number, endIdx: number): string => {
      // 얼굴: 하늘색
      if (startIdx <= 10 && endIdx <= 10) return '#00D4FF';
      // 왼팔: 초록
      if ([11, 13, 15, 17, 19, 21].includes(startIdx) || [11, 13, 15, 17, 19, 21].includes(endIdx)) {
        if (startIdx !== 11 && startIdx !== 12) return '#00FF88';
      }
      // 오른팔: 노랑
      if ([12, 14, 16, 18, 20, 22].includes(startIdx) || [12, 14, 16, 18, 20, 22].includes(endIdx)) {
        if (startIdx !== 11 && startIdx !== 12) return '#FFDD00';
      }
      // 왼쪽 다리: 파랑
      if ([23, 25, 27, 29, 31].includes(startIdx) && [23, 25, 27, 29, 31].includes(endIdx)) return '#3B82F6';
      // 오른쪽 다리: 보라
      if ([24, 26, 28, 30, 32].includes(startIdx) && [24, 26, 28, 30, 32].includes(endIdx)) return '#A855F7';
      // 몸통: 흰색
      return '#FFFFFF';
    };

    // 연결선
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];

      if (start && end &&
          start.visibility > visibilityThreshold &&
          end.visibility > visibilityThreshold) {

        const color = getConnectionColor(startIdx, endIdx);
        const avgVisibility = (start.visibility + end.visibility) / 2;

        // 외곽선 (두꺼운 검정)
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 8;
        ctx.moveTo(start.x * videoWidth, start.y * videoHeight);
        ctx.lineTo(end.x * videoWidth, end.y * videoHeight);
        ctx.stroke();

        // 내부선 (색상)
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.globalAlpha = 0.7 + avgVisibility * 0.3;
        ctx.moveTo(start.x * videoWidth, start.y * videoHeight);
        ctx.lineTo(end.x * videoWidth, end.y * videoHeight);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // 관절 포인트 그리기
    const getJointColor = (idx: number): string => {
      // 얼굴: 하늘색
      if (idx <= 10) return '#00D4FF';
      // 어깨/엉덩이: 흰색
      if ([11, 12, 23, 24].includes(idx)) return '#FFFFFF';
      // 왼팔: 초록
      if ([13, 15, 17, 19, 21].includes(idx)) return '#00FF88';
      // 오른팔: 노랑
      if ([14, 16, 18, 20, 22].includes(idx)) return '#FFDD00';
      // 왼쪽 다리: 파랑
      if ([25, 27, 29, 31].includes(idx)) return '#3B82F6';
      // 오른쪽 다리: 보라
      if ([26, 28, 30, 32].includes(idx)) return '#A855F7';
      return '#FF6B6B';
    };

    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (lm.visibility > visibilityThreshold) {
        const x = lm.x * videoWidth;
        const y = lm.y * videoHeight;

        // 주요 관절은 더 크게
        const isMainJoint = [11, 12, 23, 24, 25, 26, 27, 28].includes(i);
        const isFace = i <= 10;
        const radius = isMainJoint ? 10 : (isFace ? 4 : 7);
        const color = getJointColor(i);

        // 외곽 그림자
        ctx.beginPath();
        ctx.arc(x, y, radius + 3, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fill();

        // 외곽선 (흰색)
        ctx.beginPath();
        ctx.arc(x, y, radius + 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        // 내부 (색상)
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.8 + lm.visibility * 0.2;
        ctx.fill();
        ctx.globalAlpha = 1;

        // 하이라이트 (3D 효과)
        ctx.beginPath();
        ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.4, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fill();
      }
    }
  }, []);

  // Convert MediaPipe landmarks to YOLO format
  const toYoloFormat = useCallback((result: PoseResult, videoWidth: number, videoHeight: number): YoloLandmarks => {
    const landmarks = result.landmarks;
    const yoloLandmarks: YoloLandmarks = {};

    for (const [name, idx] of Object.entries(MEDIAPIPE_TO_YOLO)) {
      if (landmarks[idx]) {
        yoloLandmarks[name] = {
          x: landmarks[idx].x * videoWidth,
          y: landmarks[idx].y * videoHeight,
          z: landmarks[idx].z,
          visibility: landmarks[idx].visibility,
        };
      }
    }

    return yoloLandmarks;
  }, []);

  // 필터 리셋
  const resetFilters = useCallback(() => {
    filtersRef.current.forEach(personFilters => {
      personFilters.forEach(f => {
        f.x.reset();
        f.y.reset();
        f.z.reset();
      });
    });
    previousLandmarksRef.current = [null, null];
  }, []);

  // 다중 인물 스켈레톤 그리기
  const drawMultiSkeleton = useCallback((
    canvas: HTMLCanvasElement,
    result: MultiPoseResult,
    videoWidth: number,
    videoHeight: number
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
      canvas.width = videoWidth;
      canvas.height = videoHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const visibilityThreshold = 0.4;

    // 인물별 색상 테마 (인덱스 기반: 첫 번째 = 환자)
    const personThemes = [
      {
        main: '#00FF88',    // 초록 (환자 - 첫 번째 감지된 사람)
        accent: '#00D4FF',
        label: '환자',
        labelBg: '#00FF88',
      },
      {
        main: '#FF6B6B',    // 빨강 (검사자)
        accent: '#FFB86C',
        label: '검사자',
        labelBg: '#FF6B6B',
      },
      {
        main: '#FFB86C',    // 주황 (기타)
        accent: '#FF6B6B',
        label: '기타',
        labelBg: '#FFB86C',
      },
    ];

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 각 인물 그리기
    for (let poseIndex = 0; poseIndex < result.poses.length; poseIndex++) {
      const pose = result.poses[poseIndex];
      const theme = personThemes[Math.min(poseIndex, personThemes.length - 1)];
      const landmarks = pose.landmarks;

      // 연결선 그리기
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];

        if (start && end &&
            start.visibility > visibilityThreshold &&
            end.visibility > visibilityThreshold) {

          const avgVisibility = (start.visibility + end.visibility) / 2;

          // 외곽선
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.lineWidth = 6;
          ctx.moveTo(start.x * videoWidth, start.y * videoHeight);
          ctx.lineTo(end.x * videoWidth, end.y * videoHeight);
          ctx.stroke();

          // 내부선
          ctx.beginPath();
          ctx.strokeStyle = theme.main;
          ctx.lineWidth = 4;
          ctx.globalAlpha = 0.7 + avgVisibility * 0.3;
          ctx.moveTo(start.x * videoWidth, start.y * videoHeight);
          ctx.lineTo(end.x * videoWidth, end.y * videoHeight);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // 관절 포인트 그리기
      for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        if (lm.visibility > visibilityThreshold) {
          const x = lm.x * videoWidth;
          const y = lm.y * videoHeight;

          const isMainJoint = [11, 12, 23, 24, 25, 26, 27, 28].includes(i);
          const isFace = i <= 10;
          const radius = isMainJoint ? 8 : (isFace ? 3 : 5);

          // 외곽 그림자
          ctx.beginPath();
          ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.fill();

          // 외곽선
          ctx.beginPath();
          ctx.arc(x, y, radius + 1, 0, 2 * Math.PI);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();

          // 내부
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI);
          ctx.fillStyle = theme.main;
          ctx.globalAlpha = 0.8 + lm.visibility * 0.2;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // 라벨 표시 (머리 위)
      const nose = landmarks[0];
      if (nose && nose.visibility > 0.3) {
        const labelX = nose.x * videoWidth;
        const labelY = Math.max(30, nose.y * videoHeight - 40);

        // 라벨 배경
        ctx.font = 'bold 14px sans-serif';
        const textWidth = ctx.measureText(theme.label).width;
        const padding = 8;

        ctx.fillStyle = theme.labelBg;
        ctx.beginPath();
        ctx.roundRect(
          labelX - textWidth / 2 - padding,
          labelY - 10,
          textWidth + padding * 2,
          24,
          6
        );
        ctx.fill();

        // 라벨 텍스트
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(theme.label, labelX, labelY + 2);
      }

      // 바운딩 박스 (점선)
      const bb = pose.boundingBox;
      ctx.strokeStyle = theme.main;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        bb.minX * videoWidth - 10,
        bb.minY * videoHeight - 10,
        bb.width * videoWidth + 20,
        bb.height * videoHeight + 20
      );
      ctx.setLineDash([]);
    }
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
    detectMultiPose,
    drawSkeleton,
    drawMultiSkeleton,
    toYoloFormat,
    resetFilters,
    isReady,
    isLoading,
    error,
  };
}
