"""
Automatic BBS Analysis API

Automatically detects which BBS test is being performed and scores it.
"""

import os
import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Any
from app.services.pose_estimation import PoseEstimationService
from app.services.action_recognition import ActionRecognitionService
from app.services.bbs_scoring import BBSScoringService

router = APIRouter()

UPLOAD_DIR = "uploads"

auto_analysis_jobs: dict[str, dict] = {}


class AutoAnalysisRequest(BaseModel):
    front_video_id: str
    side_video_id: Optional[str] = None
    sync_offset_ms: float = 0.0


class AutoAnalysisResponse(BaseModel):
    job_id: str
    status: str
    detected_test_id: Optional[int] = None
    detected_test_name: Optional[str] = None
    detected_test_name_ko: Optional[str] = None
    detection_confidence: Optional[float] = None
    score: Optional[int] = None
    scoring_confidence: Optional[float] = None
    reasoning: Optional[str] = None
    criteria_met: Optional[dict[str, bool]] = None
    all_test_scores: Optional[dict[str, float]] = None
    error: Optional[str] = None


def find_video_path(video_id: str) -> Optional[str]:
    if not os.path.exists(UPLOAD_DIR):
        return None
    for filename in os.listdir(UPLOAD_DIR):
        if filename.startswith(video_id):
            return os.path.join(UPLOAD_DIR, filename)
    return None


async def process_auto_analysis(
    job_id: str,
    front_path: str,
    side_path: Optional[str],
    sync_offset_ms: float
):
    """Process automatic BBS test detection and scoring."""
    try:
        auto_analysis_jobs[job_id]["status"] = "processing"

        # 1. 포즈 추정
        pose_service = PoseEstimationService()
        front_pose_data = pose_service.process_video(front_path)

        side_pose_data = []
        if side_path:
            side_pose_data = pose_service.process_video(side_path)

        # 2. 검사 자동 인식
        action_service = ActionRecognitionService()
        detected_test_id, detection_confidence, analysis = action_service.recognize_test(front_pose_data)

        if detected_test_id == 0:
            auto_analysis_jobs[job_id].update({
                "status": "failed",
                "error": "검사 동작을 인식할 수 없습니다. 영상을 확인해주세요."
            })
            return

        auto_analysis_jobs[job_id].update({
            "detected_test_id": detected_test_id,
            "detected_test_name": analysis['test_name'],
            "detected_test_name_ko": analysis['test_name_ko'],
            "detection_confidence": detection_confidence,
            "all_test_scores": {str(k): v for k, v in analysis['all_scores'].items()}
        })

        # 3. BBS 채점
        scoring_service = BBSScoringService()
        result = scoring_service.score_test(
            test_item_id=detected_test_id,
            front_pose_data=front_pose_data,
            side_pose_data=side_pose_data,
            sync_offset_ms=sync_offset_ms
        )

        auto_analysis_jobs[job_id].update({
            "status": "completed",
            "score": result["score"],
            "scoring_confidence": result["confidence"],
            "reasoning": result["reasoning"],
            "criteria_met": result["criteria_met"]
        })

    except Exception as e:
        auto_analysis_jobs[job_id].update({
            "status": "failed",
            "error": str(e)
        })


@router.post("/start", response_model=AutoAnalysisResponse)
async def start_auto_analysis(request: AutoAnalysisRequest, background_tasks: BackgroundTasks):
    """
    Start automatic BBS analysis.

    The system will:
    1. Analyze the video to detect which BBS test is being performed
    2. Automatically score the detected test
    """
    front_path = find_video_path(request.front_video_id)
    if not front_path:
        raise HTTPException(status_code=404, detail="Front video not found")

    side_path = None
    if request.side_video_id:
        side_path = find_video_path(request.side_video_id)

    job_id = str(uuid.uuid4())
    auto_analysis_jobs[job_id] = {
        "status": "pending",
        "detected_test_id": None,
        "detected_test_name": None,
        "detected_test_name_ko": None,
        "detection_confidence": None,
        "score": None,
        "scoring_confidence": None,
        "reasoning": None,
        "criteria_met": None,
        "all_test_scores": None,
        "error": None
    }

    background_tasks.add_task(
        process_auto_analysis,
        job_id,
        front_path,
        side_path,
        request.sync_offset_ms
    )

    return AutoAnalysisResponse(job_id=job_id, status="pending")


@router.get("/status/{job_id}", response_model=AutoAnalysisResponse)
async def get_auto_analysis_status(job_id: str):
    """Get status of automatic analysis job."""
    if job_id not in auto_analysis_jobs:
        raise HTTPException(status_code=404, detail="Analysis job not found")

    job = auto_analysis_jobs[job_id]
    return AutoAnalysisResponse(job_id=job_id, **job)


@router.get("/result/{job_id}", response_model=AutoAnalysisResponse)
async def get_auto_analysis_result(job_id: str):
    """Get result of automatic analysis job."""
    if job_id not in auto_analysis_jobs:
        raise HTTPException(status_code=404, detail="Analysis job not found")

    job = auto_analysis_jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Analysis not completed. Current status: {job['status']}"
        )

    return AutoAnalysisResponse(job_id=job_id, **job)
