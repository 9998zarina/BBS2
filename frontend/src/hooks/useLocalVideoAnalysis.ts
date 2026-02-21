import { useState, useCallback, useRef } from 'react';
import { usePoseDetection, type PoseResult } from './usePoseDetection';
import { BBS_TEST_ITEMS } from '../utils/bbs-test-items';

interface AnalysisResult {
  detectedTestId: number;
  detectedTestName: string;
  detectedTestNameKo: string;
  score: number;
  confidence: number;
  reasoning: string;
  criteriaMet: Record<string, boolean>;
  framesAnalyzed: number;
}

interface AnalysisProgress {
  phase: 'loading' | 'analyzing' | 'scoring' | 'complete';
  progress: number;
  message: string;
}

// 두 점 사이의 각도 계산
function calculateAngle(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): number {
  const rad = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
  let deg = Math.abs(rad * 180 / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return deg;
}

// 자세 상태 감지
type PoseState = 'sitting' | 'standing' | 'moving' | 'unknown';

function detectPoseState(landmarks: PoseResult['landmarks']): { state: PoseState; angles: { knee: number; hip: number } } {
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  if (!leftHip || !rightHip || !leftKnee || !rightKnee) {
    return { state: 'unknown', angles: { knee: 0, hip: 0 } };
  }

  // 무릎 각도 계산
  const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle || leftKnee);
  const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle || rightKnee);
  const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

  // 엉덩이 각도 계산
  let hipAngle = 180;
  if (leftShoulder && rightShoulder) {
    const midShoulder = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
    const midHip = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
    const midKnee = { x: (leftKnee.x + rightKnee.x) / 2, y: (leftKnee.y + rightKnee.y) / 2 };
    hipAngle = calculateAngle(midShoulder, midHip, midKnee);
  }

  if (avgKneeAngle < 120 && hipAngle < 130) {
    return { state: 'sitting', angles: { knee: avgKneeAngle, hip: hipAngle } };
  } else if (avgKneeAngle > 150 && hipAngle > 150) {
    return { state: 'standing', angles: { knee: avgKneeAngle, hip: hipAngle } };
  }

  return { state: 'moving', angles: { knee: avgKneeAngle, hip: hipAngle } };
}

// 테스트 유형 감지
function detectTestType(frames: PoseResult[]): { testId: number; confidence: number } {
  if (frames.length < 5) {
    return { testId: 1, confidence: 0.3 };
  }

  let sittingCount = 0;
  let standingCount = 0;
  let transitionCount = 0;

  for (let i = 0; i < frames.length; i++) {
    const { state } = detectPoseState(frames[i].landmarks);
    if (state === 'sitting') sittingCount++;
    if (state === 'standing') standingCount++;

    if (i > 0) {
      const prevState = detectPoseState(frames[i-1].landmarks).state;
      if (prevState !== state && state !== 'unknown' && prevState !== 'unknown') {
        transitionCount++;
      }
    }
  }

  const total = frames.length;
  const sittingRatio = sittingCount / total;
  const standingRatio = standingCount / total;

  // 앉았다 일어서기 (Test 1)
  if (transitionCount >= 1 && sittingRatio > 0.2 && standingRatio > 0.2) {
    return { testId: 1, confidence: 0.8 };
  }

  // 지지없이 서기 (Test 2)
  if (standingRatio > 0.7 && transitionCount < 2) {
    return { testId: 2, confidence: 0.75 };
  }

  // 지지없이 앉기 (Test 3)
  if (sittingRatio > 0.7 && transitionCount < 2) {
    return { testId: 3, confidence: 0.75 };
  }

  // 서서 앉기 (Test 4)
  if (transitionCount >= 1 && standingRatio > 0.2 && sittingRatio > 0.3) {
    return { testId: 4, confidence: 0.7 };
  }

  // 기본: 서기 또는 앉기
  if (standingRatio > sittingRatio) {
    return { testId: 2, confidence: 0.5 };
  }
  return { testId: 3, confidence: 0.5 };
}

