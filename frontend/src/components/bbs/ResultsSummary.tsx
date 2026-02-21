import type { TestResult } from '../../hooks/useBBSAssessment';

interface ResultsSummaryProps {
  results: TestResult[];
  totalScore: number;
  onRestart: () => void;
  onHome: () => void;
}

export function ResultsSummary({ results, totalScore, onRestart, onHome }: ResultsSummaryProps) {
  const getRiskLevel = () => {
    if (totalScore >= 41) return { level: 'Low', color: 'text-green-500', bg: 'bg-green-500/20' };
    if (totalScore >= 21) return { level: 'Medium', color: 'text-yellow-500', bg: 'bg-yellow-500/20' };
    return { level: 'High', color: 'text-red-500', bg: 'bg-red-500/20' };
  };

  const risk = getRiskLevel();

  const getScoreColor = (score: number) => {
    if (score >= 4) return 'text-green-400 bg-green-500/20';
    if (score >= 3) return 'text-blue-400 bg-blue-500/20';
    if (score >= 2) return 'text-yellow-400 bg-yellow-500/20';
    return 'text-red-400 bg-red-500/20';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">BBS Assessment Complete</h1>
          <p className="text-gray-600">Berg Balance Scale evaluation results</p>
        </div>

        {/* Total Score Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="text-center">
            <div className={`inline-block px-4 py-1 rounded-full text-sm font-medium mb-4 ${risk.bg} ${risk.color}`}>
              Fall Risk: {risk.level}
            </div>

            <div className={`text-7xl font-bold mb-2 ${risk.color}`}>
              {totalScore}
              <span className="text-3xl text-gray-400">/56</span>
            </div>

            <p className="text-gray-600 max-w-md mx-auto">
              {totalScore >= 41
                ? 'Low fall risk. Independent mobility is generally safe.'
                : totalScore >= 21
                ? 'Medium fall risk. Consider assistive devices and supervision.'
                : 'High fall risk. Wheelchair use and close supervision recommended.'}
            </p>
          </div>

          {/* Score Breakdown Visual */}
          <div className="mt-8 flex justify-center gap-1">
            {results.map((result) => (
              <div
                key={result.testId}
                className="flex flex-col items-center"
                title={`${result.testId}. ${result.testNameKo}: ${result.score}/4`}
              >
                <div
                  className={`w-6 rounded-t ${getScoreColor(result.score).split(' ')[1]}`}
                  style={{ height: `${result.score * 12}px` }}
                />
                <div className="text-xs text-gray-400 mt-1">{result.testId}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Individual Results */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Detailed Results</h2>

          <div className="space-y-3">
            {results.map((result) => (
              <div
                key={result.testId}
                className="p-4 bg-gray-50 rounded-xl"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-gray-700">
                      {result.testId}
                    </span>
                    <span className="font-medium text-gray-900">{result.testNameKo}</span>
                  </div>
                  <div className={`px-3 py-1 rounded-full font-bold ${getScoreColor(result.score)}`}>
                    {result.score}/4
                  </div>
                </div>
                <p className="text-sm text-gray-600 ml-11">{result.reasoning}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Interpretation */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Score Interpretation</h2>

          <div className="grid grid-cols-3 gap-4">
            <div className={`p-4 rounded-xl ${totalScore >= 41 ? 'bg-green-100 ring-2 ring-green-500' : 'bg-gray-50'}`}>
              <div className="text-2xl font-bold text-green-600 mb-1">41-56</div>
              <div className="text-sm text-gray-700">Low Risk</div>
              <div className="text-xs text-gray-500 mt-1">Independent mobility</div>
            </div>

            <div className={`p-4 rounded-xl ${totalScore >= 21 && totalScore < 41 ? 'bg-yellow-100 ring-2 ring-yellow-500' : 'bg-gray-50'}`}>
              <div className="text-2xl font-bold text-yellow-600 mb-1">21-40</div>
              <div className="text-sm text-gray-700">Medium Risk</div>
              <div className="text-xs text-gray-500 mt-1">May need assistance</div>
            </div>

            <div className={`p-4 rounded-xl ${totalScore < 21 ? 'bg-red-100 ring-2 ring-red-500' : 'bg-gray-50'}`}>
              <div className="text-2xl font-bold text-red-600 mb-1">0-20</div>
              <div className="text-sm text-gray-700">High Risk</div>
              <div className="text-xs text-gray-500 mt-1">Wheelchair recommended</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={onRestart}
            className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            Retake Assessment
          </button>
          <button
            onClick={onHome}
            className="flex-1 px-6 py-4 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
