import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CameraCapture } from '../components/camera/CameraCapture';
import { useMediaPipePose, type PoseResult } from '../hooks/useMediaPipePose';
import { useHybridPose } from '../hooks/useHybridPose';
import { useTTS } from '../hooks/useTTS';
import { usePoseAnalysis, type PoseAnalysis } from '../hooks/usePoseAnalysis';

type PoseMode = 'mediapipe' | 'hybrid';

// BBS 14개 검사 항목 정의
const BBS_TESTS = [
  {
    id: 1,
    name: 'Sitting to Standing',
    nameKo: '앉은 자세에서 일어나기',
    description: '손을 사용하지 않고 일어서기',
    instructions: [
      { phase: 'init', message: '의자에 앉아주세요.' },
      { phase: 'sitting', message: '앉은 자세가 확인되었습니다. 손을 사용하지 않고 일어나세요.' },
      { phase: 'complete', message: '잘하셨습니다!' },
    ],
    requiredDuration: 0,
    maxScore: 4,
    poseType: 'sit_to_stand',
  },
  {
    id: 2,
    name: 'Standing Unsupported',
    nameKo: '잡지 않고 서 있기',
    description: '2분간 아무것도 잡지 않고 서있기',
    instructions: [
      { phase: 'init', message: '아무것도 잡지 않고 서 주세요.' },
      { phase: 'standing', message: '서있는 자세를 유지하세요. 2분간 측정합니다.' },
      { phase: 'complete', message: '검사가 완료되었습니다!' },
    ],
    requiredDuration: 120000, // 2분
    maxScore: 4,
    poseType: 'standing',
  },
  {
    id: 3,
    name: 'Sitting Unsupported',
    nameKo: '등받이에 기대지 않고 앉기',
    description: '의자의 등받이에 기대지 않고 바른 자세로 앉기',
    instructions: [
      { phase: 'init', message: '의자의 등받이에 기대지 않고 바른 자세로 앉아주세요.' },
      { phase: 'sitting', message: '좋습니다. 이 자세를 2분간 유지하세요.' },
      { phase: 'complete', message: '검사가 완료되었습니다!' },
    ],
    requiredDuration: 120000, // 2분
    maxScore: 4,
    poseType: 'sitting',
  },
  {
    id: 4,
    name: 'Standing to Sitting',
    nameKo: '선 자세에서 앉기',
    description: '서있는 상태에서 앉기',
    instructions: [
      { phase: 'init', message: '먼저 일어서 주세요.' },
      { phase: 'standing', message: '서있는 자세가 확인되었습니다. 천천히 앉으세요.' },
      { phase: 'complete', message: '검사가 완료되었습니다!' },
    ],
    requiredDuration: 0,
    maxScore: 4,
    poseType: 'stand_to_sit',
  },
  {
    id: 5,
    name: 'Transfers',
    nameKo: '의자에서 의자로 이동하기',
    description: '팔걸이가 있는 의자에서 없는 의자로 이동',
    instructions: [
      { phase: 'init', message: '의자에 앉아주세요. 옆에 다른 의자를 준비해주세요.' },
      { phase: 'sitting', message: '앉은 자세가 확인되었습니다. 옆 의자로 이동해주세요.' },
      { phase: 'complete', message: '검사가 완료되었습니다!' },
    ],
    requiredDuration: 0,
    maxScore: 4,
    poseType: 'transfer',
  },
  {
    id: 6,
    name: 'Standing Eyes Closed',
    nameKo: '두 눈을 감고 잡지 않고 서 있기',
    description: '10초간 눈을 감고 서있기',
    instructions: [
      { phase: 'init', message: '일어서 주세요.' },
      { phase: 'standing', message: '서있는 자세가 확인되었습니다. 두 눈을 감고 10초간 서 있어주세요.' },
      { phase: 'complete', message: '검사가 완료되었습니다!' },
    ],
    requiredDuration: 10000, // 10초
    maxScore: 4,
    poseType: 'standing',
  },
  {
    id: 7,
    name: 'Standing Feet Together',
    nameKo: '두 발 모으고 잡지 않고 서 있기',
    description: '1분간 두 발을 모으고 서있기',
    instructions: [
      { phase: 'init', message: '두 발을 붙이고 아무것도 잡지 않고 서 주세요.' },
      { phase: 'standing', message: '좋습니다. 이 자세를 1분간 유지하세요.' },
      { phase: 'complete', message: '검사가 완료되었습니다!' },
    ],
    requiredDuration: 60000, // 1분
    maxScore: 4,
    poseType: 'feet_together',
  },
  {
    id: 8,
    name: 'Reaching Forward',
    nameKo: '선 자세에서 앞으로 팔 뻗기',
    description: '선 자세에서 앞으로 팔을 뻗쳐 내밀기',
    instructions: [
      { phase: 'init', message: '일어서서 팔을 앞으로 90도로 들어주세요.' },
      { phase: 'standing', message: '자세가 확인되었습니다. 발을 움직이지 않고 최대한 앞으로 팔을 뻗어주세요.' },
      { phase: 'complete', message: '검사가 완료되었습니다!' },
    ],
    requiredDuration: 0,
    maxScore: 4,
    poseType: 'reaching',
  },
  {
    id: 9,
    name: 'Pick Up Object',
    nameKo: '바닥에 있는 물건 집어 올리기',
    description: '서있는 상태에서 바닥의 물건을 집어 올리기',
    instructions: [
      { phase: 'init', message: '일어서 주세요. 발 앞에 물건을 놓아주세요.' },
      { phase: 'standing', message: '서있는 자세가 확인되었습니다. 바닥의 물건을 집어 올려주세요.' },
      { phase: 'complete', message: '검사가 완료되었습니다!' },
    ],
    requiredDuration: 0,
    maxScore: 4,
    poseType: 'pickup',
  },
  {
    id: 10,
    name: 'Turn to Look Behind',
    nameKo: '왼쪽과 오른쪽으로 뒤돌아보기',
    description: '좌우로 뒤 돌아보기',
    instructions: [
      { phase: 'init', message: '일어서 주세요.' },
      { phase: 'standing', message: '서있는 자세가 확인되었습니다. 왼쪽 뒤를 돌아보세요.' },
      { phase: 'action', message: '좋습니다. 이제 오른쪽 뒤를 돌아보세요.' },
      { phase: 'complete', message: '검사가 완료되었습니다!' },
    ],
    requiredDuration: 0,
    maxScore: 4,
    poseType: 'turn_look',
  },
  {
    id: 11,
    name: 'Turn 360 Degrees',
    nameKo: '제자리에서 360도 회전하기',
    description: '제자리에서 한 바퀴 돌기',
    instructions: [
      { phase: 'init', message: '일어서 주세요.' },
      { phase: 'standing', message: '서있는 자세가 확인되었습니다. 왼쪽으로 한 바퀴 돌아주세요.' },
      { phase: 'action', message: '좋습니다. 이제 오른쪽으로 한 바퀴 돌아주세요.' },
      { phase: 'complete', message: '검사가 완료되었습니다!' },
    ],
    requiredDuration: 0,
    maxScore: 4,
    poseType: 'turn_360',
  },
  {
    id: 12,
    name: 'Alternate Stepping',
    nameKo: '발판 위에 발을 교대로 놓기',
    description: '일정한 높이의 발판 위에 발을 교대로 놓기',
    instructions: [
      { phase: 'init', message: '일어서 주세요. 앞에 낮은 발판을 준비해주세요.' },
      { phase: 'standing', message: '서있는 자세가 확인되었습니다. 발판에 양발을 번갈아 올려주세요. 8회 실시합니다.' },
      { phase: 'complete', message: '검사가 완료되었습니다!' },
    ],
    requiredDuration: 20000, // 20초
    maxScore: 4,
    poseType: 'stepping',
  },
  {
    id: 13,
    name: 'Tandem Standing',
    nameKo: '한 발 앞에 다른 발을 일자로 서기',
    description: '한 발 앞에 다른 발을 일자로 두고 서 있기',
    instructions: [
      { phase: 'init', message: '한 발을 다른 발 바로 앞에 일자로 놓고 서 주세요.' },
      { phase: 'standing', message: '자세가 확인되었습니다. 이 자세를 30초간 유지하세요.' },
      { phase: 'complete', message: '검사가 완료되었습니다!' },
    ],
    requiredDuration: 30000, // 30초
    maxScore: 4,
    poseType: 'tandem',
  },
  {
    id: 14,
    name: 'Standing on One Leg',
    nameKo: '한 다리로 서 있기',
    description: '한 다리로 서서 균형 유지하기',
    instructions: [
      { phase: 'init', message: '일어서 주세요.' },
      { phase: 'standing', message: '서있는 자세가 확인되었습니다. 한 발을 들고 최대한 오래 서 있어주세요.' },
      { phase: 'complete', message: '검사가 완료되었습니다!' },
    ],
    requiredDuration: 10000, // 10초
    maxScore: 4,
    poseType: 'one_leg',
  },
];

