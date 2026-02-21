import axios from 'axios';
import type { VideoUploadResponse, SyncResult, AnalysisResult } from '../types';

const API_BASE = '/api/v1';

// 기본 API (일반 요청용)
const api = axios.create({
  baseURL: API_BASE,
  timeout: 600000, // 10분
});

// 업로드용 API (대용량 파일)
const uploadApi = axios.create({
  baseURL: API_BASE,
  timeout: 1800000, // 30분 (2GB 업로드용)
});

export const videoApi = {
  upload: async (
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<VideoUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await uploadApi.post<VideoUploadResponse>('/video/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          onProgress(percent);
        }
      },
    });
    return response.data;
  },

  getVideoUrl: (videoId: string): string => {
    return `${API_BASE}/video/${videoId}`;
  },

  delete: async (videoId: string): Promise<void> => {
    await api.delete(`/video/${videoId}`);
  },
};

// API response with snake_case (as returned from backend)
interface SyncApiResponse {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  offset_ms: number | null;
  confidence: number | null;
  error: string | null;
}

export const syncApi = {
  analyze: async (
    frontVideoId: string,
    sideVideoId: string,
    testItemId: number
  ): Promise<SyncResult> => {
    const response = await api.post<SyncApiResponse>('/sync/analyze', {
      front_video_id: frontVideoId,
      side_video_id: sideVideoId,
      test_item_id: testItemId,
    });
    return {
      jobId: response.data.job_id,
      status: response.data.status,
      offsetMs: response.data.offset_ms,
      confidence: response.data.confidence,
      error: response.data.error,
    };
  },

  getStatus: async (jobId: string): Promise<SyncResult> => {
    const response = await api.get<SyncApiResponse>(`/sync/status/${jobId}`);
    return {
      jobId: response.data.job_id,
      status: response.data.status,
      offsetMs: response.data.offset_ms,
      confidence: response.data.confidence,
      error: response.data.error,
    };
  },
};

export const analysisApi = {
  start: async (
    frontVideoId: string,
    sideVideoId: string,
    testItemId: number,
    syncOffsetMs: number
  ): Promise<AnalysisResult> => {
    const response = await api.post('/analysis/start', {
      front_video_id: frontVideoId,
      side_video_id: sideVideoId,
      test_item_id: testItemId,
      sync_offset_ms: syncOffsetMs,
    });
    return transformAnalysisResponse(response.data);
  },

  getStatus: async (jobId: string): Promise<AnalysisResult> => {
    const response = await api.get(`/analysis/status/${jobId}`);
    return transformAnalysisResponse(response.data);
  },

  getResult: async (jobId: string): Promise<AnalysisResult> => {
    const response = await api.get(`/analysis/result/${jobId}`);
    return transformAnalysisResponse(response.data);
  },
};

function transformAnalysisResponse(data: Record<string, unknown>): AnalysisResult {
  return {
    jobId: data.job_id as string,
    status: data.status as AnalysisResult['status'],
    testItemId: data.test_item_id as number,
    score: data.score as number | null,
    confidence: data.confidence as number | null,
    reasoning: data.reasoning as string | null,
    poseData: data.pose_data ? {
      framesAnalyzed: (data.pose_data as Record<string, number>).frames_analyzed,
      frontFrames: (data.pose_data as Record<string, number>).front_frames,
      sideFrames: (data.pose_data as Record<string, number>).side_frames,
    } : null,
    criteriaMet: data.criteria_met as Record<string, boolean> | null,
    error: data.error as string | null,
  };
}

export interface AutoAnalysisResult {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  detectedTestId: number | null;
  detectedTestName: string | null;
  detectedTestNameKo: string | null;
  detectionConfidence: number | null;
  score: number | null;
  scoringConfidence: number | null;
  reasoning: string | null;
  criteriaMet: Record<string, boolean> | null;
  allTestScores: Record<string, number> | null;
  error: string | null;
}

export const autoAnalysisApi = {
  start: async (
    frontVideoId: string,
    sideVideoId?: string,
    syncOffsetMs: number = 0
  ): Promise<AutoAnalysisResult> => {
    const response = await api.post('/auto-analysis/start', {
      front_video_id: frontVideoId,
      side_video_id: sideVideoId || null,
      sync_offset_ms: syncOffsetMs,
    });
    return transformAutoAnalysisResponse(response.data);
  },

  getStatus: async (jobId: string): Promise<AutoAnalysisResult> => {
    const response = await api.get(`/auto-analysis/status/${jobId}`);
    return transformAutoAnalysisResponse(response.data);
  },

  getResult: async (jobId: string): Promise<AutoAnalysisResult> => {
    const response = await api.get(`/auto-analysis/result/${jobId}`);
    return transformAutoAnalysisResponse(response.data);
  },
};

function transformAutoAnalysisResponse(data: Record<string, unknown>): AutoAnalysisResult {
  return {
    jobId: data.job_id as string,
    status: data.status as AutoAnalysisResult['status'],
    detectedTestId: data.detected_test_id as number | null,
    detectedTestName: data.detected_test_name as string | null,
    detectedTestNameKo: data.detected_test_name_ko as string | null,
    detectionConfidence: data.detection_confidence as number | null,
    score: data.score as number | null,
    scoringConfidence: data.scoring_confidence as number | null,
    reasoning: data.reasoning as string | null,
    criteriaMet: data.criteria_met as Record<string, boolean> | null,
    allTestScores: data.all_test_scores as Record<string, number> | null,
    error: data.error as string | null,
  };
}

export const healthApi = {
  check: async (): Promise<{ status: string; service: string }> => {
    const response = await api.get('/health');
    return response.data;
  },
};

// BBS Real-time Scoring API
export interface BBSScoreResponse {
  score: number;
  confidence: number;
  reasoning: string;
  criteria_met: Record<string, boolean>;
  duration_sec: number;
}

export interface BBSTest {
  id: number;
  name: string;
  name_ko: string;
  description: string;
  duration_seconds: number | null;
  max_score: number;
}

export const bbsApi = {
  score: async (
    testId: number,
    frames: Array<{ landmarks: Record<string, unknown>; timestamp_ms: number }>
  ): Promise<BBSScoreResponse> => {
    const response = await api.post<BBSScoreResponse>('/bbs/score', {
      test_id: testId,
      frames,
    });
    return response.data;
  },

  getTests: async (): Promise<{ tests: BBSTest[] }> => {
    const response = await api.get<{ tests: BBSTest[] }>('/bbs/tests');
    return response.data;
  },
};
