import type { Assessment } from '../../types';
import { getRiskCategoryKo } from '../../types';

interface ScoreDisplayProps {
  assessment: Assessment;
}

export function ScoreDisplay({ assessment }: ScoreDisplayProps) {
  const completedTests = assessment.testResults.filter(r => r.status === 'completed').length;
  const totalTests = 14;

  const getRiskColor = () => {
    switch (assessment.riskCategory) {
      case 'low':
        return 'text-green-600 bg-green-100';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100';
      case 'high':
        return 'text-red-600 bg-red-100';
    }
  };

  const getScoreColor = () => {
    if (assessment.totalScore >= 41) return 'text-green-600';
    if (assessment.totalScore >= 21) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">평가 결과</h2>

      <div className="grid grid-cols-2 gap-6">
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-500 mb-1">총점</div>
          <div className={`text-4xl font-bold ${getScoreColor()}`}>
            {assessment.totalScore}
            <span className="text-lg font-normal text-gray-400">/56</span>
          </div>
        </div>

        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-500 mb-1">진행률</div>
          <div className="text-4xl font-bold text-blue-600">
            {completedTests}
            <span className="text-lg font-normal text-gray-400">/{totalTests}</span>
          </div>
        </div>
      </div>

      <div className={`mt-4 p-4 rounded-lg ${getRiskColor()}`}>
        <div className="text-sm opacity-75 mb-1">낙상 위험도</div>
        <div className="text-xl font-bold">
          {getRiskCategoryKo(assessment.riskCategory)}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-sm text-gray-500 mb-2">점수 분포</div>
        <div className="grid grid-cols-14 gap-1">
          {assessment.testResults.map((result) => (
            <div
              key={result.testItemId}
              className={`
                h-8 rounded flex items-center justify-center text-xs font-medium
                ${result.status === 'completed'
                  ? result.score === 4
                    ? 'bg-green-500 text-white'
                    : result.score === 3
                    ? 'bg-green-300 text-green-800'
                    : result.score === 2
                    ? 'bg-yellow-300 text-yellow-800'
                    : result.score === 1
                    ? 'bg-orange-300 text-orange-800'
                    : 'bg-red-300 text-red-800'
                  : 'bg-gray-200 text-gray-400'
                }
              `}
              title={`검사 ${result.testItemId}: ${result.score ?? '-'}점`}
            >
              {result.score ?? '-'}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>검사 1</span>
          <span>검사 14</span>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t">
        <h3 className="text-sm font-medium text-gray-700 mb-2">점수 해석</h3>
        <div className="space-y-1 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>0-20점</span>
            <span className="text-red-600">휠체어 필요 (높은 낙상 위험)</span>
          </div>
          <div className="flex justify-between">
            <span>21-40점</span>
            <span className="text-yellow-600">보조 기구 필요 (중등도 위험)</span>
          </div>
          <div className="flex justify-between">
            <span>41-56점</span>
            <span className="text-green-600">독립 보행 가능 (낮은 위험)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
