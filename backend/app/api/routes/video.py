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

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = os.path.getsize(file_path)

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
