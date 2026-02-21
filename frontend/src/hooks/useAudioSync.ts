import { useState, useCallback } from 'react';

interface AudioSyncResult {
  offsetMs: number;
  confidence: number;
}

export function useAudioSync() {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 비디오에서 오디오 데이터 추출 (최적화)
  const extractAudioData = async (
    videoUrl: string,
    durationSec: number = 5  // 5초로 단축
  ): Promise<Float32Array> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.src = videoUrl;
      video.muted = true;

      video.onloadedmetadata = async () => {
        try {
          const audioContext = new AudioContext();
          const response = await fetch(videoUrl);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

          // 첫 N초의 오디오 데이터 추출
          const sampleRate = audioBuffer.sampleRate;
          const samples = Math.min(durationSec * sampleRate, audioBuffer.length);
          const channelData = audioBuffer.getChannelData(0);
          const audioData = channelData.slice(0, samples);

          // 다운샘플링 (분석 속도 대폭 향상)
          const downsampleFactor = 20;  // 10 -> 20으로 증가
          const downsampled = new Float32Array(Math.floor(audioData.length / downsampleFactor));
          for (let i = 0; i < downsampled.length; i++) {
            downsampled[i] = audioData[i * downsampleFactor];
          }

          audioContext.close();
          resolve(downsampled);
        } catch (err) {
          reject(err);
        }
      };

      video.onerror = () => reject(new Error('비디오 로드 실패'));
    });
  };

  // 크로스 코릴레이션으로 오프셋 계산
  const crossCorrelate = (
    signal1: Float32Array,
    signal2: Float32Array,
    maxLagSamples: number
  ): { lag: number; correlation: number } => {
    let bestLag = 0;
    let bestCorrelation = -Infinity;

    // 양방향으로 lag 검사 (-maxLag ~ +maxLag)
    for (let lag = -maxLagSamples; lag <= maxLagSamples; lag++) {
      let correlation = 0;
      let count = 0;

      for (let i = 0; i < signal1.length; i++) {
        const j = i + lag;
        if (j >= 0 && j < signal2.length) {
          correlation += signal1[i] * signal2[j];
          count++;
        }
      }

      if (count > 0) {
        correlation /= count;
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestLag = lag;
        }
      }
    }

    // 신뢰도 계산 (정규화)
    const maxPossibleCorrelation = Math.sqrt(
      signal1.reduce((sum, v) => sum + v * v, 0) *
      signal2.reduce((sum, v) => sum + v * v, 0)
    ) / signal1.length;

    const confidence = maxPossibleCorrelation > 0
      ? Math.min(1, Math.abs(bestCorrelation) / maxPossibleCorrelation)
      : 0;

    return { lag: bestLag, correlation: confidence };
  };

  // 두 비디오 간 오디오 싱크 계산
  const calculateSync = useCallback(async (
    frontVideoUrl: string,
    sideVideoUrl: string
  ): Promise<AudioSyncResult> => {
    setSyncing(true);
    setError(null);
    setProgress(0);

    try {
      // 1. 오디오 추출 (빠른 병렬 처리)
      setProgress(10);
      console.log('[AudioSync] 오디오 추출 중...');

      const [frontAudio, sideAudio] = await Promise.all([
        extractAudioData(frontVideoUrl, 5),
        extractAudioData(sideVideoUrl, 5),
      ]);

      setProgress(60);
      console.log('[AudioSync] 크로스 코릴레이션 계산 중...');

      // 2. 크로스 코릴레이션
      // 최대 3초 오프셋까지 검사 (속도 향상)
      const sampleRate = 44100 / 20; // 다운샘플된 샘플레이트
      const maxLagSamples = Math.floor(3 * sampleRate);

      const { lag, correlation } = crossCorrelate(frontAudio, sideAudio, maxLagSamples);

      // 샘플 수를 밀리초로 변환
      const offsetMs = Math.round((lag / sampleRate) * 1000);

      setProgress(100);
      console.log(`[AudioSync] 결과: offset=${offsetMs}ms, confidence=${(correlation * 100).toFixed(1)}%`);

      return {
        offsetMs,
        confidence: correlation,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : '오디오 싱크 실패';
      setError(message);
      console.error('[AudioSync] 오류:', err);
      return { offsetMs: 0, confidence: 0 };
    } finally {
      setSyncing(false);
    }
  }, []);

  return {
    calculateSync,
    syncing,
    progress,
    error,
  };
}