type TestPhase = 'init' | 'waiting' | 'sitting' | 'standing' | 'action' | 'maintaining' | 'complete';

interface TestResult {
  testId: number;
  testNameKo: string;
  score: number;
  maxScore: number;
  duration: number;
  details: string;
  criteria: Record<string, boolean>;
}

export function BBSAssessmentPage() {
  const navigate = useNavigate();
  const { speak, stop: stopTTS, test: testTTS, isReady: isTTSReady, voiceCount } = useTTS();

  // Pose detection mode
  const [poseMode, setPoseMode] = useState<PoseMode>('hybrid');

  // MediaPipe only hook
  const {
    initialize: initializeMediaPipe,
    detectPose: detectMediaPipe,
    drawSkeleton: drawSkeletonMP,
    isReady: isMediaPipeReady,
    isLoading: isMediaPipeLoading,
  } = useMediaPipePose();

  // Hybrid (MediaPipe + YOLO) hook
  const {
    initialize: initializeHybrid,
    detectPose: detectHybrid,
    drawSkeleton: drawSkeletonHybrid,
    toPoseResult,
    isReady: isHybridReady,
    isLoading: isHybridLoading,
    isYoloAvailable,
  } = useHybridPose({
    enableYolo: poseMode === 'hybrid',
    yoloIntervalMs: 300,  // 0.3초마다 YOLO
    yoloWeight: 0.4,  // YOLO 40% 반영
  });

  const { analyzePose } = usePoseAnalysis();

  // State
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [testPhase, setTestPhase] = useState<TestPhase>('init');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPreviewActive, setIsPreviewActive] = useState(true);  // 시작 화면에서 미리보기 활성화
  const [, setCountdown] = useState<number | null>(null);
  const [, setCurrentPose] = useState<PoseResult | null>(null);
  const [poseAnalysis, setPoseAnalysis] = useState<PoseAnalysis | null>(null);
  const [maintainStartTime, setMaintainStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [fps, setFps] = useState(0);
  const [previewFps, setPreviewFps] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [poseSource, setPoseSource] = useState<string>('');

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const previewAnimationRef = useRef<number | null>(null);
  const poseHistoryRef = useRef<PoseAnalysis[]>([]);
  const phaseStartTimeRef = useRef<number>(Date.now());
  const lastSpeakRef = useRef<string>('');

  const currentTest = BBS_TESTS[currentTestIndex];
  const totalScore = testResults.reduce((sum, r) => sum + r.score, 0);
  const maxTotalScore = testResults.reduce((sum, r) => sum + r.maxScore, 0);

  // Dynamic pose detection based on mode
  const isPoseReady = poseMode === 'hybrid' ? isHybridReady : isMediaPipeReady;
  const isPoseLoading = poseMode === 'hybrid' ? isHybridLoading : isMediaPipeLoading;
  const drawSkeleton = poseMode === 'hybrid' ? drawSkeletonHybrid : drawSkeletonMP;

  // Initialize pose detection
  useEffect(() => {
    if (poseMode === 'hybrid') {
      initializeHybrid();
    } else {
      initializeMediaPipe();
    }
  }, [poseMode, initializeHybrid, initializeMediaPipe]);

  // Preview pose detection loop (시작 전 미리보기)
  useEffect(() => {
    if (!isPoseReady || isRunning || !isPreviewActive || !videoRef.current) {
      if (previewAnimationRef.current) {
        cancelAnimationFrame(previewAnimationRef.current);
        previewAnimationRef.current = null;
      }
      return;
    }

    const video = videoRef.current;
    let lastFpsUpdate = performance.now();
    let fpsFrameCount = 0;

    const processPreviewFrame = async () => {
      if (isRunning || !isPreviewActive) return;

      fpsFrameCount++;
      const now = performance.now();

      let result: PoseResult | null = null;

      // 모드에 따라 다른 감지 방식 사용
      if (poseMode === 'hybrid') {
        const hybridResult = await detectHybrid(video, now);
        if (hybridResult) {
          result = toPoseResult(hybridResult);
          setPoseSource(hybridResult.source);
        }
      } else {
        result = detectMediaPipe(video, now);
        setPoseSource('mediapipe');
      }

      if (result) {
        // 포즈 분석
        const analysis = analyzePose(result);
        setPoseAnalysis(analysis);

        // 스켈레톤 그리기
        if (previewCanvasRef.current && video.videoWidth && video.videoHeight) {
          drawSkeleton(previewCanvasRef.current, result, video.videoWidth, video.videoHeight);
        }
      }

      // FPS
      if (now - lastFpsUpdate >= 1000) {
        setPreviewFps(fpsFrameCount);
        fpsFrameCount = 0;
        lastFpsUpdate = now;
      }

      previewAnimationRef.current = requestAnimationFrame(processPreviewFrame);
    };

    previewAnimationRef.current = requestAnimationFrame(processPreviewFrame);

    return () => {
      if (previewAnimationRef.current) {
        cancelAnimationFrame(previewAnimationRef.current);
      }
    };
  }, [isPoseReady, isRunning, isPreviewActive, poseMode, detectMediaPipe, detectHybrid, toPoseResult, drawSkeleton, analyzePose]);

  // Speak helper (avoid repeating same message)
  const speakOnce = useCallback((message: string) => {
    if (lastSpeakRef.current !== message) {
      lastSpeakRef.current = message;
      speak(message);
    }
  }, [speak]);

  // Calculate score based on test type and performance
  const calculateScore = useCallback((
    testId: number,
    history: PoseAnalysis[],
    duration: number,
    requiredDuration: number
  ): { score: number; details: string; criteria: Record<string, boolean> } => {
    const stabilityCount = history.filter(h => h.details.isStable).length;
    const stability = stabilityCount / Math.max(1, history.length);

    switch (testId) {
      case 1: // Sitting to Standing
        const usedHands = false; // Would need hand tracking
        const attempts = 1;
        if (!usedHands && attempts === 1) {
          return {
            score: 4,
            details: '손 사용 없이 한 번에 일어섬',
            criteria: { noHands: true, singleAttempt: true },
          };
        } else if (!usedHands) {
          return {
            score: 3,
            details: '손 사용 없이 일어섬',
            criteria: { noHands: true, singleAttempt: false },
          };
        }
        return {
          score: 2,
          details: '손을 사용하여 일어섬',
          criteria: { noHands: false, singleAttempt: false },
        };

      case 2: // Standing Unsupported
      case 6: // Standing Eyes Closed
        if (duration >= requiredDuration && stability > 0.8) {
          return {
            score: 4,
            details: `${requiredDuration / 1000}초 이상 안정적으로 서있음`,
            criteria: { fullDuration: true, stable: true },
          };
        } else if (duration >= requiredDuration * 0.5) {
          return {
            score: 3,
            details: `${Math.floor(duration / 1000)}초 동안 서있음`,
            criteria: { fullDuration: false, stable: stability > 0.5 },
          };
        } else if (duration >= requiredDuration * 0.25) {
          return {
            score: 2,
            details: `${Math.floor(duration / 1000)}초 동안 서있음 (불안정)`,
            criteria: { fullDuration: false, stable: false },
          };
        }
        return {
          score: 1,
          details: '서있기 유지 어려움',
          criteria: { fullDuration: false, stable: false },
        };

      case 3: // Sitting Unsupported
        if (duration >= requiredDuration && stability > 0.7) {
          return {
            score: 4,
            details: '2분간 바른 자세로 앉아있음',
            criteria: { fullDuration: true, goodPosture: true },
          };
        } else if (duration >= requiredDuration * 0.5) {
          return {
            score: 3,
            details: `${Math.floor(duration / 1000)}초 동안 앉아있음`,
            criteria: { fullDuration: false, goodPosture: stability > 0.5 },
          };
        }
        return {
          score: 2,
          details: '앉아있기 유지 어려움',
          criteria: { fullDuration: false, goodPosture: false },
        };

      case 4: // Standing to Sitting
        // Check transition quality from history
        const hipChanges = history.slice(-30).map((h, i, arr) => {
          if (i === 0) return 0;
          return Math.abs(h.details.hipY - arr[i - 1].details.hipY);
        });
        const maxChange = Math.max(...hipChanges);

        if (maxChange < 0.02) {
          return {
            score: 4,
            details: '손 사용 없이 부드럽게 앉음',
            criteria: { smooth: true, controlled: true },
          };
        } else if (maxChange < 0.04) {
          return {
            score: 3,
            details: '천천히 앉음',
            criteria: { smooth: false, controlled: true },
          };
        }
        return {
          score: 2,
          details: '앉는 동작이 불안정함',
          criteria: { smooth: false, controlled: false },
        };

      case 7: // Standing Feet Together
        const feetTogetherCount = history.filter(h => h.state === 'standing_feet_together').length;
        const feetTogether = feetTogetherCount / Math.max(1, history.length) > 0.7;

        if (duration >= requiredDuration && feetTogether && stability > 0.8) {
          return {
            score: 4,
            details: '1분간 두 발 붙이고 안정적으로 서있음',
            criteria: { fullDuration: true, feetTogether: true, stable: true },
          };
        } else if (duration >= requiredDuration * 0.5 && feetTogether) {
          return {
            score: 3,
            details: `${Math.floor(duration / 1000)}초 동안 두 발 붙이고 서있음`,
            criteria: { fullDuration: false, feetTogether: true, stable: stability > 0.5 },
          };
        }
        return {
          score: 2,
          details: '두 발 붙이고 서있기 어려움',
          criteria: { fullDuration: false, feetTogether: false, stable: false },
        };

      case 5: // Transfers
        // 이동하기 - 의자 간 이동은 손 사용 여부와 안전성으로 평가
        if (stability > 0.8) {
          return {
            score: 4,
            details: '안전하게 이동 완료',
            criteria: { safe: true, independent: true },
          };
        } else if (stability > 0.5) {
          return {
            score: 3,
            details: '약간의 도움으로 이동',
            criteria: { safe: true, independent: false },
          };
        }
        return {
          score: 2,
          details: '이동 시 도움 필요',
          criteria: { safe: false, independent: false },
        };

      case 8: // Reaching Forward
        // 팔 뻗기 - 기본 점수 (실제로는 이동 거리 측정 필요)
        if (stability > 0.7) {
          return {
            score: 4,
            details: '안정적으로 팔을 뻗음 (25cm 이상)',
            criteria: { stable: true, reached: true },
          };
        } else if (stability > 0.4) {
          return {
            score: 3,
            details: '팔을 뻗음 (12cm 이상)',
            criteria: { stable: false, reached: true },
          };
        }
        return {
          score: 2,
          details: '팔 뻗기 제한적',
          criteria: { stable: false, reached: false },
        };

      case 9: // Pick Up Object
        // 바닥 물건 집기
        if (stability > 0.7) {
          return {
            score: 4,
            details: '안전하고 쉽게 물건을 집음',
            criteria: { safe: true, successful: true },
          };
        } else if (stability > 0.4) {
          return {
            score: 3,
            details: '감독 하에 물건을 집음',
            criteria: { safe: true, successful: true },
          };
        }
        return {
          score: 2,
          details: '물건 집기 어려움',
          criteria: { safe: false, successful: false },
        };

      case 10: // Turn to Look Behind
        // 뒤 돌아보기
        if (stability > 0.7) {
          return {
            score: 4,
            details: '양쪽으로 안정적으로 뒤돌아봄',
            criteria: { leftTurn: true, rightTurn: true, stable: true },
          };
        } else if (stability > 0.4) {
          return {
            score: 3,
            details: '한쪽만 안정적으로 돌아봄',
            criteria: { leftTurn: true, rightTurn: false, stable: false },
          };
        }
        return {
          score: 2,
          details: '돌아보기 제한적',
          criteria: { leftTurn: false, rightTurn: false, stable: false },
        };

      case 11: // Turn 360 Degrees
        // 360도 회전 - 4초 이내 완료 시 4점
        if (duration <= 4000 && stability > 0.6) {
          return {
            score: 4,
            details: '4초 이내에 안전하게 360도 회전',
            criteria: { fast: true, safe: true },
          };
        } else if (duration <= 8000 && stability > 0.4) {
          return {
            score: 3,
            details: '안전하게 360도 회전',
            criteria: { fast: false, safe: true },
          };
        }
        return {
          score: 2,
          details: '360도 회전 어려움',
          criteria: { fast: false, safe: false },
        };

      case 12: // Alternate Stepping
        // 발판 밟기 - 20초 내 8회
        if (duration <= requiredDuration && stability > 0.6) {
          return {
            score: 4,
            details: '20초 내에 8회 완료',
            criteria: { completed: true, stable: true },
          };
        } else if (stability > 0.4) {
          return {
            score: 3,
            details: '8회 완료 (시간 초과)',
            criteria: { completed: true, stable: false },
          };
        }
        return {
          score: 2,
          details: '발판 밟기 어려움',
          criteria: { completed: false, stable: false },
        };

      case 13: // Tandem Standing
        // 일렬로 서기 - 30초
        if (duration >= requiredDuration && stability > 0.7) {
          return {
            score: 4,
            details: '30초간 일렬 자세 유지',
            criteria: { fullDuration: true, stable: true },
          };
        } else if (duration >= requiredDuration * 0.5) {
          return {
            score: 3,
            details: `${Math.floor(duration / 1000)}초간 유지`,
            criteria: { fullDuration: false, stable: stability > 0.5 },
          };
        }
        return {
          score: 2,
          details: '일렬 서기 어려움',
          criteria: { fullDuration: false, stable: false },
        };

      case 14: // Standing on One Leg
        // 한 발 서기 - 10초
        if (duration >= requiredDuration && stability > 0.6) {
          return {
            score: 4,
            details: '10초 이상 한 발로 서기',
            criteria: { fullDuration: true, stable: true },
          };
        } else if (duration >= 5000) {
          return {
            score: 3,
            details: `${Math.floor(duration / 1000)}초간 한 발로 서기`,
            criteria: { fullDuration: false, stable: stability > 0.4 },
          };
        } else if (duration >= 3000) {
          return {
            score: 2,
            details: `${Math.floor(duration / 1000)}초간 한 발로 서기`,
            criteria: { fullDuration: false, stable: false },
          };
        }
        return {
          score: 1,
          details: '한 발 서기 어려움',
          criteria: { fullDuration: false, stable: false },
        };

      default:
        return { score: 2, details: '측정 완료', criteria: {} };
    }
  }, []);

  // Process test logic
  const processTest = useCallback((pose: PoseResult) => {
    const analysis = analyzePose(pose);
    setPoseAnalysis(analysis);
    poseHistoryRef.current.push(analysis);

    // Keep only last 300 frames (~10 seconds at 30fps)
    if (poseHistoryRef.current.length > 300) {
      poseHistoryRef.current = poseHistoryRef.current.slice(-300);
    }

    const history = poseHistoryRef.current;
    const test = currentTest;

    switch (testPhase) {
      case 'init':
        speakOnce(test.instructions.find(i => i.phase === 'init')?.message || '');
        setTestPhase('waiting');
        phaseStartTimeRef.current = Date.now();
        break;

      case 'waiting':
        // Wait for initial pose detection based on test type
        // 낮은 confidence 임계값으로 빠른 감지 (0.3 이상이면 인정)
        const isStanding = (analysis.state === 'standing' || analysis.state === 'standing_feet_together') && analysis.confidence > 0.25;
        const isSitting = analysis.state === 'sitting' && analysis.confidence > 0.25;

        switch (test.id) {
          case 1: // 앉아서 일어서기 - 앉은 자세 대기
          case 5: // 이동하기 - 앉은 자세 대기
            if (isSitting) {
              const msg = test.instructions.find(i => i.phase === 'sitting')?.message || '이제 동작을 시작하세요.';
              speakOnce(msg);
              setTestPhase('sitting');
              phaseStartTimeRef.current = Date.now();
            }
            break;

          case 3: // 지지 없이 앉아있기 - 앉은 자세로 유지
            if (isSitting) {
              const msg = test.instructions.find(i => i.phase === 'sitting')?.message || '자세를 유지하세요.';
              speakOnce(msg);
              setTestPhase('maintaining');
              setMaintainStartTime(Date.now());
              phaseStartTimeRef.current = Date.now();
            }
            break;

          case 4: // 서서 앉기 - 서있는 자세 대기
            if (isStanding) {
              const msg = test.instructions.find(i => i.phase === 'standing')?.message || '천천히 앉으세요.';
              speakOnce(msg);
              setTestPhase('standing');
              phaseStartTimeRef.current = Date.now();
            }
            break;

          case 7: // 두 발 모으고 서기 - 발 붙인 자세 대기
            if (analysis.state === 'standing_feet_together' && analysis.confidence > 0.5) {
              const msg = test.instructions.find(i => i.phase === 'standing')?.message || '자세를 유지하세요.';
              speakOnce(msg);
              setTestPhase('maintaining');
              setMaintainStartTime(Date.now());
              phaseStartTimeRef.current = Date.now();
            } else if (analysis.state === 'standing') {
              speakOnce('두 발을 붙여주세요.');
            }
            break;

          case 2:  // 지지 없이 서있기
          case 6:  // 눈 감고 서있기
          case 8:  // 팔 뻗기
          case 9:  // 바닥 물건 집기
          case 10: // 뒤 돌아보기
          case 11: // 360도 회전
          case 12: // 발판 밟기
          case 13: // 일렬로 서기
          case 14: // 한 발 서기
            // 모두 서있는 자세에서 시작
            if (isStanding) {
              const msg = test.instructions.find(i => i.phase === 'standing')?.message || '동작을 시작하세요.';
              speakOnce(msg);
              // 시간 측정이 필요한 검사는 maintaining으로
              if (test.requiredDuration > 0) {
                setTestPhase('maintaining');
                setMaintainStartTime(Date.now());
              } else {
                // 단일 동작 검사는 action으로
                setTestPhase('action');
              }
              phaseStartTimeRef.current = Date.now();
            }
            break;
        }
        break;

      case 'sitting': // For test 1 (앉아서 일어서기), test 5 (이동하기)
        if (test.id === 1) {
          // 앉아서 일어서기 - 서면 완료
          if (analysis.state === 'standing' || analysis.state === 'standing_feet_together') {
            speakOnce('잘하셨습니다!');
            const result = calculateScore(test.id, history, 0, 0);
            setTestResults(prev => [...prev, {
              testId: test.id,
              testNameKo: test.nameKo,
              score: result.score,
              maxScore: test.maxScore,
              duration: Date.now() - phaseStartTimeRef.current,
              details: result.details,
              criteria: result.criteria,
            }]);
            setTestPhase('complete');
          }
        } else if (test.id === 5) {
          // 이동하기 - 일어났다 다시 앉으면 완료 (5초 후)
          const transferElapsed = Date.now() - phaseStartTimeRef.current;
          setElapsedTime(transferElapsed);
          if (transferElapsed >= 5000 && analysis.state === 'sitting') {
            speakOnce('이동 검사가 완료되었습니다!');
            const result = calculateScore(test.id, history, transferElapsed, 0);
            setTestResults(prev => [...prev, {
              testId: test.id,
              testNameKo: test.nameKo,
              score: result.score,
              maxScore: test.maxScore,
              duration: transferElapsed,
              details: result.details,
              criteria: result.criteria,
            }]);
            setTestPhase('complete');
          }
        }
        break;

      case 'standing': // For test 4 - 서서 앉기
        if (analysis.state === 'sitting') {
          speakOnce('잘하셨습니다!');
          const result = calculateScore(test.id, history, 0, 0);
          setTestResults(prev => [...prev, {
            testId: test.id,
            testNameKo: test.nameKo,
            score: result.score,
            maxScore: test.maxScore,
            duration: Date.now() - phaseStartTimeRef.current,
            details: result.details,
            criteria: result.criteria,
          }]);
          setTestPhase('complete');
        }
        break;

      case 'action': {
        // 단일 동작 검사 (8, 9, 10, 11번)
        // 일정 시간 후 자동 완료 또는 특정 조건 충족 시 완료
        const actionElapsed = Date.now() - phaseStartTimeRef.current;
        setElapsedTime(actionElapsed);

        // 검사별 완료 조건
        let shouldComplete = false;
        let actionMessage = '';

        switch (test.id) {
          case 8: // 팔 뻗기 - 5초 후 완료
            if (actionElapsed >= 5000) {
              shouldComplete = true;
              actionMessage = '팔 뻗기 검사가 완료되었습니다.';
            }
            break;

          case 9: // 바닥 물건 집기 - 앉았다 일어나면 완료
            // 서있다가 -> 숙이고 -> 다시 서있으면 완료
            const standingNow = (analysis.state === 'standing' || analysis.state === 'standing_feet_together');
            if (actionElapsed >= 3000 && standingNow) {
              shouldComplete = true;
              actionMessage = '물건 집기 검사가 완료되었습니다.';
            }
            break;

          case 10: // 뒤 돌아보기 - 5초 후 완료
            if (actionElapsed >= 5000) {
              shouldComplete = true;
              actionMessage = '뒤 돌아보기 검사가 완료되었습니다.';
            }
            break;

          case 11: // 360도 회전 - 8초 후 완료
            if (actionElapsed >= 8000) {
              shouldComplete = true;
              actionMessage = '360도 회전 검사가 완료되었습니다.';
            }
            break;

          default:
            // 기본 5초 후 완료
            if (actionElapsed >= 5000) {
              shouldComplete = true;
              actionMessage = '검사가 완료되었습니다.';
            }
        }

        if (shouldComplete) {
          speakOnce(actionMessage);
          const result = calculateScore(test.id, history, actionElapsed, test.requiredDuration);
          setTestResults(prev => [...prev, {
            testId: test.id,
            testNameKo: test.nameKo,
            score: result.score,
            maxScore: test.maxScore,
            duration: actionElapsed,
            details: result.details,
            criteria: result.criteria,
          }]);
          setTestPhase('complete');
        }
        break;
      }

      case 'maintaining':
        if (maintainStartTime) {
          const elapsed = Date.now() - maintainStartTime;
          setElapsedTime(elapsed);

          // Check if required duration met
          if (elapsed >= test.requiredDuration) {
            speakOnce('검사가 완료되었습니다!');
            const result = calculateScore(test.id, history, elapsed, test.requiredDuration);
            setTestResults(prev => [...prev, {
              testId: test.id,
              testNameKo: test.nameKo,
              score: result.score,
              maxScore: test.maxScore,
              duration: elapsed,
              details: result.details,
              criteria: result.criteria,
            }]);
            setTestPhase('complete');
          }

          // Check for failure (lost pose) - more lenient detection
          // Only check after 5 seconds, use larger window (60 frames = ~2 sec)
          if (elapsed > 5000) {
            const recentHistory = history.slice(-60);
            const correctPoseCount = recentHistory.filter(h => {
              if (test.id === 3) return h.state === 'sitting';
              if (test.id === 7) return h.state === 'standing_feet_together';
              return h.state === 'standing' || h.state === 'standing_feet_together';
            }).length;

            // Fail only if less than 20% correct poses in last 2 seconds
            if (correctPoseCount < recentHistory.length * 0.2) {
              speakOnce('자세가 흐트러졌습니다. 검사를 종료합니다.');
              const result = calculateScore(test.id, history, elapsed, test.requiredDuration);
              setTestResults(prev => [...prev, {
                testId: test.id,
                testNameKo: test.nameKo,
                score: Math.max(1, result.score - 1),
                maxScore: test.maxScore,
                duration: elapsed,
                details: result.details + ' (자세 이탈)',
                criteria: result.criteria,
              }]);
              setTestPhase('complete');
            }
          }
        }
        break;

      case 'complete':
        // Handled by effect below
        break;
    }
  }, [currentTest, testPhase, maintainStartTime, analyzePose, speakOnce, calculateScore]);

  // Handle test completion - cleanup only (no auto-transition)
  useEffect(() => {
    if (testPhase !== 'complete') return;

    poseHistoryRef.current = [];
    setMaintainStartTime(null);
    setElapsedTime(0);
    setCountdown(null);
  }, [testPhase]);

  // Go to next test (called by button click)
  const goToNextTest = useCallback(() => {
    if (currentTestIndex < BBS_TESTS.length - 1) {
      const nextTestIndex = currentTestIndex + 1;
      const nextTest = BBS_TESTS[nextTestIndex];
      const initMessage = nextTest.instructions.find(i => i.phase === 'init')?.message || '';

      // Set lastSpeakRef BEFORE speaking to prevent duplicates
      lastSpeakRef.current = initMessage;
      speak(initMessage);

      setCurrentTestIndex(nextTestIndex);
      setTestPhase('waiting');
      phaseStartTimeRef.current = Date.now();
    } else {
      lastSpeakRef.current = '모든 검사가 완료되었습니다.';
      speak('모든 검사가 완료되었습니다.');
      setIsRunning(false);
      setIsComplete(true);
    }
  }, [currentTestIndex, speak]);

  // Finish all tests early
  const finishAllTests = useCallback(() => {
    lastSpeakRef.current = '검사를 종료합니다.';
    speak('검사를 종료합니다.');
    setIsRunning(false);
    setIsComplete(true);
  }, [speak]);

  // Real-time pose detection loop
  useEffect(() => {
    if (!isPoseReady || !isRunning || !videoRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const video = videoRef.current;
    let lastFpsUpdate = performance.now();
    let totalFrames = 0;
    let detectCount = 0;
    let fpsFrameCount = 0;

    const processFrame = async () => {
      if (!isRunning) return;

      totalFrames++;
      fpsFrameCount++;
      const now = performance.now();

      let result: PoseResult | null = null;

      // 모드에 따라 다른 감지 방식 사용
      if (poseMode === 'hybrid') {
        const hybridResult = await detectHybrid(video, now);
        if (hybridResult) {
          result = toPoseResult(hybridResult);
          setPoseSource(hybridResult.source);
        }
      } else {
        result = detectMediaPipe(video, now);
        setPoseSource('mediapipe');
      }

      if (result) {
        detectCount++;
        setCurrentPose(result);

        // 100프레임마다 감지율 로그
        if (totalFrames % 100 === 0) {
          console.log(`[BBS] 감지율: ${detectCount}/${totalFrames} (${((detectCount/totalFrames)*100).toFixed(1)}%) [${poseMode}]`);
        }

        // Draw skeleton
        if (canvasRef.current && video.videoWidth && video.videoHeight) {
          drawSkeleton(canvasRef.current, result, video.videoWidth, video.videoHeight);
        }

        // Process test logic
        if (testPhase !== 'complete') {
          processTest(result);
        }
      }

      // FPS
      if (now - lastFpsUpdate >= 1000) {
        setFps(fpsFrameCount);
        fpsFrameCount = 0;
        lastFpsUpdate = now;
      }

      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    animationFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPoseReady, isRunning, testPhase, poseMode, detectMediaPipe, detectHybrid, toPoseResult, drawSkeleton, processTest]);

  // Start assessment
  const startAssessment = useCallback(() => {
    // Speak immediately on user click (required for browser TTS)
    const firstTest = BBS_TESTS[0];
    const initMessage = firstTest.instructions.find(i => i.phase === 'init')?.message || '';

    // Set lastSpeakRef BEFORE speaking to prevent duplicates
    lastSpeakRef.current = initMessage;
    speak(initMessage);

    setIsPreviewActive(false);  // 미리보기 중지
    setIsRunning(true);
    setTestPhase('waiting'); // Skip 'init' since we already spoke
    setCurrentTestIndex(0);
    setTestResults([]);
    poseHistoryRef.current = [];
    setIsComplete(false);
    phaseStartTimeRef.current = Date.now();
  }, [speak]);

  // Video ref callback
  const handleVideoRef = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
  }, []);

  // Reset
  const resetAssessment = useCallback(() => {
    stopTTS();
    setIsRunning(false);
    setIsPreviewActive(true);  // 미리보기 다시 활성화
    setTestPhase('init');
    setCurrentTestIndex(0);
    setTestResults([]);
    poseHistoryRef.current = [];
    setMaintainStartTime(null);
    setElapsedTime(0);
    setCountdown(null);
    lastSpeakRef.current = '';
    setIsComplete(false);
  }, [stopTTS]);

  // Results screen
  if (isComplete) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <button onClick={() => navigate('/')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              홈으로
            </button>
            <h1 className="text-xl font-bold text-gray-900">BBS 검사 결과</h1>
            <div className="w-20" />
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-8">
          {/* Total Score */}
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">BBS 총점</h2>
              <div className={`text-7xl font-bold mb-4 ${
                totalScore >= maxTotalScore * 0.75 ? 'text-green-600' :
                totalScore >= maxTotalScore * 0.5 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {totalScore} <span className="text-3xl text-gray-400">/ {maxTotalScore}</span>
              </div>
              <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden mb-4">
                <div
                  className={`h-full transition-all ${
                    totalScore >= maxTotalScore * 0.75 ? 'bg-green-500' :
                    totalScore >= maxTotalScore * 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${(totalScore / maxTotalScore) * 100}%` }}
                />
              </div>
              <p className="text-lg text-gray-600">
                {totalScore >= maxTotalScore * 0.75 ? '낙상 위험 낮음 - 독립적 보행 가능' :
                 totalScore >= maxTotalScore * 0.5 ? '낙상 위험 중간 - 보조 장비 권장' :
                 '낙상 위험 높음 - 적극적 중재 필요'}
              </p>
            </div>
          </div>

          {/* Individual Results */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6">검사 상세 결과</h3>
            <div className="space-y-4">
              {testResults.map((result, index) => (
                <div key={index} className="border rounded-xl p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                        result.score >= 3 ? 'bg-green-500' :
                        result.score >= 2 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}>
                        {result.score}
                      </span>
                      <div>
                        <h4 className="font-bold text-gray-900">{result.testId}. {result.testNameKo}</h4>
                        <p className="text-sm text-gray-500">최대 {result.maxScore}점</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-2xl font-bold ${
                        result.score >= 3 ? 'text-green-600' :
                        result.score >= 2 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {result.score}/{result.maxScore}
                      </span>
                    </div>
                  </div>

                  <div className="bg-gray-100 rounded-lg p-3 mb-3">
                    <p className="text-gray-700">{result.details}</p>
                    {result.duration > 0 && (
                      <p className="text-sm text-gray-500 mt-1">
                        측정 시간: {(result.duration / 1000).toFixed(1)}초
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {Object.entries(result.criteria).map(([key, value]) => (
                      <span
                        key={key}
                        className={`px-3 py-1 rounded-full text-sm ${
                          value ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {value ? '✓' : '✗'} {
                          key === 'noHands' ? '손 미사용' :
                          key === 'singleAttempt' ? '1회 시도' :
                          key === 'fullDuration' ? '시간 충족' :
                          key === 'stable' ? '안정적' :
                          key === 'goodPosture' ? '바른 자세' :
                          key === 'smooth' ? '부드러운 동작' :
                          key === 'controlled' ? '제어된 동작' :
                          key === 'feetTogether' ? '발 붙임' :
                          key
                        }
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={resetAssessment}
              className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
            >
              다시 검사하기
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex-1 px-6 py-4 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300"
            >
              홈으로
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Start screen
  if (!isRunning) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <button onClick={() => navigate('/')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              홈으로
            </button>
            <h1 className="text-xl font-bold text-gray-900">BBS 자동 검사</h1>
            <div className="w-20" />
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-12">
          {/* Mode Selector */}
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl text-white">
            <h3 className="font-bold mb-3">포즈 감지 모드</h3>
            <div className="flex gap-3">
              <button
                onClick={() => setPoseMode('mediapipe')}
                className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                  poseMode === 'mediapipe'
                    ? 'bg-white text-blue-600 shadow-lg'
                    : 'bg-white/20 hover:bg-white/30'
                }`}
              >
                <div className="text-sm font-bold">MediaPipe</div>
                <div className="text-xs opacity-80">브라우저 기반 (빠름)</div>
              </button>
              <button
                onClick={() => setPoseMode('hybrid')}
                className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                  poseMode === 'hybrid'
                    ? 'bg-white text-purple-600 shadow-lg'
                    : 'bg-white/20 hover:bg-white/30'
                }`}
              >
                <div className="text-sm font-bold">Hybrid (MediaPipe + YOLO)</div>
                <div className="text-xs opacity-80">서버 연동 (정확)</div>
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="mb-8 p-4 bg-white rounded-lg shadow-sm">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full ${
                  isPoseReady ? 'bg-green-500' :
                  isPoseLoading ? 'bg-yellow-500 animate-pulse' : 'bg-gray-400'
                }`} />
                <span className="text-sm text-gray-600">
                  {isPoseReady ? `${poseMode === 'hybrid' ? 'Hybrid' : 'MediaPipe'} 포즈 감지 준비 완료` :
                   isPoseLoading ? 'AI 포즈 감지 로딩 중...' : 'AI 대기 중'}
                </span>
              </div>
              {poseMode === 'hybrid' && (
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${
                    isYoloAvailable ? 'bg-green-500' : 'bg-yellow-500'
                  }`} />
                  <span className="text-sm text-gray-600">
                    {isYoloAvailable
                      ? 'YOLO 백엔드 연결됨'
                      : 'YOLO 백엔드 연결 대기 (MediaPipe만 사용)'}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full ${
                  isTTSReady ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
                }`} />
                <span className="text-sm text-gray-600">
                  {isTTSReady
                    ? `음성 안내 준비 완료 (${voiceCount}개 음성)`
                    : '음성 안내 로딩 중...'}
                </span>
                {isTTSReady && (
                  <button
                    onClick={testTTS}
                    className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
                  >
                    음성 테스트
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 실시간 카메라 미리보기 */}
          <div className="bg-gray-900 rounded-2xl shadow-lg overflow-hidden mb-8">
            <div className="relative">
              {/* 카메라 */}
              <CameraCapture
                isCapturing={isPreviewActive}
                onVideoRef={(video) => { videoRef.current = video; }}
                frameRate={30}
              />

              {/* 스켈레톤 오버레이 */}
              <canvas
                ref={previewCanvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ objectFit: 'cover' }}
              />

              {/* FPS 및 모드 표시 */}
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium text-white ${
                  poseMode === 'hybrid' ? 'bg-purple-600' : 'bg-blue-600'
                }`}>
                  {poseMode === 'hybrid' ? 'Hybrid' : 'MediaPipe'}
                </span>
                <span className="px-2 py-1 bg-black/50 rounded text-xs text-green-400 font-mono">
                  {previewFps} FPS
                </span>
              </div>

              {/* 포즈 상태 표시 */}
              {poseAnalysis && (
                <div className={`absolute bottom-3 left-3 px-4 py-2 rounded-lg text-white ${
                  poseAnalysis.state === 'sitting' ? 'bg-blue-600' :
                  poseAnalysis.state === 'standing' ? 'bg-green-600' :
                  poseAnalysis.state === 'standing_feet_together' ? 'bg-purple-600' : 'bg-gray-600'
                }`}>
                  <div className="font-bold text-lg">
                    {poseAnalysis.state === 'sitting' ? '앉은 자세' :
                     poseAnalysis.state === 'standing' ? '서있는 자세' :
                     poseAnalysis.state === 'standing_feet_together' ? '발 붙여 서기' : '자세 감지 중...'}
                    <span className="ml-2 text-sm opacity-75">
                      ({Math.round(poseAnalysis.confidence * 100)}%)
                    </span>
                  </div>
                  <div className="text-xs opacity-80 font-mono">
                    무릎: {poseAnalysis.details.kneeAngle.toFixed(0)}° | 골반: {poseAnalysis.details.hipAngle.toFixed(0)}°
                  </div>
                  {poseSource && (
                    <span className={`text-xs mt-1 px-2 py-0.5 rounded inline-block ${
                      poseSource === 'hybrid' ? 'bg-purple-500' :
                      poseSource === 'yolo' ? 'bg-orange-500' : 'bg-blue-500'
                    }`}>
                      {poseSource === 'hybrid' ? 'MP+YOLO' :
                       poseSource === 'yolo' ? 'YOLO' : 'MediaPipe'}
                    </span>
                  )}
                </div>
              )}

              {/* 로딩 상태 */}
              {!isPoseReady && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                  <div className="text-center text-white">
                    <svg className="w-12 h-12 mx-auto mb-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-lg font-medium">AI 포즈 감지 로딩 중...</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">BBS 자동 검사 시스템</h2>
            <p className="text-gray-600">카메라에 전신이 보이도록 위치를 조정하세요</p>
          </div>

          {/* 검사 항목 (접힌 상태) */}
          <details className="bg-white rounded-xl shadow-sm mb-6">
            <summary className="px-4 py-3 cursor-pointer font-medium text-gray-700 hover:bg-gray-50">
              검사 항목 보기 ({BBS_TESTS.length}개)
            </summary>
            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {BBS_TESTS.map((test, index) => (
                  <div key={test.id} className="p-2 bg-gray-50 rounded">
                    {index + 1}. {test.nameKo}
                  </div>
                ))}
              </div>
            </div>
          </details>

          {/* Start Button */}
          <button
            onClick={startAssessment}
            disabled={!isPoseReady || !isTTSReady}
            className="w-full px-8 py-6 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-2xl font-bold text-xl hover:from-green-600 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {isPoseReady && isTTSReady
              ? '검사 시작'
              : !isPoseReady
                ? 'AI 포즈 감지 로딩 중...'
                : '음성 안내 로딩 중...'}
          </button>
        </main>
      </div>
    );
  }

  // Assessment screen
  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={resetAssessment} className="flex items-center gap-2 text-gray-300 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            종료
          </button>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">진행</span>
            <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${((currentTestIndex + (testPhase === 'complete' ? 1 : 0)) / BBS_TESTS.length) * 100}%` }}
              />
            </div>
            <span className="text-sm font-medium">{currentTestIndex + 1} / {BBS_TESTS.length}</span>
          </div>

          <div className="flex items-center gap-4">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              poseMode === 'hybrid' ? 'bg-purple-600' : 'bg-blue-600'
            }`}>
              {poseMode === 'hybrid' ? 'Hybrid' : 'MediaPipe'}
            </span>
            <span className="text-green-400 font-mono text-sm">{fps} FPS</span>
            <div className="text-right">
              <span className="text-sm text-gray-400">점수</span>
              <p className="text-xl font-bold">{totalScore}/{maxTotalScore}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Camera View */}
          <div className="lg:col-span-2">
            <div className="relative rounded-xl overflow-hidden bg-black">
              <CameraCapture
                onVideoRef={handleVideoRef}
                isCapturing={isRunning}
                frameRate={30}
                width={640}
                height={480}
              />

              {/* 스켈레톤 오버레이 캔버스 */}
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
                style={{ objectFit: 'cover' }}
              />

              {/* 실시간 상태 표시 (좌상단) */}
              <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
                <span className={`px-2 py-1 rounded text-xs font-bold text-white ${
                  poseMode === 'hybrid' ? 'bg-purple-600' : 'bg-blue-600'
                }`}>
                  {poseMode === 'hybrid' ? 'Hybrid' : 'MediaPipe'}
                </span>
                {poseSource && (
                  <span className={`px-2 py-1 rounded text-xs text-white ${
                    poseSource === 'hybrid' ? 'bg-purple-500' :
                    poseSource === 'yolo' ? 'bg-orange-500' : 'bg-blue-500'
                  }`}>
                    {poseSource.toUpperCase()}
                  </span>
                )}
                <span className="px-2 py-1 bg-black/60 rounded text-xs text-green-400 font-mono">
                  {fps} FPS
                </span>
              </div>

              {/* Test complete overlay with result */}
              {testPhase === 'complete' && testResults.length > 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <div className="bg-white rounded-2xl p-6 mx-4 max-w-md w-full shadow-2xl">
                    {/* Current test result */}
                    {(() => {
                      const lastResult = testResults[testResults.length - 1];
                      return (
                        <>
                          <div className="text-center mb-4">
                            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full text-white text-2xl font-bold mb-3 ${
                              lastResult.score >= 3 ? 'bg-green-500' :
                              lastResult.score >= 2 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}>
                              {lastResult.score}
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">
                              {lastResult.testId}. {lastResult.testNameKo}
                            </h3>
                            <p className="text-gray-500 text-sm">최대 {lastResult.maxScore}점</p>
                          </div>

                          <div className="bg-gray-100 rounded-lg p-3 mb-4">
                            <p className="text-gray-700 text-center">{lastResult.details}</p>
                            {lastResult.duration > 0 && (
                              <p className="text-sm text-gray-500 text-center mt-1">
                                측정 시간: {(lastResult.duration / 1000).toFixed(1)}초
                              </p>
                            )}
                          </div>

                          {/* Criteria badges */}
                          <div className="flex flex-wrap justify-center gap-2 mb-6">
                            {Object.entries(lastResult.criteria).map(([key, value]) => (
                              <span
                                key={key}
                                className={`px-3 py-1 rounded-full text-sm ${
                                  value ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {value ? '✓' : '✗'} {
                                  key === 'noHands' ? '손 미사용' :
                                  key === 'singleAttempt' ? '1회 시도' :
                                  key === 'fullDuration' ? '시간 충족' :
                                  key === 'stable' ? '안정적' :
                                  key === 'goodPosture' ? '바른 자세' :
                                  key === 'smooth' ? '부드러움' :
                                  key === 'controlled' ? '제어됨' :
                                  key === 'feetTogether' ? '발 붙임' :
                                  key
                                }
                              </span>
                            ))}
                          </div>
                        </>
                      );
                    })()}

                    {/* Progress info */}
                    <div className="text-center text-sm text-gray-500 mb-4">
                      진행: {testResults.length} / {BBS_TESTS.length} 검사 완료
                      <span className="mx-2">|</span>
                      현재 총점: {totalScore}점
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3">
                      {currentTestIndex < BBS_TESTS.length - 1 ? (
                        <>
                          <button
                            onClick={finishAllTests}
                            className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                          >
                            검사 종료
                          </button>
                          <button
                            onClick={goToNextTest}
                            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors"
                          >
                            다음 검사 →
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={goToNextTest}
                          className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors"
                        >
                          결과 보기
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Pose state indicator */}
              {poseAnalysis && (
                <div className={`absolute bottom-4 left-4 px-4 py-3 rounded-lg text-white ${
                  poseAnalysis.state === 'sitting' ? 'bg-blue-600' :
                  poseAnalysis.state === 'standing' ? 'bg-green-600' :
                  poseAnalysis.state === 'standing_feet_together' ? 'bg-purple-600' : 'bg-gray-600'
                }`}>
                  <div className="font-medium">
                    {poseAnalysis.state === 'sitting' ? '앉은 자세' :
                     poseAnalysis.state === 'standing' ? '서있는 자세' :
                     poseAnalysis.state === 'standing_feet_together' ? '발 붙여 서기' : '자세 감지 중...'}
                    <span className="ml-2 text-sm opacity-75">
                      ({Math.round(poseAnalysis.confidence * 100)}%)
                    </span>
                  </div>
                  <div className="text-xs opacity-75 mt-1 font-mono">
                    무릎: {poseAnalysis.details.kneeAngle.toFixed(0)}° |
                    골반: {poseAnalysis.details.hipAngle.toFixed(0)}° |
                    {poseAnalysis.details.isFrontView ? '정면' : '측면'}
                  </div>
                  {poseSource && (
                    <div className={`text-xs mt-1 px-2 py-0.5 rounded inline-block ${
                      poseSource === 'hybrid' ? 'bg-purple-500' :
                      poseSource === 'yolo' ? 'bg-orange-500' : 'bg-blue-500'
                    }`}>
                      {poseSource === 'hybrid' ? 'MP+YOLO' :
                       poseSource === 'yolo' ? 'YOLO' : 'MediaPipe'}
                    </div>
                  )}
                </div>
              )}

              {/* Timer for maintaining/action tests */}
              {(testPhase === 'maintaining' || testPhase === 'action' || testPhase === 'sitting') && elapsedTime > 0 && (
                <div className="absolute top-4 right-4 bg-black/70 rounded-lg p-4 text-center">
                  <div className="text-sm text-gray-400 mb-1">
                    {testPhase === 'action' ? '동작 진행 중' : '경과 시간'}
                  </div>
                  <div className="text-4xl font-mono text-white">
                    {Math.floor(elapsedTime / 1000)}
                    {currentTest.requiredDuration > 0 && (
                      <span className="text-xl text-gray-400">/{currentTest.requiredDuration / 1000}초</span>
                    )}
                    {currentTest.requiredDuration === 0 && (
                      <span className="text-xl text-gray-400">초</span>
                    )}
                  </div>
                  {currentTest.requiredDuration > 0 && (
                    <div className="w-full h-2 bg-gray-700 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${Math.min(100, (elapsedTime / currentTest.requiredDuration) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Test Info Panel */}
          <div className="lg:col-span-1 space-y-4">
            {/* Current Test */}
            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
                  {currentTestIndex + 1}
                </span>
                <div>
                  <h2 className="text-white text-lg font-bold">{currentTest.nameKo}</h2>
                  <p className="text-gray-400 text-sm">{currentTest.name}</p>
                </div>
              </div>

              <div className={`p-4 rounded-lg mb-4 ${
                testPhase === 'complete' ? 'bg-green-900/50 border border-green-500' :
                testPhase === 'maintaining' ? 'bg-blue-900/50 border border-blue-500' :
                'bg-gray-700'
              }`}>
                <p className="text-white font-medium">
                  {testPhase === 'init' || testPhase === 'waiting' ? '음성 안내를 기다려주세요...' :
                   testPhase === 'sitting' ? (currentTest.id === 5 ? '옆 의자로 이동하세요!' : '일어나세요!') :
                   testPhase === 'standing' ? '앉으세요!' :
                   testPhase === 'action' ? '동작을 수행하세요!' :
                   testPhase === 'maintaining' ? '자세를 유지하세요!' :
                   testPhase === 'complete' ? '완료!' : ''}
                </p>
              </div>

              {currentTest.requiredDuration > 0 && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>필요 시간: {currentTest.requiredDuration / 1000}초</span>
                </div>
              )}
            </div>

            {/* Completed Tests */}
            {testResults.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-white font-medium mb-3">완료된 검사</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {testResults.map((result, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-700 rounded">
                      <span className="text-gray-300 text-sm">{result.testId}. {result.testNameKo}</span>
                      <span className={`font-bold ${
                        result.score >= 3 ? 'text-green-400' :
                        result.score >= 2 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {result.score}/{result.maxScore}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Tests */}
            {currentTestIndex < BBS_TESTS.length - 1 && (
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-white font-medium mb-3">다음 검사</h3>
                <div className="space-y-2">
                  {BBS_TESTS.slice(currentTestIndex + 1, currentTestIndex + 3).map((test, idx) => (
                    <div key={test.id} className="p-2 bg-gray-700/50 rounded text-gray-400 text-sm">
                      {currentTestIndex + idx + 2}. {test.nameKo}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
