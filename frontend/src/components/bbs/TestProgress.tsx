import type { BBSTestItem } from '../../types';
import type { PoseDebugInfo } from '../../hooks/useBBSAssessment';

interface TestProgressProps {
  currentTest: BBSTestItem;
  currentIndex: number;
  progress: number;
  interimScore: number | null;
  frameCount: number;
  // Timer props
  remainingSec: number;
  holdTimeSec: number;
  testDurationSec: number;
  minHoldSec: number;
  useTimer: boolean;
  // Pose waiting props
  timerStarted: boolean;
  waitingForInitialPose: boolean;
  initialPoseDetected: boolean;
  currentPoseState: 'sitting' | 'standing' | 'unknown';
  // 실시간 자막
  currentCaption: string;
  // 디버그 정보
  debugInfo?: PoseDebugInfo | null;
}

export function TestProgress({
  currentTest,
  currentIndex,
  progress: _progress,
  interimScore,
  frameCount: _frameCount,
  remainingSec,
  holdTimeSec,
  testDurationSec,
  minHoldSec,
  useTimer,
  timerStarted,
  waitingForInitialPose,
  initialPoseDetected,
  currentPoseState,
  currentCaption,
  debugInfo,
}: TestProgressProps) {
  // Note: progress and frameCount kept for API compatibility
  void _progress;
  void _frameCount;
  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-gray-400';
    if (score >= 4) return 'text-green-400';
    if (score >= 3) return 'text-blue-400';
    if (score >= 2) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="bg-gray-800 rounded-xl p-4 mt-4">
      {/* 실시간 자막 - 큰 글씨로 표시 */}
      {currentCaption && (
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl text-center">
          <div className="text-4xl font-bold text-white animate-pulse">
            {currentCaption}
          </div>
        </div>
      )}

      {/* Score Display */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-center flex-1">
          <div className="text-sm text-gray-400 mb-1">Real-time Score</div>
          <div className={`text-5xl font-bold ${getScoreColor(interimScore)}`}>
            {interimScore !== null ? interimScore : '-'}
            <span className="text-xl text-gray-500">/4</span>
          </div>
        </div>

        <div className="h-14 w-px bg-gray-700" />

        <div className="text-center flex-1">
          <div className="text-sm text-gray-400 mb-1">Overall Progress</div>
          <div className="text-3xl font-bold text-white">
            {currentIndex + 1}
            <span className="text-lg text-gray-500">/14</span>
          </div>
        </div>

        {useTimer ? (
          <>
            <div className="h-14 w-px bg-gray-700" />
            <div className="text-center flex-1">
              <div className="text-sm text-gray-400 mb-1">Timer</div>
              <div className={`text-3xl font-mono font-bold ${remainingSec <= 10 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                {Math.floor(remainingSec / 60)}:{String(Math.floor(remainingSec % 60)).padStart(2, '0')}
              </div>
            </div>

            {minHoldSec > 0 && (
              <>
                <div className="h-14 w-px bg-gray-700" />
                <div className="text-center flex-1">
                  <div className="text-sm text-gray-400 mb-1">Hold Time</div>
                  <div className={`text-2xl font-mono font-bold ${holdTimeSec >= minHoldSec ? 'text-green-400' : 'text-yellow-400'}`}>
                    {Math.floor(holdTimeSec)}s
                    <span className="text-sm text-gray-500">/{minHoldSec}s</span>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="h-14 w-px bg-gray-700" />
            <div className="text-center flex-1">
              <div className="text-sm text-gray-400 mb-1">Status</div>
              <div className="text-xl font-bold text-blue-400">
                동작 감지 중
              </div>
            </div>
          </>
        )}
      </div>

      {/* Pose Status - 자세 대기 상태 표시 */}
      {!timerStarted && (
        <div className="mb-4 p-3 rounded-lg bg-gray-700/50 text-center">
          {waitingForInitialPose ? (
            <div className="flex items-center justify-center gap-3">
              {/* 1번 검사: 앉은 자세 대기 */}
              {currentIndex === 0 && (
                <>
                  <div className={`w-4 h-4 rounded-full ${currentPoseState === 'sitting' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                  <span className="text-lg text-yellow-300">
                    {currentPoseState === 'sitting' ? '앉은 자세 확인됨!' : '의자에 앉아주세요'}
                  </span>
                </>
              )}
              {/* 4번 검사: 서있는 자세 대기 */}
              {currentIndex === 3 && (
                <>
                  <div className={`w-4 h-4 rounded-full ${currentPoseState === 'standing' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                  <span className="text-lg text-yellow-300">
                    {currentPoseState === 'standing' ? '서있는 자세 확인됨!' : '일어나서 서주세요'}
                  </span>
                </>
              )}
              {/* 타이머 검사: 앉은 자세 대기 */}
              {useTimer && minHoldSec > 0 && (
                <>
                  <div className={`w-4 h-4 rounded-full ${currentPoseState === 'sitting' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                  <span className="text-lg text-yellow-300">
                    {currentPoseState === 'sitting' ? '앉은 자세 확인됨!' : '의자에 앉아주세요'}
                  </span>
                </>
              )}
            </div>
          ) : initialPoseDetected ? (
            <div className="flex items-center justify-center gap-3">
              {/* 1번 검사: 일어서기 대기 */}
              {currentIndex === 0 && (
                <>
                  <div className={`w-4 h-4 rounded-full ${currentPoseState === 'standing' ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`} />
                  <span className="text-lg text-blue-300">
                    {currentPoseState === 'standing' ? '일어섰습니다!' : '이제 일어나세요!'}
                  </span>
                </>
              )}
              {/* 4번 검사: 앉기 대기 */}
              {currentIndex === 3 && (
                <>
                  <div className={`w-4 h-4 rounded-full ${currentPoseState === 'sitting' ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`} />
                  <span className="text-lg text-blue-300">
                    {currentPoseState === 'sitting' ? '앉았습니다!' : '이제 앉으세요!'}
                  </span>
                </>
              )}
              {/* 타이머 검사: 일어서기 대기 */}
              {useTimer && minHoldSec > 0 && (
                <>
                  <div className={`w-4 h-4 rounded-full ${currentPoseState === 'standing' ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`} />
                  <span className="text-lg text-blue-300">
                    {currentPoseState === 'standing' ? '일어섬 - 타이머 시작!' : '이제 일어나세요!'}
                  </span>
                </>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Progress Bar - 타이머 검사만 표시 */}
      {useTimer && (
        <div className="mb-2">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Test {currentIndex + 1}: {currentTest.nameKo}</span>
            <span>{timerStarted ? `${testDurationSec - Math.floor(remainingSec)}s / ${testDurationSec}s` : '대기 중...'}</span>
          </div>
          <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                !timerStarted ? 'bg-gray-600' : remainingSec <= 0 ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: timerStarted ? `${Math.min(100, ((testDurationSec - remainingSec) / testDurationSec) * 100)}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* 동작 감지 검사 안내 */}
      {!useTimer && (
        <div className="mb-2 text-center">
          <span className="text-sm text-gray-400">Test {currentIndex + 1}: {currentTest.nameKo}</span>
        </div>
      )}

      {/* Min Hold Warning */}
      {useTimer && minHoldSec > 0 && holdTimeSec < minHoldSec && timerStarted && (
        <div className="text-xs text-yellow-400 text-center mt-1">
          {minHoldSec - Math.floor(holdTimeSec)}초 더 자세를 유지하세요
        </div>
      )}

      {/* Overall Progress Dots */}
      <div className="flex gap-1 justify-center mt-4">
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i < currentIndex
                ? 'bg-green-500'
                : i === currentIndex
                ? 'bg-blue-500 animate-pulse'
                : 'bg-gray-600'
            }`}
          />
        ))}
      </div>

      {/* Debug Info Panel */}
      {debugInfo && (
        <div className="mt-4 p-3 bg-gray-900 rounded-lg border border-gray-700">
          <div className="text-xs text-gray-500 mb-2">Debug Info (비율 기반)</div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="text-center">
              <div className="text-gray-400">무릎각도</div>
              <div className={`font-mono font-bold ${debugInfo.kneeAngle > 145 ? 'text-green-400' : debugInfo.kneeAngle < 120 ? 'text-red-400' : 'text-yellow-400'}`}>
                {debugInfo.kneeAngle.toFixed(0)}°
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">다리비율</div>
              <div className={`font-mono font-bold text-lg ${debugInfo.legRatio > 0.7 ? 'text-green-400' : debugInfo.legRatio < 0.5 ? 'text-red-400' : 'text-yellow-400'}`}>
                {debugInfo.legRatio.toFixed(2)}
              </div>
              <div className="text-xs text-gray-500">
                {debugInfo.legRatio > 0.8 ? '서있음' : debugInfo.legRatio < 0.5 ? '앉음' : '중간'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">엉덩이각도</div>
              <div className={`font-mono font-bold ${debugInfo.hipAngle > 150 ? 'text-green-400' : 'text-yellow-400'}`}>
                {debugInfo.hipAngle.toFixed(0)}°
              </div>
            </div>
          </div>
          <div className="mt-2 flex justify-center gap-3 text-xs">
            <span className={`px-2 py-1 rounded font-bold ${debugInfo.isStandingByRatio ? 'bg-green-600' : 'bg-red-600'}`}>
              비율: {debugInfo.isStandingByRatio ? '서있음' : '앉음'}
            </span>
            <span className={`px-2 py-1 rounded font-bold ${currentPoseState === 'standing' ? 'bg-green-600' : currentPoseState === 'sitting' ? 'bg-blue-600' : 'bg-gray-600'}`}>
              최종: {currentPoseState === 'standing' ? '서있음' : currentPoseState === 'sitting' ? '앉음' : '?'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
