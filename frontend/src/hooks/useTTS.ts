import { useCallback, useRef, useState, useEffect } from 'react';

export function useTTS() {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isSpeakingRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // 음성 큐
  const queueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);

  // Load voices (they load asynchronously)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('[TTS] Speech synthesis not available in this browser');
      setIsReady(true);
      return;
    }

    let voicesLoaded = false;

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();

      if (availableVoices.length > 0) {
        voicesLoaded = true;
        setVoices(availableVoices);
        setIsReady(true);

        const koreanVoices = availableVoices.filter(v => v.lang.includes('ko'));
        console.log('[TTS] Korean voices:', koreanVoices.map(v => `${v.name} (${v.lang})`));
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    const fallbackTimeout = setTimeout(() => {
      if (!voicesLoaded) {
        console.warn('[TTS] Voices not loaded after 1s, proceeding with default');
        setIsReady(true);
      }
    }, 1000);

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      clearTimeout(fallbackTimeout);
    };
  }, []);

  // Chrome bug workaround
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const intervalId = setInterval(() => {
      if (!isSpeakingRef.current) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, []);

  // 큐에서 다음 음성 처리
  const processQueue = useCallback(() => {
    if (isProcessingRef.current || queueRef.current.length === 0) {
      return;
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      queueRef.current = [];
      return;
    }

    isProcessingRef.current = true;
    const text = queueRef.current.shift()!;

    console.log('[TTS] Speaking:', text);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.1; // 약간 빠르게
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    if (voices.length > 0) {
      const koreanVoices = voices.filter(v => v.lang.includes('ko'));
      const googleKorean = koreanVoices.find(v => v.name.toLowerCase().includes('google'));
      const selectedVoice = googleKorean || koreanVoices[0] || voices[0];

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }

    utterance.onstart = () => {
      isSpeakingRef.current = true;
    };

    utterance.onend = () => {
      isSpeakingRef.current = false;
      isProcessingRef.current = false;
      // 다음 큐 처리
      setTimeout(processQueue, 200); // 200ms 간격
    };

    utterance.onerror = (event) => {
      isSpeakingRef.current = false;
      isProcessingRef.current = false;

      // interrupted는 무시 (정상적인 cancel)
      if (event.error !== 'interrupted') {
        console.error('[TTS] Error:', event.error);
      }

      // 다음 큐 처리
      setTimeout(processQueue, 100);
    };

    utteranceRef.current = utterance;

    try {
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('[TTS] speak() error:', error);
      isProcessingRef.current = false;
      setTimeout(processQueue, 100);
    }
  }, [voices]);

  // 음성 큐에 추가
  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!text) return;

    // 큐에 추가
    queueRef.current.push(text);

    // 큐 처리 시작
    processQueue();

    // onEnd는 마지막 음성 완료 후 호출 (현재는 미사용)
    if (onEnd) {
      // 나중에 필요시 구현
    }
  }, [processQueue]);

  // 즉시 말하기 (큐 무시, 현재 음성 중단)
  const speakNow = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    // 큐 비우기
    queueRef.current = [];

    // 현재 음성 중단
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    isProcessingRef.current = false;
    isSpeakingRef.current = false;

    // 새 음성 시작
    speak(text);
  }, [speak]);

  // 모든 음성 중지
  const stop = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    queueRef.current = [];
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    isSpeakingRef.current = false;
    isProcessingRef.current = false;
  }, []);

  // 테스트
  const test = useCallback(() => {
    speak('음성 테스트입니다.');
  }, [speak]);

  return {
    speak,
    speakNow,
    stop,
    test,
    isReady,
    isSpeaking: isSpeakingRef.current,
    queueLength: queueRef.current.length,
    voiceCount: voices.length,
  };
}
