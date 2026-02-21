"""
BBS Real-time Scoring API

Simple API for scoring BBS tests with pose data from frontend MediaPipe.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.bbs_scoring import BBSScoringService
from app.utils.bbs_tests import BBS_TESTS, get_all_tests

router = APIRouter()

# Singleton scoring service
_scoring_service: Optional[BBSScoringService] = None


def get_scoring_service() -> BBSScoringService:
    global _scoring_service
    if _scoring_service is None:
        _scoring_service = BBSScoringService(fps=30.0)
    return _scoring_service


class ScoreRequest(BaseModel):
    """Request for BBS test scoring."""
    test_id: int
    frames: list[dict]


class ScoreResponse(BaseModel):
    """Response with BBS score and details."""
    score: int
    confidence: float
    reasoning: str
    criteria_met: dict
    duration_sec: float


@router.post("/score", response_model=ScoreResponse)
async def score_test(request: ScoreRequest):
    """
    Score a BBS test based on pose frames.

    Receives frames with MediaPipe landmarks from frontend,
    processes them with BBSScoringService for scoring.
    """
    # Validate test_id
    if request.test_id not in BBS_TESTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid test_id: {request.test_id}. Valid range: 1-14"
        )

    # Validate minimum frames
    if len(request.frames) < 10:
        raise HTTPException(
            status_code=400,
            detail="Minimum 10 frames required for scoring"
        )

    # Convert frames to pose data format expected by BBSScoringService
    pose_data = []
    for i, frame in enumerate(request.frames):
        landmarks = frame.get('landmarks')
        pose_data.append({
            'frame_number': i,
            'timestamp_ms': frame.get('timestamp_ms', i * 33),
            'landmarks': landmarks,
            'has_pose': landmarks is not None
        })

    # Score the test
    service = get_scoring_service()

    try:
        result = service.score_test(
            test_item_id=request.test_id,
            front_pose_data=pose_data,
            side_pose_data=[],
            sync_offset_ms=0
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Scoring failed: {str(e)}"
        )

    # Calculate duration from valid frames
    valid_frames = [f for f in pose_data if f.get('has_pose')]
    duration_sec = len(valid_frames) / 30.0

    return ScoreResponse(
        score=result.get('score', 0),
        confidence=result.get('confidence', 0.0),
        reasoning=result.get('reasoning', ''),
        criteria_met=result.get('criteria_met', {}),
        duration_sec=round(duration_sec, 1)
    )


@router.get("/tests")
async def get_tests():
    """Get all 14 BBS tests."""
    return {"tests": get_all_tests()}
