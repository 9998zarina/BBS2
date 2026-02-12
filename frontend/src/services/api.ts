import axios from 'axios';
import type { VideoUploadResponse, SyncResult, AnalysisResult } from '../types';

const API_BASE = '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 300000,
});

export const videoApi = {
  upload: async (file: File): Promise<VideoUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<VideoUploadResponse>('/video/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
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

export const syncApi = {
  analyze: async (
    frontVideoId: string,
    sideVideoId: string,
    testItemId: number
  ): Promise<SyncResult> => {
    const response = await api.post<SyncResult>('/sync/analyze', {
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
    } as SyncResult;
  },

  getStatus: async (jobId: string): Promise<SyncResult> => {
    const response = await api.get<SyncResult>(`/sync/status/${jobId}`);
    return {
      jobId: response.data.job_id,
      status: response.data.status,
      offsetMs: response.data.offset_ms,
      confidence: response.data.confidence,
      error: response.data.error,
    } as SyncResult;
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

export const healthApi = {
  check: async (): Promise<{ status: string; service: string }> => {
    const response = await api.get('/health');
    return response.data;
  },
};
