import { openDB, type IDBPDatabase } from 'idb';
import { useState, useEffect, useCallback } from 'react';
import type { Assessment, VideoFile } from '../types';

const DB_NAME = 'bbs_assessment_db';
const DB_VERSION = 1;

interface BBSDatabase {
  assessments: Assessment;
  videos: VideoFile;
}

let dbInstance: IDBPDatabase<BBSDatabase> | null = null;

async function getDB(): Promise<IDBPDatabase<BBSDatabase>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<BBSDatabase>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('assessments')) {
        const assessmentStore = db.createObjectStore('assessments', { keyPath: 'id' });
        assessmentStore.createIndex('by-date', 'createdAt');
        assessmentStore.createIndex('by-status', 'status');
      }

      if (!db.objectStoreNames.contains('videos')) {
        const videoStore = db.createObjectStore('videos', { keyPath: 'id' });
        videoStore.createIndex('by-date', 'uploadedAt');
      }
    },
  });

  return dbInstance;
}

export function useAssessments() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAssessments = useCallback(async () => {
    try {
      const db = await getDB();
      const all = await db.getAll('assessments');
      setAssessments(all.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch (error) {
      console.error('Failed to load assessments:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssessments();
  }, [loadAssessments]);

  const saveAssessment = useCallback(async (assessment: Assessment) => {
    const db = await getDB();
    await db.put('assessments', assessment);
    await loadAssessments();
  }, [loadAssessments]);

  const deleteAssessment = useCallback(async (id: string) => {
    const db = await getDB();
    await db.delete('assessments', id);
    await loadAssessments();
  }, [loadAssessments]);

  const getAssessment = useCallback(async (id: string): Promise<Assessment | undefined> => {
    const db = await getDB();
    return db.get('assessments', id);
  }, []);

  return {
    assessments,
    loading,
    saveAssessment,
    deleteAssessment,
    getAssessment,
    refresh: loadAssessments,
  };
}

export function useVideos() {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadVideos = useCallback(async () => {
    try {
      const db = await getDB();
      const all = await db.getAll('videos');
      setVideos(all.sort((a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      ));
    } catch (error) {
      console.error('Failed to load videos:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  const saveVideo = useCallback(async (video: VideoFile) => {
    const db = await getDB();
    await db.put('videos', video);
    await loadVideos();
  }, [loadVideos]);

  const deleteVideo = useCallback(async (id: string) => {
    const db = await getDB();
    await db.delete('videos', id);
    await loadVideos();
  }, [loadVideos]);

  const getVideo = useCallback(async (id: string): Promise<VideoFile | undefined> => {
    const db = await getDB();
    return db.get('videos', id);
  }, []);

  return {
    videos,
    loading,
    saveVideo,
    deleteVideo,
    getVideo,
    refresh: loadVideos,
  };
}

export function useAssessmentStore() {
  const assessmentHooks = useAssessments();
  const videoHooks = useVideos();

  const createAssessment = useCallback(async (patientName?: string): Promise<Assessment> => {
    const assessment: Assessment = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      patientName,
      testResults: Array.from({ length: 14 }, (_, i) => ({
        testItemId: i + 1,
        frontVideoId: null,
        sideVideoId: null,
        syncOffsetMs: 0,
        score: null,
        confidence: null,
        reasoning: null,
        criteriaMet: null,
        status: 'pending' as const,
      })),
      totalScore: 0,
      riskCategory: 'high',
      status: 'in_progress',
    };

    await assessmentHooks.saveAssessment(assessment);
    return assessment;
  }, [assessmentHooks]);

  const updateTestResult = useCallback(async (
    assessmentId: string,
    testItemId: number,
    update: Partial<Assessment['testResults'][0]>
  ) => {
    const assessment = await assessmentHooks.getAssessment(assessmentId);
    if (!assessment) return;

    const resultIndex = assessment.testResults.findIndex(r => r.testItemId === testItemId);
    if (resultIndex === -1) return;

    assessment.testResults[resultIndex] = {
      ...assessment.testResults[resultIndex],
      ...update,
    };

    assessment.totalScore = assessment.testResults.reduce(
      (sum, r) => sum + (r.score ?? 0), 0
    );

    if (assessment.totalScore >= 41) {
      assessment.riskCategory = 'low';
    } else if (assessment.totalScore >= 21) {
      assessment.riskCategory = 'medium';
    } else {
      assessment.riskCategory = 'high';
    }

    const allCompleted = assessment.testResults.every(r => r.status === 'completed');
    if (allCompleted) {
      assessment.status = 'completed';
    }

    assessment.updatedAt = new Date();

    await assessmentHooks.saveAssessment(assessment);
  }, [assessmentHooks]);

  return {
    ...assessmentHooks,
    ...videoHooks,
    createAssessment,
    updateTestResult,
  };
}