// 안정성 계산
function calculateStability(frames: PoseResult[]): number {
  if (frames.length < 5) return 0.5;

  let totalMovement = 0;
  const joints = [11, 12, 23, 24]; // 어깨, 엉덩이

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1].landmarks;
    const curr = frames[i].landmarks;

    for (const j of joints) {
      if (prev[j] && curr[j]) {
        const dx = curr[j].x - prev[j].x;
        const dy = curr[j].y - prev[j].y;
        totalMovement += Math.sqrt(dx * dx + dy * dy);
      }
    }
  }

  const avgMovement = totalMovement / ((frames.length - 1) * joints.length);
  return Math.max(0, Math.min(1, 1 - avgMovement * 15));
}

// 점수 계산
function calculateScore(testId: number, frames: PoseResult[]): {
  score: number;
  confidence: number;
  reasoning: string;
  criteriaMet: Record<string, boolean>;
} {
  if (frames.length < 5) {
    return { score: 0, confidence: 0, reasoning: '프레임 부족', criteriaMet: {} };
  }

  let sittingCount = 0;
  let standingCount = 0;

  for (const frame of frames) {
    const { state } = detectPoseState(frame.landmarks);
    if (state === 'sitting') sittingCount++;
    if (state === 'standing') standingCount++;
  }

  const stability = calculateStability(frames);
  const sittingRatio = sittingCount / frames.length;
  const standingRatio = standingCount / frames.length;

  // 테스트별 점수
  switch (testId) {
    case 1: // 앉아서 일어서기
      if (standingRatio > 0.3 && stability > 0.6) {
        return { score: 4, confidence: 0.85, reasoning: '손 사용 없이 안정적으로 일어섬', criteriaMet: { noHands: true, stable: true } };
      } else if (standingRatio > 0.2 && stability > 0.4) {
        return { score: 3, confidence: 0.75, reasoning: '일어섰으나 약간 불안정', criteriaMet: { noHands: true, stable: false } };
      } else if (standingRatio > 0.1) {
        return { score: 2, confidence: 0.65, reasoning: '도움을 받아 일어섬', criteriaMet: { noHands: false, stable: false } };
      }
      return { score: 1, confidence: 0.55, reasoning: '일어서기 어려움', criteriaMet: { noHands: false, stable: false } };

    case 2: // 지지없이 서기
    case 6: // 눈감고 서기
      if (standingRatio > 0.8 && stability > 0.7) {
        return { score: 4, confidence: 0.9, reasoning: '안정적으로 서있음', criteriaMet: { fullDuration: true, stable: true } };
      } else if (standingRatio > 0.6 && stability > 0.5) {
        return { score: 3, confidence: 0.75, reasoning: '서있으나 약간 흔들림', criteriaMet: { fullDuration: true, stable: false } };
      } else if (standingRatio > 0.4) {
        return { score: 2, confidence: 0.65, reasoning: '일부 시간만 서있음', criteriaMet: { fullDuration: false, stable: false } };
      }
      return { score: 1, confidence: 0.55, reasoning: '서있기 어려움', criteriaMet: { fullDuration: false, stable: false } };

    case 3: // 지지없이 앉기
      if (sittingRatio > 0.8 && stability > 0.7) {
        return { score: 4, confidence: 0.9, reasoning: '안정적으로 앉아있음', criteriaMet: { fullDuration: true, goodPosture: true } };
      } else if (sittingRatio > 0.6 && stability > 0.5) {
        return { score: 3, confidence: 0.75, reasoning: '앉아있으나 불안정', criteriaMet: { fullDuration: true, goodPosture: false } };
      } else if (sittingRatio > 0.4) {
        return { score: 2, confidence: 0.65, reasoning: '부분적으로 앉아있음', criteriaMet: { fullDuration: false, goodPosture: false } };
      }
      return { score: 1, confidence: 0.55, reasoning: '앉아있기 어려움', criteriaMet: { fullDuration: false, goodPosture: false } };

    case 4: // 서서 앉기
      if (sittingRatio > 0.3 && stability > 0.6) {
        return { score: 4, confidence: 0.85, reasoning: '안전하게 앉음', criteriaMet: { controlled: true, smooth: true } };
      } else if (sittingRatio > 0.2 && stability > 0.4) {
        return { score: 3, confidence: 0.75, reasoning: '앉았으나 약간 불안정', criteriaMet: { controlled: true, smooth: false } };
      } else if (sittingRatio > 0.1) {
        return { score: 2, confidence: 0.65, reasoning: '앉기 시도', criteriaMet: { controlled: false, smooth: false } };
      }
      return { score: 1, confidence: 0.55, reasoning: '앉기 어려움', criteriaMet: { controlled: false, smooth: false } };

    default:
      // 기타 테스트 (5-14)
      if (stability > 0.7) {
        return { score: 4, confidence: 0.8, reasoning: '안정적으로 수행', criteriaMet: { stable: true, completed: true } };
      } else if (stability > 0.5) {
        return { score: 3, confidence: 0.7, reasoning: '수행했으나 불안정', criteriaMet: { stable: false, completed: true } };
      } else if (stability > 0.3) {
        return { score: 2, confidence: 0.6, reasoning: '부분적으로 수행', criteriaMet: { stable: false, completed: false } };
      }
      return { score: 1, confidence: 0.5, reasoning: '수행 어려움', criteriaMet: { stable: false, completed: false } };
  }
}

