import os
import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Any
from app.services.pose_estimation import PoseEstimationService
from app.services.bbs_scoring import BBSScoringService

router = APIRouter()

UPLOAD_DIR = "uploads"

analysis_jobs: dict[str, dict] = {}


class AnalysisRequest(BaseModel):
    front_video_id: str
    side_video_id: str
    test_item_id: int
    sync_offset_ms: float


class AnalysisResponse(BaseModel):
    job_id: str
    status: str
    test_item_id: Optional[int] = None
    score: Optional[int] = None
    confidence: Optional[float] = None
    reasoning: Optional[str] = None
    pose_data: Optional[dict[str, Any]] = None
    criteria_met: Optional[dict[str, bool]] = None
    error: Optional[str] = None


def find_video_path(video_id: str) -> Optional[str]:
    for filename in os.listdir(UPLOAD_DIR):
        if filename.startswith(video_id):
            return os.path.join(UPLOAD_DIR, filename)
    return None


async def process_analysis(
    job_id: str,
    front_path: str,
    side_path: str,
    test_item_id: int,
    sync_offset_ms: float
):
    try:
        analysis_jobs[job_id]["status"] = "processing"

        pose_service = PoseEstimationService()

        front_pose_data = pose_service.process_video(front_path)
        side_pose_data = pose_service.process_video(side_path)

        scoring_service = BBSScoringService()
        result = scoring_service.score_test(
            test_item_id=test_item_id,
            front_pose_data=front_pose_data,
            side_pose_data=side_pose_data,
            sync_offset_ms=sync_offset_ms
        )

        analysis_jobs[job_id].update({
            "status": "completed",
            "test_item_id": test_item_id,
            "score": result["score"],
            "confidence": result["confidence"],
            "reasoning": result["reasoning"],
            "pose_data": {
                "frames_analyzed": len(front_pose_data) + len(side_pose_data),
                "front_frames": len(front_pose_data),
                "side_frames": len(side_pose_data)
            },
            "criteria_met": result["criteria_met"]
        })
    except Exception as e:
        analysis_jobs[job_id].update({
            "status": "failed",
            "error": str(e)
        })


@router.post("/start", response_model=AnalysisResponse)
async def start_analysis(request: AnalysisRequest, background_tasks: BackgroundTasks):
    front_path = find_video_path(request.front_video_id)
    side_path = find_video_path(request.side_video_id)

    if not front_path:
        raise HTTPException(status_code=404, detail="Front video not found")
    if not side_path:
        raise HTTPException(status_code=404, detail="Side video not found")

    if request.test_item_id < 1 or request.test_item_id > 14:
        raise HTTPException(status_code=400, detail="Test item ID must be between 1 and 14")

    job_id = str(uuid.uuid4())
    analysis_jobs[job_id] = {
        "status": "pending",
        "test_item_id": request.test_item_id,
        "score": None,
        "confidence": None,
        "reasoning": None,
        "pose_data": None,
        "criteria_met": None,
        "error": None
    }

    background_tasks.add_task(
        process_analysis,
        job_id,
        front_path,
        side_path,
        request.test_item_id,
        request.sync_offset_ms
    )

    return AnalysisResponse(job_id=job_id, status="pending")


@router.get("/status/{job_id}", response_model=AnalysisResponse)
async def get_analysis_status(job_id: str):
    if job_id not in analysis_jobs:
        raise HTTPException(status_code=404, detail="Analysis job not found")

    job = analysis_jobs[job_id]
    return AnalysisResponse(job_id=job_id, **job)


@router.get("/result/{job_id}", response_model=AnalysisResponse)
async def get_analysis_result(job_id: str):
    if job_id not in analysis_jobs:
        raise HTTPException(status_code=404, detail="Analysis job not found")

    job = analysis_jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail=f"Analysis not completed. Current status: {job['status']}")

    return AnalysisResponse(job_id=job_id, **job)
