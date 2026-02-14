"""
Real-time Camera Analysis API

Processes individual frames from camera for real-time BBS assessment.
"""

import base64
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.pose_estimation import PoseEstimationService
from app.services.action_recognition import ActionRecognitionService
from app.services.bbs_scoring import BBSScoringService

router = APIRouter()

# 서비스 싱글톤 (메모리 효율)
_pose_service: Optional[PoseEstimationService] = None
_action_service: Optional[ActionRecognitionService] = None
_scoring_service: Optional[BBSScoringService] = None

def get_pose_service() -> PoseEstimationService:
    global _pose_service
    if _pose_service is None:
        _pose_service = PoseEstimationService()
    return _pose_service

def get_action_service() -> ActionRecognitionService:
    global _action_service
    if _action_service is None:
        _action_service = ActionRecognitionService()
    return _action_service

def get_scoring_service() -> BBSScoringService:
    global _scoring_service
    if _scoring_service is None:
        _scoring_service = BBSScoringService()
    return _scoring_service


class FrameAnalysisRequest(BaseModel):
    """Request for single frame analysis."""
    image_data: str  # Base64 encoded JPEG image
    timestamp_ms: int = 0
    selected_test_id: Optional[int] = None  # If user selected a specific test


class FrameAnalysisResponse(BaseModel):
    """Response with pose detection and optional scoring."""
    has_pose: bool
    num_people: int = 0
    landmarks: Optional[dict] = None
    keypoints_2d: Optional[list] = None  # For drawing skeleton
    detected_test_id: Optional[int] = None
    detected_test_name: Optional[str] = None
    detected_test_name_ko: Optional[str] = None
    detection_confidence: Optional[float] = None
    error: Optional[str] = None


class SessionAnalysisRequest(BaseModel):
    """Request for analyzing a complete capture session."""
    frames: list[dict]  # List of {landmarks, timestamp_ms}
    selected_test_id: Optional[int] = None


class SessionAnalysisResponse(BaseModel):
    """Response with full BBS scoring."""
    detected_test_id: int
    detected_test_name: str
    detected_test_name_ko: str
    detection_confidence: float
    score: int
    scoring_confidence: float
    reasoning: str
    criteria_met: dict
    all_test_scores: Optional[dict] = None
    error: Optional[str] = None


def decode_base64_image(image_data: str) -> np.ndarray:
    """Decode base64 image to numpy array."""
    # Remove data URL prefix if present
    if ',' in image_data:
        image_data = image_data.split(',')[1]

    img_bytes = base64.b64decode(image_data)
    img_array = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Failed to decode image")

    return img


@router.post("/frame", response_model=FrameAnalysisResponse)
async def analyze_frame(request: FrameAnalysisRequest):
    """
    Analyze a single camera frame.

    Returns pose landmarks for real-time visualization.
    """
    try:
        # Decode image
        frame = decode_base64_image(request.image_data)
        print(f"[DEBUG] Frame decoded: shape={frame.shape}, dtype={frame.dtype}")

        # Get pose estimation
        pose_service = get_pose_service()
        landmarks = pose_service.process_frame(frame, request.timestamp_ms)

        print(f"[DEBUG] Landmarks result: {landmarks is not None}, keys={list(landmarks.keys()) if landmarks else 'None'}")

        if landmarks is None:
            print("[DEBUG] No pose detected in frame")
            return FrameAnalysisResponse(
                has_pose=False,
                num_people=0
            )

        # Extract 2D keypoints for skeleton drawing
        keypoints_2d = []
        for name in pose_service.LANDMARK_NAMES:
            if name in landmarks:
                lm = landmarks[name]
                keypoints_2d.append({
                    'name': name,
                    'x': lm['x'],
                    'y': lm['y'],
                    'visibility': lm.get('visibility', 1.0)
                })

        return FrameAnalysisResponse(
            has_pose=True,
            num_people=1,
            landmarks=landmarks,
            keypoints_2d=keypoints_2d
        )

    except Exception as e:
        return FrameAnalysisResponse(
            has_pose=False,
            error=str(e)
        )


