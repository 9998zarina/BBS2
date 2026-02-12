export interface BBSTestItem {
  id: number;
  name: string;
  nameKo: string;
  description: string;
  instructions: string;
  instructionsKo: string;
  timeRequirement?: number;
  scoringCriteria: ScoringCriteria[];
}

export interface ScoringCriteria {
  score: 0 | 1 | 2 | 3 | 4;
  description: string;
  descriptionKo: string;
}

export interface Assessment {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  patientId?: string;
  patientName?: string;
  testResults: TestResult[];
  totalScore: number;
  riskCategory: 'low' | 'medium' | 'high';
  status: 'in_progress' | 'completed';
}

export interface TestResult {
  testItemId: number;
  frontVideoId: string | null;
  sideVideoId: string | null;
  syncOffsetMs: number;
  score: number | null;
  confidence: number | null;
  reasoning: string | null;
  criteriaMet: Record<string, boolean> | null;
  status: 'pending' | 'videos_uploaded' | 'synced' | 'analyzing' | 'completed' | 'error';
}

export interface VideoFile {
  id: string;
  blob: Blob;
  name: string;
  size: number;
  duration?: number;
  uploadedAt: Date;
  thumbnailUrl?: string;
}

export interface SyncResult {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  offsetMs: number | null;
  confidence: number | null;
  error: string | null;
}

export interface AnalysisResult {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  testItemId: number;
  score: number | null;
  confidence: number | null;
  reasoning: string | null;
  poseData: {
    framesAnalyzed: number;
    frontFrames: number;
    sideFrames: number;
  } | null;
  criteriaMet: Record<string, boolean> | null;
  error: string | null;
}

export interface VideoUploadResponse {
  id: string;
  filename: string;
  size: number;
  message: string;
}

export type RiskCategory = 'low' | 'medium' | 'high';

export function getRiskCategory(totalScore: number): RiskCategory {
  if (totalScore >= 41) return 'low';
  if (totalScore >= 21) return 'medium';
  return 'high';
}

export function getRiskCategoryKo(category: RiskCategory): string {
  switch (category) {
    case 'low':
      return '낮은 낙상 위험';
    case 'medium':
      return '중등도 낙상 위험';
    case 'high':
      return '높은 낙상 위험';
  }
}
