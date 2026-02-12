import os
import tempfile
import subprocess
import numpy as np
from scipy import signal
from scipy.io import wavfile


class AudioSyncService:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate

    async def compute_sync_offset(self, video1_path: str, video2_path: str) -> tuple[float, float]:
        """
        Compute time offset between two videos using audio cross-correlation.

        Args:
            video1_path: Path to first video (reference)
            video2_path: Path to second video

        Returns:
            Tuple of (offset_ms, confidence)
            Positive offset means video2 should be delayed
        """
        with tempfile.TemporaryDirectory() as temp_dir:
            audio1_path = os.path.join(temp_dir, "audio1.wav")
            audio2_path = os.path.join(temp_dir, "audio2.wav")

            self._extract_audio(video1_path, audio1_path)
            self._extract_audio(video2_path, audio2_path)

            offset_ms, confidence = self._compute_cross_correlation(audio1_path, audio2_path)

        return offset_ms, confidence

    def _extract_audio(self, video_path: str, audio_path: str):
        """Extract audio from video using FFmpeg."""
        command = [
            "ffmpeg",
            "-i", video_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", str(self.sample_rate),
            "-ac", "1",
            "-y",
            audio_path
        ]
        subprocess.run(command, capture_output=True, check=True)

    def _compute_cross_correlation(self, audio1_path: str, audio2_path: str) -> tuple[float, float]:
        """Compute cross-correlation between two audio files."""
        rate1, data1 = wavfile.read(audio1_path)
        rate2, data2 = wavfile.read(audio2_path)

        if rate1 != rate2:
            raise ValueError(f"Sample rates must match: {rate1} vs {rate2}")

        data1 = data1.astype(np.float64)
        data2 = data2.astype(np.float64)

        max_val1 = np.max(np.abs(data1))
        max_val2 = np.max(np.abs(data2))

        if max_val1 > 0:
            data1 = data1 / max_val1
        if max_val2 > 0:
            data2 = data2 / max_val2

        correlation = signal.correlate(data1, data2, mode='full', method='fft')

        peak_index = np.argmax(np.abs(correlation))

        offset_samples = peak_index - len(data2) + 1

        offset_ms = (offset_samples / rate1) * 1000

        peak_value = np.abs(correlation[peak_index])
        max_possible = min(len(data1), len(data2))
        confidence = min(peak_value / max_possible, 1.0) if max_possible > 0 else 0.0

        return offset_ms, confidence

    def apply_offset_to_timestamps(
        self,
        timestamps: list[float],
        offset_ms: float
    ) -> list[float]:
        """Apply sync offset to a list of timestamps."""
        return [t + offset_ms for t in timestamps]