export function useLocalVideoAnalysis() {
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { initialize, detectPose, isReady } = usePoseDetection();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const analyzeVideo = useCallback(async (videoUrl: string): Promise<AnalysisResult | null> => {
    setAnalyzing(true);
    setError(null);
    setResult(null);
    setProgress({ phase: 'loading', progress: 0, message: '영상 로드 중...' });

    try {
      // 1. Initialize MediaPipe
      if (!isReady) {
        await initialize();
      }

      // 2. Load video
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.src = videoUrl;
      videoRef.current = video;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('영상 로드 실패'));
        setTimeout(() => reject(new Error('영상 로드 타임아웃')), 10000);
      });

      const duration = video.duration;
      const frameInterval = 0.1; // 100ms 간격 (10fps)
      const totalFrames = Math.min(Math.floor(duration / frameInterval), 100); // 최대 100프레임

      setProgress({ phase: 'analyzing', progress: 10, message: '자세 분석 중...' });

      // 3. Process frames
      const frames: PoseResult[] = [];

      for (let i = 0; i < totalFrames; i++) {
        const currentTime = i * frameInterval;
        video.currentTime = currentTime;

        await new Promise<void>(resolve => {
          video.onseeked = () => resolve();
        });

        // Detect pose
        const timestamp = currentTime * 1000;
        const poseResult = detectPose(video, timestamp);

        if (poseResult && poseResult.landmarks.length > 0) {
          frames.push(poseResult);
        }

        // Update progress
        const progressPercent = 10 + Math.round((i / totalFrames) * 70);
        setProgress({
          phase: 'analyzing',
          progress: progressPercent,
          message: `프레임 분석 중... (${i + 1}/${totalFrames})`
        });
      }

      if (frames.length < 5) {
        throw new Error('자세를 감지할 수 없습니다. 영상에 사람이 보이는지 확인하세요.');
      }

      setProgress({ phase: 'scoring', progress: 85, message: '점수 계산 중...' });

      // 4. Detect test type
      const { testId, confidence: detectConfidence } = detectTestType(frames);
      const testItem = BBS_TEST_ITEMS.find(t => t.id === testId) || BBS_TEST_ITEMS[0];

      // 5. Calculate score
      const scoreResult = calculateScore(testId, frames);

      // 6. Create result
      const analysisResult: AnalysisResult = {
        detectedTestId: testId,
        detectedTestName: testItem.name,
        detectedTestNameKo: testItem.nameKo,
        score: scoreResult.score,
        confidence: Math.round((detectConfidence + scoreResult.confidence) / 2 * 100) / 100,
        reasoning: scoreResult.reasoning,
        criteriaMet: scoreResult.criteriaMet,
        framesAnalyzed: frames.length,
      };

      setProgress({ phase: 'complete', progress: 100, message: '분석 완료!' });
      setResult(analysisResult);

      return analysisResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : '분석 중 오류 발생';
      setError(message);
      return null;
    } finally {
      setAnalyzing(false);
      if (videoRef.current) {
        videoRef.current.src = '';
        videoRef.current = null;
      }
    }
  }, [initialize, detectPose, isReady]);

  const reset = useCallback(() => {
    setAnalyzing(false);
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  return {
    analyzeVideo,
    analyzing,
    progress,
    result,
    error,
    reset,
  };
}
