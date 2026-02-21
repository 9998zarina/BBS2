import type { BBSTestItem } from '../../types';
import type { TestResult } from '../../hooks/useBBSAssessment';
import { BBS_TEST_ITEMS } from '../../utils/bbs-test-items';

interface TestInstructionsProps {
  currentTest: BBSTestItem;
  currentIndex: number;
  completedResults: TestResult[];
  totalScore: number;
}

export function TestInstructions({
  currentTest,
  currentIndex,
  completedResults,
  totalScore,
}: TestInstructionsProps) {
  const getScoreColor = (score: number) => {
    if (score >= 4) return 'text-green-400';
    if (score >= 3) return 'text-blue-400';
    if (score >= 2) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-4">
      {/* Total Score */}
      <div className="bg-gray-800 rounded-xl p-4 text-center">
        <div className="text-sm text-gray-400 mb-1">Total Score</div>
        <div className={`text-4xl font-bold ${
          totalScore >= 41 ? 'text-green-400' :
          totalScore >= 21 ? 'text-yellow-400' : 'text-red-400'
        }`}>
          {totalScore}
          <span className="text-lg text-gray-500">/56</span>
        </div>
      </div>

      {/* Current Test */}
      <div className="bg-gray-800 rounded-xl p-4">
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
            <span>Required: {currentTest.timeRequirement}s</span>
          </div>
        )}

        {/* Scoring Criteria */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <h3 className="text-sm text-gray-400 mb-2">Scoring Criteria</h3>
          <div className="space-y-1 text-xs">
            {currentTest.scoringCriteria.slice(0, 3).map((criteria) => (
              <div key={criteria.score} className="flex gap-2">
                <span className="text-blue-400 font-bold w-4">{criteria.score}</span>
                <span className="text-gray-400">{criteria.descriptionKo}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Completed Tests */}
      {completedResults.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4 max-h-48 overflow-y-auto">
          <h3 className="text-white font-medium mb-3">Completed Tests</h3>
          <div className="space-y-2">
            {completedResults.map((result) => (
              <div key={result.testId} className="flex items-center justify-between p-2 bg-gray-700/50 rounded">
                <span className="text-gray-300 text-sm">
                  {result.testId}. {result.testNameKo}
                </span>
                <span className={`font-bold ${getScoreColor(result.score)}`}>
                  {result.score}/4
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Tests */}
      {currentIndex < 13 && (
        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-white font-medium mb-3">Upcoming Tests</h3>
          <div className="space-y-2">
            {BBS_TEST_ITEMS.slice(currentIndex + 1, currentIndex + 4).map((test) => (
              <div key={test.id} className="p-2 bg-gray-700/30 rounded text-gray-400 text-sm">
                {test.id}. {test.nameKo}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
