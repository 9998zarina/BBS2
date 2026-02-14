import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CameraCapture } from '../components/camera/CameraCapture';
import { useMediaPipePose, type PoseResult } from '../hooks/useMediaPipePose';
import { realtimeApi, type ContinuousAnalysisResponse } from '../services/api';
import { BBS_TEST_ITEMS } from '../utils/bbs-test-items';

type AssessmentMode = 'select' | 'single' | 'auto';
type CaptureState = 'idle' | 'ready' | 'capturing' | 'analyzing' | 'complete' | 'paused';

interface CapturedFrame {
  landmarks: Record<string, unknown> | null;
  timestamp: number;
}

interface TestResult {
  testId: number;
  testNameKo: string;
  score: number;
  confidence: number;
  reasoning: string;
  criteriaMet: Record<string, boolean>;
}

export function CameraAssessmentPage() {
  const navigate = useNavigate();

  // MediaPipe hook
  const {
    initialize: initializeMediaPipe,
    detectPose,
    drawSkeleton,
    toYoloFormat,
    isReady: isMediaPipeReady,
    isLoading: isMediaPipeLoading,
  } = useMediaPipePose();

  // Mode selection
  const [mode, setMode] = useState<AssessmentMode>('select');

  // Test tracking
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  // Capture state
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [currentPose, setCurrentPose] = useState<PoseResult | null>(null);
  const [capturedFrames, setCapturedFrames] = useState<CapturedFrame[]>([]);
  const [continuousResult, setContinuousResult] = useState<ContinuousAnalysisResponse | null>(null);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [captureTime, setCaptureTime] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [fps, setFps] = useState(0);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<number | null>(null);
  const analysisIntervalRef = useRef<number | null>(null);
  const framesBufferRef = useRef<CapturedFrame[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const currentTest = BBS_TEST_ITEMS[currentTestIndex];
  const totalScore = testResults.reduce((sum, r) => sum + r.score, 0);

  // Initialize MediaPipe on mount
  useEffect(() => {
    initializeMediaPipe();
  }, [initializeMediaPipe]);

  // Real-time MediaPipe pose detection loop
  useEffect(() => {
    if (!isMediaPipeReady || captureState !== 'capturing' || !videoRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const video = videoRef.current;
    let lastFpsUpdate = performance.now();
    let frameCount = 0;

    const processFrame = () => {
      if (captureState !== 'capturing') return;

      const now = performance.now();

      // Detect pose with MediaPipe
      const result = detectPose(video, now);

      if (result) {
        setCurrentPose(result);

        // Draw skeleton on canvas
        if (canvasRef.current && video.videoWidth && video.videoHeight) {
          drawSkeleton(canvasRef.current, result, video.videoWidth, video.videoHeight);
        }

        // Collect frames for scoring (using MediaPipe landmarks in YOLO format)
        const yoloLandmarks = toYoloFormat(result);

        // Scale landmarks to pixel coordinates
        const scaledLandmarks: Record<string, {x: number; y: number; z: number; visibility: number}> = {};
        for (const [name, lm] of Object.entries(yoloLandmarks)) {
          scaledLandmarks[name] = {
            x: lm.x * (video.videoWidth || 640),
            y: lm.y * (video.videoHeight || 480),
            z: lm.z,
            visibility: lm.visibility,
          };
        }

        const newFrame = { landmarks: scaledLandmarks, timestamp: now };
        framesBufferRef.current = [...framesBufferRef.current, newFrame].slice(-100);
        setCapturedFrames(prev => [...prev, newFrame].slice(-100));
      }

      // FPS calculation
      frameCount++;
      if (now - lastFpsUpdate >= 1000) {
        setFps(frameCount);
        frameCount = 0;
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
  }, [isMediaPipeReady, captureState, detectPose, drawSkeleton, toYoloFormat]);

  // Continuous analysis for real-time scoring (both auto and single mode)
  useEffect(() => {
    if (captureState !== 'capturing') {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
      return;
    }

    // Run backend analysis every 300ms for real-time scoring
    analysisIntervalRef.current = window.setInterval(async () => {
      if (framesBufferRef.current.length < 10) return;

      try {
        const frames = framesBufferRef.current.map(f => ({
          landmarks: f.landmarks,
          timestamp_ms: f.timestamp,
        }));

        const result = await realtimeApi.analyzeContinuous(
          frames,
          currentTest.id,
          (currentTest.timeRequirement || 3) * 1000
        );

        setContinuousResult(result);

        // Auto mode: automatically move to next test when complete
        if (mode === 'auto' && result.action_complete && result.score !== null) {
          const newResult: TestResult = {
            testId: currentTest.id,
            testNameKo: currentTest.nameKo,
            score: result.score,
            confidence: result.scoring_confidence || 0,
            reasoning: result.reasoning || '',
            criteriaMet: result.criteria_met || {},
          };

          setTestResults(prev => [...prev, newResult]);
          framesBufferRef.current = [];
          setCapturedFrames([]);

          if (currentTestIndex < BBS_TEST_ITEMS.length - 1) {
            setCaptureState('paused');
            setCountdown(5);
          } else {
            setCaptureState('complete');
          }
        }
      } catch (err) {
        console.error('Continuous analysis error:', err);
      }
    }, 300);  // Faster interval for more responsive scoring

    return () => {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
      }
    };
  }, [mode, captureState, currentTest, currentTestIndex]);

  // Countdown timer for pause between tests
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);

      if (countdown === 1) {
        setCurrentTestIndex(prev => prev + 1);
        setCaptureState('capturing');
        setCountdown(null);
        setContinuousResult(null);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  // Capture timer
  useEffect(() => {
    if (captureState === 'capturing') {
      timerRef.current = window.setInterval(() => {
        setCaptureTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [captureState]);

  // Video ref callback
  const handleVideoRef = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
  }, []);

  // Start auto mode
  const startAutoMode = useCallback(() => {
    setMode('auto');
    setCurrentTestIndex(0);
    setTestResults([]);
    setCapturedFrames([]);
    framesBufferRef.current = [];
    setError(null);
    setCaptureTime(0);
    setCaptureState('ready');

    setCountdown(3);
    setTimeout(() => {
      setCountdown(null);
      setCaptureState('capturing');
    }, 3000);
  }, []);

  // Start single test mode
  const startSingleMode = useCallback((testId: number) => {
    const testIndex = BBS_TEST_ITEMS.findIndex(t => t.id === testId);
    if (testIndex === -1) return;

    setMode('single');
    setCurrentTestIndex(testIndex);
    setCapturedFrames([]);
    framesBufferRef.current = [];
    setError(null);
    setCaptureTime(0);
    setCaptureState('capturing');
  }, []);

  // Stop and analyze (for single mode)
  const stopAndAnalyze = useCallback(async () => {
    setCaptureState('analyzing');

    if (capturedFrames.length < 10) {
      setError('충분한 프레임이 캡처되지 않았습니다.');
      setCaptureState('idle');
      return;
    }

    try {
      const frames = capturedFrames.map(f => ({
        landmarks: f.landmarks,
        timestamp_ms: f.timestamp,
      }));

      const result = await realtimeApi.analyzeSession(frames, currentTest.id);

      const newResult: TestResult = {
        testId: currentTest.id,
        testNameKo: currentTest.nameKo,
        score: result.score,
        confidence: result.scoring_confidence,
        reasoning: result.reasoning,
        criteriaMet: result.criteria_met,
      };

      setTestResults([newResult]);
      setCaptureState('complete');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '분석 오류';
      setError(errorMessage);
      setCaptureState('idle');
    }
  }, [capturedFrames, currentTest]);

  // Reset
  const resetAssessment = useCallback(() => {
    setMode('select');
    setCaptureState('idle');
    setCurrentTestIndex(0);
    setTestResults([]);
    setCapturedFrames([]);
    framesBufferRef.current = [];
    setError(null);
    setCaptureTime(0);
    setCountdown(null);
    setContinuousResult(null);
    setCurrentPose(null);
  }, []);

  // Mode selection screen
  if (mode === 'select') {
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
            <h1 className="text-xl font-bold text-gray-900">실시간 카메라 BBS 평가</h1>
            <div className="w-20" />
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-12">
          {/* MediaPipe Status */}
          <div className="mb-8 p-4 bg-white rounded-lg shadow-sm">
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${
                isMediaPipeReady ? 'bg-green-500' :
                isMediaPipeLoading ? 'bg-yellow-500 animate-pulse' : 'bg-gray-400'
              }`} />
              <span className="text-sm text-gray-600">
                {isMediaPipeReady ? 'MediaPipe 준비 완료 (빠른 실시간 분석)' :
                 isMediaPipeLoading ? 'MediaPipe 로딩 중...' : 'MediaPipe 대기 중'}
              </span>
            </div>
          </div>

          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">평가 모드 선택</h2>
            <p className="text-gray-600">하이브리드 AI: MediaPipe (실시간) + YOLO (정밀 채점)</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Auto Sequential Mode */}
            <div className="bg-gradient-to-br from-green-500 to-teal-600 rounded-2xl shadow-lg p-8 text-white">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-6">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-4">자동 순차 평가</h3>
              <p className="opacity-90 mb-6">
                14가지 BBS 검사를 순서대로 자동 진행합니다.
                실시간으로 동작을 감지하고 자동 채점합니다.
              </p>
              <ul className="text-sm opacity-80 mb-6 space-y-1">
                <li>✓ 실시간 스켈레톤 표시 (30fps)</li>
                <li>✓ 동작 자동 감지</li>
                <li>✓ AI 자동 채점</li>
                <li>✓ 전체 결과 리포트</li>
              </ul>
              <button
                onClick={startAutoMode}
                disabled={!isMediaPipeReady}
                className="w-full px-6 py-3 bg-white text-green-600 rounded-lg font-bold hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isMediaPipeReady ? '자동 평가 시작' : 'MediaPipe 로딩 중...'}
              </button>
            </div>

            {/* Single Test Mode */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">개별 검사 선택</h3>
              <p className="text-gray-600 mb-6">
                특정 검사 항목을 선택하여 개별적으로 평가합니다.
              </p>
              <div className="max-h-64 overflow-y-auto space-y-2 mb-4">
                {BBS_TEST_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => startSingleMode(item.id)}
                    disabled={!isMediaPipeReady}
                    className="w-full p-3 text-left rounded-lg bg-gray-50 hover:bg-blue-50 hover:border-blue-300 border-2 border-transparent transition-colors disabled:opacity-50"
                  >
                    <span className="font-medium text-gray-900">{item.id}. {item.nameKo}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Complete screen (results)
  if (captureState === 'complete') {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <button onClick={resetAssessment} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              다시 평가
            </button>
            <h1 className="text-xl font-bold text-gray-900">평가 결과</h1>
            <div className="w-20" />
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-8">
          {/* Total Score */}
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">BBS 총점</h2>
            <div className={`text-6xl font-bold mb-4 ${
              totalScore >= 41 ? 'text-green-600' :
              totalScore >= 21 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {totalScore} / {mode === 'auto' ? 56 : 4}
            </div>
            <p className="text-gray-600">
              {totalScore >= 41 ? '낙상 위험 낮음' :
               totalScore >= 21 ? '낙상 위험 중간 - 보조 장비 권장' :
               '낙상 위험 높음 - 휠체어 사용 권장'}
            </p>
          </div>

          {/* Individual Results */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">검사별 결과</h3>
            <div className="space-y-4">
              {testResults.map((result, index) => (
                <div key={index} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">
                      {result.testId}. {result.testNameKo}
                    </span>
                    <span className={`text-xl font-bold ${
                      result.score >= 3 ? 'text-green-600' :
                      result.score >= 2 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {result.score}/4
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{result.reasoning}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 mt-8">
            <button
              onClick={resetAssessment}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              다시 평가하기
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300"
            >
              홈으로
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Capture screen
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

          {mode === 'auto' && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">진행률</span>
              <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${((currentTestIndex + (continuousResult?.action_complete ? 1 : 0)) / 14) * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium">
                {currentTestIndex + 1} / 14
              </span>
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-400">
              <span className="text-green-400 font-mono">{fps} FPS</span>
            </div>
            <div className="text-right">
              <span className="text-sm text-gray-400">총점</span>
              <p className="text-xl font-bold">{totalScore}/{mode === 'auto' ? 56 : 4}</p>
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
                isCapturing={captureState === 'capturing'}
                frameRate={30}
                width={640}
                height={480}
              />

              {/* Skeleton overlay (MediaPipe draws directly on this) */}
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
              />

              {/* Countdown overlay */}
              {countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <div className="text-center">
                    <div className="text-8xl font-bold text-white mb-4">{countdown}</div>
                    <p className="text-xl text-white/80">
                      {captureState === 'paused' ? '다음 검사 준비...' : '검사 시작 준비...'}
                    </p>
                  </div>
                </div>
              )}

              {/* Timer */}
              {captureState === 'capturing' && (
                <div className="absolute top-4 right-4 bg-black/70 text-white px-4 py-2 rounded-lg font-mono text-xl">
                  {Math.floor(captureTime / 60).toString().padStart(2, '0')}:
                  {(captureTime % 60).toString().padStart(2, '0')}
                </div>
              )}

              {/* Recording indicator */}
              {captureState === 'capturing' && (
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  <span className="text-sm font-medium">REC</span>
                </div>
              )}

              {/* Pose detection indicator */}
              {captureState === 'capturing' && (
                <div className={`absolute bottom-4 left-4 flex items-center gap-2 px-3 py-2 rounded-lg ${
                  currentPose ? 'bg-green-600' : 'bg-yellow-600'
                } text-white`}>
                  <span className={`w-3 h-3 rounded-full ${
                    currentPose ? 'bg-green-300' : 'bg-yellow-300 animate-pulse'
                  }`} />
                  <span className="text-sm font-medium">
                    {currentPose
                      ? `포즈 감지됨 (${capturedFrames.length} 프레임)`
                      : '사람을 찾는 중...'}
                  </span>
                </div>
              )}

              {/* AI Engine indicator */}
              {captureState === 'capturing' && (
                <div className="absolute bottom-4 right-4 bg-blue-600/80 text-white px-3 py-1 rounded-lg text-xs">
                  MediaPipe + YOLO Hybrid
                </div>
              )}
            </div>

            {/* Real-time Score Display */}
            {captureState === 'capturing' && (
              <div className="mt-4 p-4 bg-gray-800 rounded-lg">
                {/* Large Score Display */}
                <div className="flex items-center justify-center gap-6 mb-4">
                  <div className="text-center">
                    <div className="text-sm text-gray-400 mb-1">실시간 점수</div>
                    <div className={`text-5xl font-bold transition-all ${
                      continuousResult?.interim_score != null
                        ? (continuousResult.interim_score >= 3 ? 'text-green-400' :
                           continuousResult.interim_score >= 2 ? 'text-yellow-400' : 'text-red-400')
                        : 'text-gray-500'
                    }`}>
                      {continuousResult?.interim_score != null ? continuousResult.interim_score : '-'}
                      <span className="text-2xl text-gray-400">/4</span>
                    </div>
                  </div>
                  <div className="h-16 w-px bg-gray-700" />
                  <div className="text-center">
                    <div className="text-sm text-gray-400 mb-1">경과 시간</div>
                    <div className="text-3xl font-mono text-white">
                      {continuousResult ? (continuousResult.duration_ms / 1000).toFixed(1) : '0.0'}
                      <span className="text-lg text-gray-400">초</span>
                    </div>
                  </div>
                </div>

                {/* Feedback Message */}
                <div className={`text-center font-medium mb-3 ${
                  continuousResult?.action_complete ? 'text-green-400' :
                  continuousResult?.action_detected ? 'text-blue-400' : 'text-yellow-400'
                }`}>
                  {continuousResult?.feedback || '동작을 준비해주세요...'}
                </div>

                {/* Progress Bar */}
                <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      continuousResult?.action_complete ? 'bg-green-500' :
                      continuousResult?.action_detected ? 'bg-blue-500' : 'bg-gray-500'
                    }`}
                    style={{ width: `${continuousResult?.progress_percent || 0}%` }}
                  />
                </div>

                {/* Scoring Reasoning (if available) */}
                {continuousResult?.reasoning && (
                  <div className="mt-3 p-2 bg-gray-700/50 rounded text-sm text-gray-300">
                    {continuousResult.reasoning}
                  </div>
                )}
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="mt-4 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-300">
                {error}
              </div>
            )}

            {/* Single mode controls */}
            {mode === 'single' && captureState === 'capturing' && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={stopAndAnalyze}
                  className="px-8 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" />
                  </svg>
                  촬영 종료 및 분석
                </button>
              </div>
            )}
          </div>

          {/* Test Info Panel */}
          <div className="lg:col-span-1 space-y-4">
            {/* Current Test */}
            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                  {currentTest.id}
                </span>
                <div>
                  <h2 className="text-white font-bold">{currentTest.nameKo}</h2>
                  <p className="text-gray-400 text-sm">{currentTest.name}</p>
                </div>
              </div>
              <p className="text-gray-300 text-sm mb-4">{currentTest.instructionsKo}</p>
              {currentTest.timeRequirement && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>필요 시간: {currentTest.timeRequirement}초</span>
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
                        {result.score}/4
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Tests (auto mode) */}
            {mode === 'auto' && currentTestIndex < BBS_TEST_ITEMS.length - 1 && (
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-white font-medium mb-3">다음 검사</h3>
                <div className="space-y-2">
                  {BBS_TEST_ITEMS.slice(currentTestIndex + 1, currentTestIndex + 4).map((item) => (
                    <div key={item.id} className="p-2 bg-gray-700/50 rounded text-gray-400 text-sm">
                      {item.id}. {item.nameKo}
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
