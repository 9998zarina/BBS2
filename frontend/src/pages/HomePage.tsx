import { useNavigate } from 'react-router-dom';
import { useAssessmentStore } from '../hooks/useIndexedDB';

export function HomePage() {
  const navigate = useNavigate();
  const { assessments, createAssessment } = useAssessmentStore();

  const handleNewAssessment = async () => {
    const assessment = await createAssessment();
    navigate(`/assessment/${assessment.id}`);
  };

  const recentAssessments = assessments.slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            BBS 균형 평가 시스템
          </h1>
          <p className="text-lg text-gray-600">
            AI 기반 Berg Balance Scale 자동 평가
          </p>
        </div>

        {/* BBS 자동 음성 안내 검사 - 추천 */}
        <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl shadow-lg p-8 mb-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 px-4 py-1 font-bold text-sm rounded-bl-lg">
            추천
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 rounded-full mb-6">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-sm font-medium mb-4">
              음성 안내 + AI 자동 채점
            </span>
            <h2 className="text-2xl font-bold mb-4">
              BBS 자동 검사 시스템
            </h2>
            <p className="opacity-90 mb-6">
              음성 안내에 따라 검사를 진행하세요.
              <br />
              AI가 자세를 인식하고 자동으로 다음 검사로 넘어갑니다!
            </p>
            <ul className="text-sm opacity-80 mb-6 space-y-1">
              <li>✓ "앉아주세요", "일어나세요" 음성 안내</li>
              <li>✓ 자세 자동 인식 및 시간 측정</li>
              <li>✓ 검사 완료 시 5초 후 다음 검사로 자동 전환</li>
              <li>✓ 상세 결과 리포트 제공</li>
            </ul>
            <button
              onClick={() => navigate('/bbs-assessment')}
              className="px-8 py-3 bg-white text-orange-600 rounded-lg font-bold hover:bg-gray-100 transition-colors"
            >
              BBS 자동 검사 시작
            </button>
          </div>
        </div>

        {/* 실시간 카메라 평가 */}
        <div className="bg-gradient-to-r from-green-600 to-teal-600 rounded-2xl shadow-lg p-8 mb-8 text-white">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 rounded-full mb-6">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-sm font-medium mb-4">
              실시간 스켈레톤
            </span>
            <h2 className="text-2xl font-bold mb-4">
              실시간 카메라 평가
            </h2>
            <p className="opacity-90 mb-6">
              카메라로 실시간 촬영하면서 BBS 검사를 진행합니다.
              <br />
              AI가 실시간으로 포즈를 분석하고 즉시 채점합니다!
            </p>
            <button
              onClick={() => navigate('/camera-assessment')}
              className="px-8 py-3 bg-white text-green-600 rounded-lg font-bold hover:bg-gray-100 transition-colors"
            >
              실시간 평가 시작하기
            </button>
          </div>
        </div>

        {/* 자동 분석 (Option B) */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl shadow-lg p-8 mb-8 text-white">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 rounded-full mb-6">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-sm font-medium mb-4">
              AI 완전 자동화
            </span>
            <h2 className="text-2xl font-bold mb-4">
              영상 파일 자동 분석
            </h2>
            <p className="opacity-90 mb-6">
              영상 파일을 업로드하면 AI가 자동으로 검사 종류를 인식하고 채점합니다.
              <br />
              검사 항목을 선택할 필요가 없습니다!
            </p>
            <button
              onClick={() => navigate('/auto-analysis')}
              className="px-8 py-3 bg-white text-purple-600 rounded-lg font-bold hover:bg-gray-100 transition-colors"
            >
              자동 분석 시작하기
            </button>
          </div>
        </div>

        {/* 기존 수동 평가 */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-6">
              <svg className="w-10 h-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              수동 평가 (검사 항목 선택)
            </h2>
            <p className="text-gray-600 mb-6">
              14가지 균형 검사 항목을 직접 선택하여 분석합니다.
              <br />
              정면과 측면 영상을 업로드하여 정확한 평가를 받으세요.
            </p>
            <button
              onClick={handleNewAssessment}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              수동 평가 시작하기
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-6 mb-12">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">실시간 카메라</h3>
            <p className="text-sm text-gray-600">
              카메라로 실시간 촬영하며 즉시 포즈 분석 및 채점합니다.
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">영상 업로드</h3>
            <p className="text-sm text-gray-600">
              정면과 측면에서 촬영한 검사 영상을 업로드합니다.
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">자동 동기화</h3>
            <p className="text-sm text-gray-600">
              오디오 분석을 통해 두 영상을 자동으로 동기화합니다.
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">AI 채점</h3>
            <p className="text-sm text-gray-600">
              YOLO 포즈 분석으로 BBS 기준에 따라 자동 채점합니다.
            </p>
          </div>
        </div>

        {recentAssessments.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">최근 평가</h2>
            <div className="space-y-3">
              {recentAssessments.map((assessment) => (
                <div
                  key={assessment.id}
                  onClick={() => navigate(`/assessment/${assessment.id}`)}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {assessment.patientName || '이름 없음'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(assessment.createdAt).toLocaleDateString('ko-KR')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${
                      assessment.totalScore >= 41 ? 'text-green-600' :
                      assessment.totalScore >= 21 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {assessment.totalScore}/56
                    </div>
                    <div className={`text-xs px-2 py-0.5 rounded ${
                      assessment.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {assessment.status === 'completed' ? '완료' : '진행 중'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
