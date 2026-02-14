import os
import uuid
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 최대 파일 크기: 2GB
MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024


class VideoMetadata(BaseModel):
    id: str
    filename: str
    size: int
    uploaded_at: datetime


class VideoUploadResponse(BaseModel):
    id: str
    filename: str
    size: int
    message: str


@router.post("/upload", response_model=VideoUploadResponse)
async def upload_video(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")

    video_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename or "video.mp4")[1]
    saved_filename = f"{video_id}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, saved_filename)

    # 청크 단위로 파일 저장 (대용량 파일 지원)
    file_size = 0
    try:
        with open(file_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):  # 1MB 청크
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    buffer.close()
                    os.remove(file_path)
                    raise HTTPException(
                        status_code=413,
                        detail=f"파일이 너무 큽니다. 최대 2GB까지 업로드 가능합니다. (현재: {file_size / (1024*1024):.1f}MB)"
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"파일 업로드 실패: {str(e)}")

    return VideoUploadResponse(
        id=video_id,
        filename=saved_filename,
        size=file_size,
        message="Video uploaded successfully"
    )


@router.get("/{video_id}")
async def get_video(video_id: str):
    for filename in os.listdir(UPLOAD_DIR):
        if filename.startswith(video_id):
            file_path = os.path.join(UPLOAD_DIR, filename)
            return FileResponse(file_path, media_type="video/mp4")

    raise HTTPException(status_code=404, detail="Video not found")


@router.delete("/{video_id}")
async def delete_video(video_id: str):
    for filename in os.listdir(UPLOAD_DIR):
        if filename.startswith(video_id):
            file_path = os.path.join(UPLOAD_DIR, filename)
            os.remove(file_path)
            return {"message": "Video deleted successfully"}

    raise HTTPException(status_code=404, detail="Video not found")