@router.post("/session", response_model=SessionAnalysisResponse)
async def analyze_session(request: SessionAnalysisRequest):
    """
    Analyze a complete capture session.

    Takes accumulated frames and performs:
    1. Test detection (which BBS test is being performed)
    2. BBS scoring based on pose data
    """
    try:
        if len(request.frames) < 10:
            raise HTTPException(
                status_code=400,
                detail="최소 10프레임 이상의 데이터가 필요합니다."
            )

        # Convert frames to pose data format
        pose_data = []
        for i, frame in enumerate(request.frames):
            pose_data.append({
                'frame_number': i,
                'timestamp_ms': frame.get('timestamp_ms', i * 100),
                'landmarks': frame.get('landmarks'),
                'has_pose': frame.get('landmarks') is not None
            })

        # Detect test if not specified
        action_service = get_action_service()

        if request.selected_test_id:
            detected_test_id = request.selected_test_id
            detection_confidence = 1.0

            # Get test name from service
            from app.utils.bbs_tests import BBS_TESTS
            test_info = BBS_TESTS.get(detected_test_id, {})
            test_name = test_info.get('name', 'Unknown')
            test_name_ko = test_info.get('name_ko', '알 수 없음')
            all_test_scores = None
        else:
            detected_test_id, detection_confidence, analysis = action_service.recognize_test(pose_data)
            test_name = analysis['test_name']
            test_name_ko = analysis['test_name_ko']
            all_test_scores = {str(k): v for k, v in analysis['all_scores'].items()}

        if detected_test_id == 0:
            raise HTTPException(
                status_code=400,
                detail="검사 동작을 인식할 수 없습니다. 다시 촬영해주세요."
            )

        # Score the test
        scoring_service = get_scoring_service()
        result = scoring_service.score_test(
            test_item_id=detected_test_id,
            front_pose_data=pose_data,
            side_pose_data=[],
            sync_offset_ms=0
        )

        return SessionAnalysisResponse(
            detected_test_id=detected_test_id,
            detected_test_name=test_name,
            detected_test_name_ko=test_name_ko,
            detection_confidence=detection_confidence,
            score=result["score"],
            scoring_confidence=result["confidence"],
            reasoning=result["reasoning"],
            criteria_met=result["criteria_met"],
            all_test_scores=all_test_scores
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ContinuousAnalysisRequest(BaseModel):
    """Request for continuous analysis with action completion detection."""
    frames: list[dict]  # Recent frames buffer
    current_test_id: int  # Which test we're expecting
    min_duration_ms: int = 3000  # Minimum duration to consider action complete


class ContinuousAnalysisResponse(BaseModel):
    """Response with action status and scoring if complete."""
    action_detected: bool  # Is the expected action being performed
    action_complete: bool  # Has the action been completed
    progress_percent: float  # 0-100 progress toward completion
    duration_ms: int  # How long the action has been detected
    score: Optional[int] = None  # Score if action complete
    interim_score: Optional[int] = None  # Real-time interim score (always calculated)
    scoring_confidence: Optional[float] = None
    reasoning: Optional[str] = None
    criteria_met: Optional[dict] = None
    feedback: str = ""  # Real-time feedback for user


@router.post("/continuous", response_model=ContinuousAnalysisResponse)
async def analyze_continuous(request: ContinuousAnalysisRequest):
    """
    Analyze frames continuously for a specific BBS test.

    Detects when the expected action is being performed and when it's complete.
    Returns progress and feedback in real-time.
    """
    try:
        if len(request.frames) < 5:
            return ContinuousAnalysisResponse(
                action_detected=False,
                action_complete=False,
                progress_percent=0,
                duration_ms=0,
                feedback="포즈를 준비해주세요..."
            )

        # Convert frames to pose data format
        pose_data = []
        for i, frame in enumerate(request.frames):
            pose_data.append({
                'frame_number': i,
                'timestamp_ms': frame.get('timestamp_ms', i * 100),
                'landmarks': frame.get('landmarks'),
                'has_pose': frame.get('landmarks') is not None
            })

        valid_frames = [f for f in pose_data if f.get('has_pose')]
        if len(valid_frames) < 5:
            return ContinuousAnalysisResponse(
                action_detected=False,
                action_complete=False,
                progress_percent=0,
                duration_ms=0,
                feedback="사람이 감지되지 않습니다. 카메라 앞에 서주세요."
            )

        # Check if the expected action is being performed
        action_service = get_action_service()
        detected_test_id, confidence, analysis = action_service.recognize_test(pose_data)

        # Get test info
        from app.utils.bbs_tests import BBS_TESTS
        test_info = BBS_TESTS.get(request.current_test_id, {})
        test_name_ko = test_info.get('name_ko', '')
        required_duration = test_info.get('duration_seconds', 3) * 1000  # Convert to ms

        # Check if the detected action matches expected
        action_detected = detected_test_id == request.current_test_id and confidence > 0.3

        # Calculate duration
        if valid_frames:
            first_ts = valid_frames[0].get('timestamp_ms', 0)
            last_ts = valid_frames[-1].get('timestamp_ms', 0)
            duration_ms = last_ts - first_ts
        else:
            duration_ms = 0

        # Calculate progress
        if required_duration > 0:
            progress_percent = min(100, (duration_ms / required_duration) * 100)
        else:
            # For non-timed tests, use frame count as proxy
            progress_percent = min(100, (len(valid_frames) / 30) * 100)  # ~30 frames = 100%

        # Determine if action is complete
        action_complete = False
        score = None
        interim_score = None
        scoring_confidence = None
        reasoning = None
        criteria_met = None

        # Always try to calculate interim score if we have enough frames
        scoring_service = get_scoring_service()
        if len(valid_frames) >= 10:
            try:
                result = scoring_service.score_test(
                    test_item_id=request.current_test_id,
                    front_pose_data=pose_data,
                    side_pose_data=[],
                    sync_offset_ms=0
                )
                interim_score = result["score"]
                scoring_confidence = result["confidence"]
                reasoning = result["reasoning"]
                criteria_met = result["criteria_met"]
            except Exception as e:
                print(f"[Interim Score] Error: {e}")
                interim_score = None

        # Check completion criteria
        min_frames_for_completion = 30  # At least 30 valid frames
        if action_detected and len(valid_frames) >= min_frames_for_completion:
            if duration_ms >= request.min_duration_ms or duration_ms >= required_duration:
                action_complete = True
                score = interim_score  # Final score = interim score at completion

        # Generate feedback with real-time score
        if action_complete:
            feedback = f"✓ {test_name_ko} 완료! 점수: {score}/4"
        elif action_detected and interim_score is not None:
            remaining = max(0, required_duration - duration_ms) / 1000
            if remaining > 0:
                feedback = f"현재 점수: {interim_score}/4 | {remaining:.1f}초 더 유지"
            else:
                feedback = f"현재 점수: {interim_score}/4 | 조금만 더!"
        elif action_detected:
            remaining = max(0, required_duration - duration_ms) / 1000
            feedback = f"동작 감지됨! {remaining:.1f}초 더 유지하세요."
        else:
            feedback = f"'{test_name_ko}' 동작을 수행해주세요."

        return ContinuousAnalysisResponse(
            action_detected=action_detected,
            action_complete=action_complete,
            progress_percent=progress_percent,
            duration_ms=duration_ms,
            score=score,
            interim_score=interim_score,
            scoring_confidence=scoring_confidence,
            reasoning=reasoning,
            criteria_met=criteria_met,
            feedback=feedback
        )

    except Exception as e:
        return ContinuousAnalysisResponse(
            action_detected=False,
            action_complete=False,
            progress_percent=0,
            duration_ms=0,
            feedback=f"분석 오류: {str(e)}"
        )


@router.get("/tests")
async def get_available_tests():
    """Get list of available BBS tests for selection."""
    from app.utils.bbs_tests import BBS_TESTS

    tests = []
    for test_id, info in BBS_TESTS.items():
        tests.append({
            'id': test_id,
            'name': info.get('name', ''),
            'name_ko': info.get('name_ko', ''),
            'description': info.get('description', ''),
            'duration_seconds': info.get('duration_seconds')
        })

    return {'tests': sorted(tests, key=lambda x: x['id'])}
