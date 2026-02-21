import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { VideoUploader } from '../components/video/VideoUploader';
import { DualVideoPlayer } from '../components/video/DualVideoPlayer';
import { videoApi } from '../services/api';
import { useAudioSync } from '../hooks/useAudioSync';
import { useLocalVideoAnalysis } from '../hooks/useLocalVideoAnalysis';
import type { VideoUploadResponse } from '../types';
import { BBS_TEST_ITEMS } from '../utils/bbs-test-items';

// Local analysis result type
interface LocalAnalysisResult {
  detectedTestId: number;
  detectedTestName: string;
  detectedTestNameKo: string;
  score: number;
  confidence: number;
  reasoning: string;
  criteriaMet: Record<string, boolean>;
  framesAnalyzed: number;
}

export function AutoAnalysisPage() {
  const navigate = useNavigate();
  const { calculateSync, syncing, progress: syncProgress } = useAudioSync();
  const { analyzeVideo, analyzing, progress: analysisProgress, error: analysisError, reset: resetAnalysis } = useLocalVideoAnalysis();

  const [frontVideoId, setFrontVideoId] = useState<string | null>(null);
  const [sideVideoId, setSideVideoId] = useState<string | null>(null);
  const [syncOffsetMs, setSyncOffsetMs] = useState<number>(0);
  const [syncConfidence, setSyncConfidence] = useState<number | null>(null);
  const [result, setResult] = useState<LocalAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFrontVideoUpload = useCallback((response: VideoUploadResponse) => {
    setFrontVideoId(response.id);
    setResult(null);
    setError(null);
    setSyncOffsetMs(0);
    setSyncConfidence(null);
  }, []);

  const handleSideVideoUpload = useCallback(async (response: VideoUploadResponse) => {
    setSideVideoId(response.id);

    // 정면 영상이 있으면 자동 오디오 싱크 계산
    if (frontVideoId) {
      try {
        const frontUrl = videoApi.getVideoUrl(frontVideoId);
        const sideUrl = videoApi.getVideoUrl(response.id);

        const syncResult = await calculateSync(frontUrl, sideUrl);
        setSyncOffsetMs(syncResult.offsetMs);
        setSyncConfidence(syncResult.confidence);
      } catch (err) {
        console.error('오디오 싱크 실패:', err);
        // 실패해도 계속 진행 (오프셋 0으로)
      }
    }
  }, [frontVideoId, calculateSync]);

  const handleAutoAnalyze = async () => {
    if (!frontVideoId) return;

    setError(null);
    setResult(null);
    resetAnalysis();

    try {
      // 로컬 분석 (빠름!)
      const videoUrl = videoApi.getVideoUrl(frontVideoId);
      const analysisResult = await analyzeVideo(videoUrl);

      if (analysisResult) {
        setResult(analysisResult);
      } else if (analysisError) {
        setError(analysisError);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.');
    }
  };

  const getTestItem = (testId: number) => {
    return BBS_TEST_ITEMS.find(item => item.id === testId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-900">자동 BBS 분석</h1>
          </div>
          <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
            AI 자동 인식
          </span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* 설명 */}
        <div className="bg-gradient-to-r from-purple-500 to-blue-500 rounded-2xl p-6 text-white">
          <h2 className="text-2xl font-bold mb-2">완전 자동 BBS 평가</h2>
          <p className="opacity-90">
            영상만 업로드하면 AI가 자동으로 검사 종류를 인식하고 채점합니다.
            <br />
            검사 항목을 선택할 필요가 없습니다!
          </p>
        </div>

        {/* 영상 업로드 */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">영상 업로드</h3>

          <div className="grid md:grid-cols-2 gap-4">
            <VideoUploader
              label="정면 영상 (필수)"
              onUpload={handleFrontVideoUpload}
              currentVideoId={frontVideoId}
              disabled={analyzing}
            />
            <VideoUploader
              label="측면 영상 (선택)"
              onUpload={handleSideVideoUpload}
              currentVideoId={sideVideoId}
              disabled={analyzing}
            />
          </div>
        </div>

        {/* 오디오 싱크 상태 */}
        {syncing && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <div className="flex-1">
                <p className="text-blue-800 font-medium">오디오 싱크 분석 중...</p>
                <div className="mt-1 w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${syncProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 싱크 결과 */}
        {sideVideoId && syncConfidence !== null && !syncing && (
          <div className={`rounded-xl p-4 ${syncConfidence > 0.5 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {syncConfidence > 0.5 ? (
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
                <div>
                  <p className={`font-medium ${syncConfidence > 0.5 ? 'text-green-800' : 'text-yellow-800'}`}>
                    오디오 싱크 완료
                  </p>
                  <p className={`text-sm ${syncConfidence > 0.5 ? 'text-green-600' : 'text-yellow-600'}`}>
                    오프셋: {syncOffsetMs > 0 ? '+' : ''}{syncOffsetMs}ms | 신뢰도: {Math.round(syncConfidence * 100)}%
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">수동 조정:</span>
                <input
                  type="number"
                  value={syncOffsetMs}
                  onChange={(e) => setSyncOffsetMs(Number(e.target.value))}
                  className="w-24 px-2 py-1 border rounded text-sm"
                  step="100"
                />
                <span className="text-sm text-gray-500">ms</span>
              </div>
            </div>
          </div>
        )}

        {/* 영상 미리보기 */}
        {frontVideoId && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">영상 미리보기</h3>
            <DualVideoPlayer
              frontVideoId={frontVideoId}
              sideVideoId={sideVideoId}
              syncOffsetMs={syncOffsetMs}
            />
          </div>
        )}

        {/* 분석 버튼 */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleAutoAnalyze}
            disabled={!frontVideoId || analyzing}
            className={`
              px-8 py-4 rounded-xl font-bold text-lg transition-all
              ${!frontVideoId || analyzing
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 shadow-lg hover:shadow-xl'
              }
            `}
          >
            {analyzing ? (
              <span className="flex items-center gap-3">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {analysisProgress?.message || 'AI 분석 중...'}
              </span>
            ) : (
              '🚀 빠른 AI 분석 시작'
            )}
          </button>

          {/* 분석 진행률 */}
          {analyzing && analysisProgress && (
            <div className="w-full max-w-md">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>{analysisProgress.message}</span>
                <span>{analysisProgress.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-purple-600 to-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${analysisProgress.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {/* 결과 */}
        {result && (
          <div className="space-y-6">
            {/* 감지된 검사 */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                🎯 AI가 감지한 검사
              </h3>

              <div className="flex items-center gap-4 p-4 bg-purple-50 rounded-xl">
                <div className="w-16 h-16 bg-purple-600 text-white rounded-xl flex items-center justify-center text-2xl font-bold">
                  {result.detectedTestId}
                </div>
                <div className="flex-1">
                  <h4 className="text-xl font-bold text-gray-900">
                    {result.detectedTestNameKo}
                  </h4>
                  <p className="text-gray-600">{result.detectedTestName}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">분석 신뢰도</div>
                  <div className="text-2xl font-bold text-purple-600">
                    {Math.round(result.confidence * 100)}%
                  </div>
                </div>
              </div>

              {/* 분석 정보 */}
              <div className="mt-4 flex gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {result.framesAnalyzed}개 프레임 분석
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  로컬 AI 분석 (빠름)
                </div>
              </div>
            </div>

            {/* 점수 */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                📊 자동 채점 결과
              </h3>

              <div className="flex items-center justify-center gap-8 py-6">
                <div className="text-center">
                  <div className="text-6xl font-bold text-blue-600">
                    {result.score}
                    <span className="text-2xl font-normal text-gray-400">/4</span>
                  </div>
                  <div className="text-gray-500 mt-2">점수</div>
                </div>

                <div className="text-center">
                  <div className="text-4xl font-bold text-green-600">
                    {Math.round(result.confidence * 100)}%
                  </div>
                  <div className="text-gray-500 mt-2">신뢰도</div>
                </div>
              </div>

              {/* 판단 근거 */}
              {result.reasoning && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h5 className="font-medium text-gray-700 mb-2">AI 판단 근거</h5>
                  <p className="text-gray-600">{result.reasoning}</p>
                </div>
              )}

              {/* 충족 기준 */}
              {result.criteriaMet && (
                <div className="mt-4">
                  <h5 className="font-medium text-gray-700 mb-2">충족 기준</h5>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(result.criteriaMet).map(([key, value]) => (
                      <span
                        key={key}
                        className={`px-3 py-1 rounded-full text-sm ${
                          value
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {key}: {value ? '✓' : '✗'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 채점 기준 */}
            {result.detectedTestId && (
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  📋 {result.detectedTestNameKo} 채점 기준
                </h3>
                <div className="space-y-2">
                  {getTestItem(result.detectedTestId)?.scoringCriteria.map((criteria) => (
                    <div
                      key={criteria.score}
                      className={`flex items-start gap-3 p-3 rounded-lg ${
                        result.score === criteria.score
                          ? 'bg-blue-50 border border-blue-200'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div
                        className={`
                          w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                          ${result.score === criteria.score
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-600'
                          }
                        `}
                      >
                        {criteria.score}
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-800">{criteria.descriptionKo}</p>
                        <p className="text-sm text-gray-500">{criteria.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
