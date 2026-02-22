import { useCallback, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBBSAssessment } from '../hooks/useBBSAssessment';
import { LiveCamera } from '../components/bbs/LiveCamera';
import { TestProgress } from '../components/bbs/TestProgress';
import { TestInstructions } from '../components/bbs/TestInstructions';
import { ResultsSummary } from '../components/bbs/ResultsSummary';
import { BBS_TEST_ITEMS } from '../utils/bbs-test-items';
import type { YoloLandmarks } from '../hooks/usePoseDetection';

export function BBSLiveAssessment() {
  const navigate = useNavigate();
  // 수동 전환 모드: 검사 완료 후 결과 화면 표시, 다음 버튼으로 진행
  const assessment = useBBSAssessment({ autoTransition: false });

  // 환자 추적 리셋 카운터 (restart 시에만 증가)
  const [resetCount, setResetCount] = useState(0);
  const prevResetCount = useRef(resetCount);

  // 검사 재시작 시 환자 추적 리셋
  const handleRestart = useCallback(() => {
    setResetCount(c => c + 1);
    assessment.restart();
  }, [assessment]);

  // resetCount가 변경되었는지 확인 (리셋 트리거)
  const shouldResetPatient = resetCount !== prevResetCount.current;
  useEffect(() => {
    prevResetCount.current = resetCount;
  }, [resetCount]);

  const handleFrame = useCallback((landmarks: YoloLandmarks, timestamp: number) => {
    assessment.addFrame(landmarks, timestamp);
  }, [assessment]);

  // Results screen
  if (assessment.isComplete) {
    return (
      <ResultsSummary
        results={assessment.results}
        totalScore={assessment.totalScore}
        onRestart={handleRestart}
        onHome={() => navigate('/')}
      />
    );
  }

  // 검사 완료 후 결과 표시 화면
  if (assessment.isShowingResult && assessment.lastResult) {
    const result = assessment.lastResult;
    const getScoreColor = (score: number) => {
      if (score >= 4) return 'text-green-400';
      if (score >= 3) return 'text-blue-400';
      if (score >= 2) return 'text-yellow-400';
      return 'text-red-400';
    };

    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="max-w-lg w-full mx-4">
          <div className="bg-gray-800 rounded-2xl p-8 text-center">
            {/* 검사 번호 및 이름 */}
            <div className="mb-6">
              <span className="inline-block px-4 py-2 bg-blue-600 rounded-full text-white text-sm font-medium mb-3">
                검사 {result.testId} / 14
              </span>
              <h2 className="text-2xl font-bold text-white">{result.testNameKo}</h2>
            </div>

            {/* 점수 표시 */}
            <div className="mb-8">
              <div className={`text-8xl font-bold ${getScoreColor(result.score)} mb-2`}>
                {result.score}
              </div>
              <div className="text-2xl text-gray-400">/ 4점</div>
            </div>

            {/* 평가 설명 */}
            <div className="mb-8 p-4 bg-gray-700 rounded-lg">
              <p className="text-gray-300">{result.reasoning}</p>
            </div>

            {/* 현재 총점 */}
            <div className="mb-8 text-gray-400">
              현재 총점: <span className="text-white font-bold text-xl">{assessment.totalScore}</span> / 56
            </div>

            {/* 버튼들 */}
            <div className="flex gap-4">
              <button
                onClick={assessment.confirmNext}
                className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors"
              >
                {assessment.currentTestIndex >= 13 ? '결과 보기' : '다음 검사'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Ready screen
  if (assessment.isReady) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Home
            </button>
            <h1 className="text-xl font-bold text-gray-900">Real-time BBS Assessment</h1>
            <div className="w-20" />
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-12">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              14 BBS Tests
            </h2>
            <p className="text-gray-600 text-lg">
              AI will automatically detect poses and score each test in real-time.
            </p>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-xl p-8 text-white text-center">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>

            <h3 className="text-2xl font-bold mb-4">Auto Sequential Assessment</h3>
            <p className="opacity-90 mb-6 max-w-md mx-auto">
              Stand in front of the camera and follow the instructions.
              The assessment will automatically proceed through all 14 tests.
            </p>

            <ul className="text-sm opacity-80 mb-8 space-y-2 max-w-sm mx-auto text-left">
              <li className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Real-time skeleton display
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Automatic pose detection
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                AI-powered scoring
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Complete results report
              </li>
            </ul>

            <button
              onClick={assessment.start}
              className="px-8 py-4 bg-white text-blue-600 rounded-xl font-bold text-lg hover:bg-gray-100 transition-colors shadow-lg"
            >
              Start Assessment
            </button>
          </div>

          {/* Test Overview */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
            {BBS_TEST_ITEMS.map((test) => (
              <div key={test.id} className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">
                    {test.id}
                  </span>
                  <span className="text-sm font-medium text-gray-900 truncate">{test.nameKo}</span>
                </div>
                {test.timeRequirement && (
                  <span className="text-xs text-gray-500">{test.timeRequirement}s</span>
                )}
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // Assessment in progress
  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleRestart}
              className="flex items-center gap-2 text-gray-300 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Exit
            </button>

            {/* 건너뛰기 버튼 */}
            <button
              onClick={assessment.skipTest}
              className="px-3 py-1.5 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 transition-colors"
            >
              건너뛰기 (4점)
            </button>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">Progress</span>
            <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${((assessment.currentTestIndex) / 14) * 100}%` }}
              />
            </div>
            <span className="text-sm font-medium">
              {assessment.currentTestIndex + 1} / 14
            </span>
          </div>

          <div className="text-right">
            <span className="text-sm text-gray-400">Total</span>
            <p className="text-xl font-bold">{assessment.totalScore}/56</p>
          </div>
        </div>
      </header>

      {/* Countdown Overlay */}
      {(assessment.phase === 'countdown' || assessment.phase === 'transitioning') && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="text-9xl font-bold text-white mb-4">
              {assessment.countdownValue}
            </div>
            <p className="text-xl text-white/80">
              {assessment.phase === 'transitioning'
                ? `Next: ${assessment.currentTestIndex + 2}. ${BBS_TEST_ITEMS[assessment.currentTestIndex + 1]?.nameKo}`
                : 'Get ready...'}
            </p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Camera View */}
          <div className="lg:col-span-2">
            <LiveCamera
              onFrame={handleFrame}
              isActive={assessment.isCapturing}
              resetPatientTracking={shouldResetPatient}
            />

            <TestProgress
              currentTest={assessment.currentTest}
              currentIndex={assessment.currentTestIndex}
              progress={assessment.progress}
              interimScore={assessment.interimScore}
              frameCount={assessment.frameCount}
              remainingSec={assessment.remainingSec}
              holdTimeSec={assessment.holdTimeSec}
              testDurationSec={assessment.testDurationSec}
              minHoldSec={assessment.minHoldSec}
              useTimer={assessment.useTimer}
              timerStarted={assessment.timerStarted}
              waitingForInitialPose={assessment.waitingForInitialPose}
              initialPoseDetected={assessment.initialPoseDetected}
              currentPoseState={assessment.currentPoseState}
              currentCaption={assessment.currentCaption}
              debugInfo={assessment.debugInfo}
            />
          </div>

          {/* Instructions Panel */}
          <div className="lg:col-span-1">
            <TestInstructions
              currentTest={assessment.currentTest}
              currentIndex={assessment.currentTestIndex}
              completedResults={assessment.results}
              totalScore={assessment.totalScore}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
