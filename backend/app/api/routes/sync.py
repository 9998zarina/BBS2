import os
import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from app.services.audio_sync import AudioSyncService

router = APIRouter()

UPLOAD_DIR = "uploads"

sync_jobs: dict[str, dict] = {}


class SyncRequest(BaseModel):
    front_video_id: str
    side_video_id: str
    test_item_id: int


class SyncResponse(BaseModel):
    job_id: str
    status: str
    offset_ms: Optional[float] = None
    confidence: Optional[float] = None
    error: Optional[str] = None


def find_video_path(video_id: str) -> Optional[str]:
    for filename in os.listdir(UPLOAD_DIR):
        if filename.startswith(video_id):
            return os.path.join(UPLOAD_DIR, filename)
    return None


async def process_sync(job_id: str, front_path: str, side_path: str):
    try:
        sync_jobs[job_id]["status"] = "processing"

        sync_service = AudioSyncService()
        offset_ms, confidence = await sync_service.compute_sync_offset(front_path, side_path)

        sync_jobs[job_id].update({
            "status": "completed",
            "offset_ms": offset_ms,
            "confidence": confidence
        })
    except Exception as e:
        sync_jobs[job_id].update({
            "status": "failed",
            "error": str(e)
        })


@router.post("/analyze", response_model=SyncResponse)
async def analyze_sync(request: SyncRequest, background_tasks: BackgroundTasks):
    front_path = find_video_path(request.front_video_id)
    side_path = find_video_path(request.side_video_id)

    if not front_path:
        raise HTTPException(status_code=404, detail="Front video not found")
    if not side_path:
        raise HTTPException(status_code=404, detail="Side video not found")

    job_id = str(uuid.uuid4())
    sync_jobs[job_id] = {
        "status": "pending",
        "offset_ms": None,
        "confidence": None,
        "error": None
    }

    background_tasks.add_task(process_sync, job_id, front_path, side_path)

    return SyncResponse(job_id=job_id, status="pending")


@router.get("/status/{job_id}", response_model=SyncResponse)
async def get_sync_status(job_id: str):
    if job_id not in sync_jobs:
        raise HTTPException(status_code=404, detail="Sync job not found")

    job = sync_jobs[job_id]
    return SyncResponse(
        job_id=job_id,
        status=job["status"],
        offset_ms=job["offset_ms"],
        confidence=job["confidence"],
        error=job["error"]
    )
