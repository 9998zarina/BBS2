import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAssessmentStore } from '../hooks/useIndexedDB';
import { VideoUploader } from '../components/video/VideoUploader';
import { DualVideoPlayer } from '../components/video/DualVideoPlayer';
import { TestItemCard } from '../components/assessment/TestItemCard';
import { ScoreDisplay } from '../components/assessment/ScoreDisplay';
import { BBS_TEST_ITEMS, getTestItemById } from '../utils/bbs-test-items';
import { syncApi, analysisApi } from '../services/api';
import type { Assessment, VideoUploadResponse } from '../types';

export function AssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getAssessment, updateTestResult } = useAssessmentStore();

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [selectedTestId, setSelectedTestId] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const loadAssessment = useCallback(async () => {
    if (!id) return;
    const data = await getAssessment(id);
    if (data) {
      setAssessment(data);
    } else {
      navigate('/');
    }
    setLoading(false);
  }, [id, getAssessment, navigate]);

  useEffect(() => {
    loadAssessment();
  }, [loadAssessment]);

  const selectedTest = getTestItemById(selectedTestId);
  const selectedResult = assessment?.testResults.find(r => r.testItemId === selectedTestId);

  const handleFrontVideoUpload = async (response: VideoUploadResponse) => {
    if (!assessment || !id) return;

    await updateTestResult(id, selectedTestId, {
      frontVideoId: response.id,
      status: selectedResult?.sideVideoId ? 'videos_uploaded' : 'pending',
    });
    await loadAssessment();
  };

  const handleSideVideoUpload = async (response: VideoUploadResponse) => {
    if (!assessment || !id) return;

    await updateTestResult(id, selectedTestId, {
      sideVideoId: response.id,
      status: selectedResult?.frontVideoId ? 'videos_uploaded' : 'pending',
    });
    await loadAssessment();
  };

  const handleSync = async () => {
    if (!assessment || !id || !selectedResult?.frontVideoId || !selectedResult?.sideVideoId) return;

    setSyncing(true);
    try {
      const result = await syncApi.analyze(
        selectedResult.frontVideoId,
        selectedResult.sideVideoId,
        selectedTestId
      );

      const pollInterval = setInterval(async () => {
        const status = await syncApi.getStatus(result.jobId);
        if (status.status === 'completed') {
          clearInterval(pollInterval);
          await updateTestResult(id, selectedTestId, {
            syncOffsetMs: status.offsetMs ?? 0,
            status: 'synced',
          });
          await loadAssessment();
          setSyncing(false);
        } else if (status.status === 'failed') {
          clearInterval(pollInterval);
          setSyncing(false);
          alert(`동기화 실패: ${status.error}`);
        }
      }, 1000);
    } catch (error) {
      setSyncing(false);
      alert('동기화 중 오류가 발생했습니다.');
    }
  };

  const handleAnalyze = async () => {
    if (!assessment || !id || !selectedResult?.frontVideoId || !selectedResult?.sideVideoId) return;

    setAnalyzing(true);
    await updateTestResult(id, selectedTestId, { status: 'analyzing' });
    await loadAssessment();

    try {
      const result = await analysisApi.start(
        selectedResult.frontVideoId,
        selectedResult.sideVideoId,
        selectedTestId,
        selectedResult.syncOffsetMs
      );

      const pollInterval = setInterval(async () => {
        const status = await analysisApi.getStatus(result.jobId);
        if (status.status === 'completed') {
          clearInterval(pollInterval);
          await updateTestResult(id, selectedTestId, {
            score: status.score,
            confidence: status.confidence,
            reasoning: status.reasoning,
            criteriaMet: status.criteriaMet,
            status: 'completed',
          });
          await loadAssessment();
          setAnalyzing(false);
        } else if (status.status === 'failed') {
          clearInterval(pollInterval);
          await updateTestResult(id, selectedTestId, { status: 'error' });
          await loadAssessment();
          setAnalyzing(false);
          alert(`분석 실패: ${status.error}`);
        }
      }, 2000);
    } catch (error) {
      setAnalyzing(false);
      await updateTestResult(id, selectedTestId, { status: 'error' });
      await loadAssessment();
      alert('분석 중 오류가 발생했습니다.');
    }
  };

  const handleOffsetChange = async (offsetMs: number) => {
    if (!id) return;
    await updateTestResult(id, selectedTestId, { syncOffsetMs: offsetMs });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  if (!assessment) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-900">BBS 평가</h1>
          </div>
          <div className="text-sm text-gray-500">
            {new Date(assessment.createdAt).toLocaleDateString('ko-KR')}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <ScoreDisplay assessment={assessment} />

            <div className="bg-white rounded-xl shadow-sm border p-4">
              <h3 className="font-semibold text-gray-800 mb-3">검사 항목</h3>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {BBS_TEST_ITEMS.map((item) => {
                  const result = assessment.testResults.find(r => r.testItemId === item.id);
                  if (!result) return null;
                  return (
                    <TestItemCard
                      key={item.id}
                      testItem={item}
                      result={result}
                      isSelected={selectedTestId === item.id}
                      onClick={() => setSelectedTestId(item.id)}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {selectedTest && selectedResult && (
              <>
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        {selectedTest.id}. {selectedTest.nameKo}
                      </h2>
                      <p className="text-gray-500">{selectedTest.name}</p>
                    </div>
                    {selectedTest.timeRequirement && (
                      <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                        {selectedTest.timeRequirement}초
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <h4 className="font-medium text-gray-700 mb-2">검사 지침</h4>
                    <p className="text-gray-600">{selectedTest.instructionsKo}</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <VideoUploader
                      label="정면 영상"
                      onUpload={handleFrontVideoUpload}
                      currentVideoId={selectedResult.frontVideoId}
                      disabled={analyzing}
                    />
                    <VideoUploader
                      label="측면 영상"
                      onUpload={handleSideVideoUpload}
                      currentVideoId={selectedResult.sideVideoId}
                      disabled={analyzing}
                    />
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h3 className="font-semibold text-gray-800 mb-4">영상 재생</h3>
                  <DualVideoPlayer
                    frontVideoId={selectedResult.frontVideoId}
                    sideVideoId={selectedResult.sideVideoId}
                    syncOffsetMs={selectedResult.syncOffsetMs}
                    onOffsetChange={handleOffsetChange}
                  />

                  <div className="flex gap-4 mt-6">
                    <button
                      onClick={handleSync}
                      disabled={!selectedResult.frontVideoId || !selectedResult.sideVideoId || syncing || analyzing}
                      className={`
                        flex-1 py-3 rounded-lg font-medium transition-colors
                        ${!selectedResult.frontVideoId || !selectedResult.sideVideoId || syncing || analyzing
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-purple-600 text-white hover:bg-purple-700'
                        }
                      `}
                    >
                      {syncing ? '동기화 중...' : '오디오 동기화'}
                    </button>

                    <button
                      onClick={handleAnalyze}
                      disabled={!selectedResult.frontVideoId || !selectedResult.sideVideoId || analyzing}
                      className={`
                        flex-1 py-3 rounded-lg font-medium transition-colors
                        ${!selectedResult.frontVideoId || !selectedResult.sideVideoId || analyzing
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                        }
                      `}
                    >
                      {analyzing ? 'AI 분석 중...' : 'AI 분석 시작'}
                    </button>
                  </div>
                </div>

                {selectedResult.status === 'completed' && selectedResult.reasoning && (
                  <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="font-semibold text-gray-800 mb-4">분석 결과</h3>

                    <div className="flex items-center gap-4 mb-4">
                      <div className="text-4xl font-bold text-blue-600">
                        {selectedResult.score}
                        <span className="text-lg font-normal text-gray-400">/4</span>
                      </div>
                      {selectedResult.confidence && (
                        <div className="text-sm text-gray-500">
                          신뢰도: {Math.round(selectedResult.confidence * 100)}%
                        </div>
                      )}
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <h4 className="font-medium text-gray-700 mb-2">AI 판단 근거</h4>
                      <p className="text-gray-600">{selectedResult.reasoning}</p>
                    </div>

                    {selectedResult.criteriaMet && (
                      <div>
                        <h4 className="font-medium text-gray-700 mb-2">충족 기준</h4>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(selectedResult.criteriaMet).map(([key, value]) => (
                            <span
                              key={key}
                              className={`px-3 py-1 rounded-full text-sm ${
                                value ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {key}: {value ? '✓' : '✗'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h3 className="font-semibold text-gray-800 mb-4">채점 기준</h3>
                  <div className="space-y-3">
                    {selectedTest.scoringCriteria.map((criteria) => (
                      <div
                        key={criteria.score}
                        className={`flex items-start gap-3 p-3 rounded-lg ${
                          selectedResult.score === criteria.score
                            ? 'bg-blue-50 border border-blue-200'
                            : 'bg-gray-50'
                        }`}
                      >
                        <div className={`
                          w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                          ${selectedResult.score === criteria.score
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-600'
                          }
                        `}>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
