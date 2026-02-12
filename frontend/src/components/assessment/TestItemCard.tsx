import type { BBSTestItem, TestResult } from '../../types';

interface TestItemCardProps {
  testItem: BBSTestItem;
  result: TestResult;
  onClick: () => void;
  isSelected?: boolean;
}

export function TestItemCard({ testItem, result, onClick, isSelected }: TestItemCardProps) {
  const getStatusColor = () => {
    switch (result.status) {
      case 'completed':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'analyzing':
        return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'synced':
      case 'videos_uploaded':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'error':
        return 'bg-red-100 border-red-300 text-red-800';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  const getStatusText = () => {
    switch (result.status) {
      case 'completed':
        return '완료';
      case 'analyzing':
        return '분석 중...';
      case 'synced':
        return '동기화됨';
      case 'videos_uploaded':
        return '영상 업로드됨';
      case 'error':
        return '오류';
      default:
        return '대기 중';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`
        p-4 rounded-lg border-2 cursor-pointer transition-all duration-200
        ${isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-400'}
        ${getStatusColor()}
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{testItem.id}</span>
            <h3 className="font-medium">{testItem.nameKo}</h3>
          </div>
          <p className="text-sm opacity-75 mt-1">{testItem.name}</p>
        </div>

        <div className="text-right">
          <div className="text-xs uppercase tracking-wide opacity-75">
            {getStatusText()}
          </div>
          {result.score !== null && (
            <div className="text-2xl font-bold mt-1">
              {result.score}<span className="text-sm font-normal">/4</span>
            </div>
          )}
        </div>
      </div>

      {result.confidence !== null && result.confidence > 0 && (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-75">신뢰도:</span>
            <div className="flex-1 h-1.5 bg-white/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-current rounded-full transition-all duration-500"
                style={{ width: `${result.confidence * 100}%` }}
              />
            </div>
            <span className="text-xs">{Math.round(result.confidence * 100)}%</span>
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <div className={`
          px-2 py-0.5 rounded text-xs
          ${result.frontVideoId ? 'bg-white/50' : 'bg-black/10'}
        `}>
          정면 {result.frontVideoId ? '✓' : '○'}
        </div>
        <div className={`
          px-2 py-0.5 rounded text-xs
          ${result.sideVideoId ? 'bg-white/50' : 'bg-black/10'}
        `}>
          측면 {result.sideVideoId ? '✓' : '○'}
        </div>
      </div>
    </div>
  );
}
