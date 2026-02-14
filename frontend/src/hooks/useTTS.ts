import { useCallback, useRef, useState, useEffect } from 'react';

export function useTTS() {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isSpeakingRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Load voices (they load asynchronously)
  useEffect(() => {
    // Check if speechSynthesis is available
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('[TTS] Speech synthesis not available in this browser');
      // Still set ready to true so the app can proceed without TTS
      setIsReady(true);
      return;
    }

    let voicesLoaded = false;

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      console.log('[TTS] Available voices:', availableVoices.length);

      if (availableVoices.length > 0) {
        voicesLoaded = true;
        setVoices(availableVoices);
        setIsReady(true);

        // Log Korean voices
        const koreanVoices = availableVoices.filter(v => v.lang.includes('ko'));
        console.log('[TTS] Korean voices:', koreanVoices.map(v => `${v.name} (${v.lang})`));
      }
    };

    // Try loading immediately
    loadVoices();

    // Also listen for voiceschanged event (Chrome loads voices async)
    window.speechSynthesis.onvoiceschanged = loadVoices;

    // Fallback: If voices don't load within 1 second, proceed anyway
    // The browser will use its default voice
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

  // Chrome bug workaround: Keep speechSynthesis active
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    // Chrome pauses speechSynthesis after ~15 seconds of inactivity
    const intervalId = setInterval(() => {
      if (!isSpeakingRef.current) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, []);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('[TTS] Speech synthesis not available');
      onEnd?.();
      return;
    }

    console.log('[TTS] Speaking:', text);

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Chrome bug fix: Need to resume after cancel
    window.speechSynthesis.resume();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Try to find Korean voice (prefer Google voice)
    if (voices.length > 0) {
      const koreanVoices = voices.filter(v => v.lang.includes('ko'));
      const googleKorean = koreanVoices.find(v => v.name.toLowerCase().includes('google'));
      const selectedVoice = googleKorean || koreanVoices[0] || voices[0];

      if (selectedVoice) {
        utterance.voice = selectedVoice;
        console.log('[TTS] Using voice:', selectedVoice.name, selectedVoice.lang);
      }
    }

    utterance.onstart = () => {
      console.log('[TTS] Started speaking');
      isSpeakingRef.current = true;
    };

    utterance.onend = () => {
      console.log('[TTS] Finished speaking');
      isSpeakingRef.current = false;
      onEnd?.();
    };

    utterance.onerror = (event) => {
      console.error('[TTS] Error:', event.error);
      isSpeakingRef.current = false;

      // If error is 'interrupted' it's usually fine (caused by cancel)
      if (event.error !== 'interrupted') {
        onEnd?.();
      }
    };

    utteranceRef.current = utterance;

    // Speak immediately
    try {
      window.speechSynthesis.speak(utterance);
      console.log('[TTS] speak() called');
    } catch (error) {
      console.error('[TTS] speak() error:', error);
      onEnd?.();
    }
  }, [voices]);

  const stop = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    isSpeakingRef.current = false;
  }, []);

  // Test function to verify TTS is working
  const test = useCallback(() => {
    speak('음성 테스트입니다.');
  }, [speak]);

  return {
    speak,
    stop,
    test,
    isReady,
    voiceCount: voices.length,
  };
}
