import { useCallback, useState, useRef } from 'react';
import { videoApi } from '../../services/api';
import type { VideoUploadResponse } from '../../types';

interface VideoUploaderProps {
  label: string;
  onUpload: (response: VideoUploadResponse, file: File) => void;
  currentVideoId?: string | null;
  disabled?: boolean;
}

export function VideoUploader({ label, onUpload, currentVideoId, disabled }: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/')) {
      setError('비디오 파일만 업로드할 수 있습니다.');
      return;
    }

    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('파일 크기는 500MB 이하여야 합니다.');
      return;
    }

    setError(null);
    setIsUploading(true);
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await videoApi.upload(file);

      clearInterval(progressInterval);
      setProgress(100);

      onUpload(response, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드에 실패했습니다.');
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  }, [onUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [disabled, handleFile]);

  const handleClick = useCallback(() => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [disabled, isUploading]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>

      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
          transition-colors duration-200
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${currentVideoId ? 'bg-green-50 border-green-300' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled || isUploading}
        />

        {isUploading ? (
          <div className="space-y-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600">업로드 중... {progress}%</p>
          </div>
        ) : currentVideoId ? (
          <div className="space-y-2">
            <div className="text-green-600">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-green-600 font-medium">영상 업로드 완료</p>
            <p className="text-xs text-gray-500">다른 영상을 업로드하려면 클릭하세요</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-gray-400">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-sm text-gray-600">
              영상 파일을 드래그하거나 클릭하여 업로드
            </p>
            <p className="text-xs text-gray-400">
              MP4, MOV, AVI (최대 500MB)
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
