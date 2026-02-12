import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from typing import Optional
import urllib.request
import os

MODEL_PATH = os.path.join(os.path.dirname(__file__), "pose_landmarker.task")
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task"


def download_model_if_needed():
    """Download the pose landmarker model if not present."""
    if not os.path.exists(MODEL_PATH):
        print(f"Downloading pose landmarker model to {MODEL_PATH}...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("Model downloaded successfully.")


class PoseEstimationService:
    LANDMARK_NAMES = [
        'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
        'right_eye_inner', 'right_eye', 'right_eye_outer',
        'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
        'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
        'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
        'left_index', 'right_index', 'left_thumb', 'right_thumb',
        'left_hip', 'right_hip', 'left_knee', 'right_knee',
        'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
        'left_foot_index', 'right_foot_index'
    ]

    def __init__(self):
        download_model_if_needed()

    def _create_landmarker(self):
        """Create a new PoseLandmarker instance."""
        base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_segmentation_masks=False
        )
        return vision.PoseLandmarker.create_from_options(options)

    def process_video(self, video_path: str) -> list[dict]:
        """
        Process video and extract pose landmarks for each frame.

        Args:
            video_path: Path to video file

        Returns:
            List of frame data with landmarks
        """
        landmarker = self._create_landmarker()

        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames_data = []
        frame_number = 0

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

                timestamp_ms = int((frame_number / fps) * 1000) if fps > 0 else 0

                results = landmarker.detect(mp_image)

                frame_data = {
                    'frame_number': frame_number,
                    'timestamp_ms': timestamp_ms,
                    'landmarks': None,
                    'has_pose': False
                }

                if results.pose_landmarks and len(results.pose_landmarks) > 0:
                    frame_data['landmarks'] = self._extract_landmarks(results.pose_landmarks[0])
                    frame_data['has_pose'] = True

                frames_data.append(frame_data)
                frame_number += 1

        finally:
            cap.release()
            landmarker.close()

        return frames_data

    def process_frame(self, frame, timestamp_ms: int = 0) -> Optional[dict]:
        """Process a single frame and return landmarks."""
        landmarker = self._create_landmarker()

        try:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

            results = landmarker.detect(mp_image)

            if results.pose_landmarks and len(results.pose_landmarks) > 0:
                return self._extract_landmarks(results.pose_landmarks[0])
            return None
        finally:
            landmarker.close()

    def _extract_landmarks(self, pose_landmarks) -> dict:
        """Convert MediaPipe landmarks to dictionary."""
        landmarks_dict = {}
        for i, lm in enumerate(pose_landmarks):
            if i < len(self.LANDMARK_NAMES):
                landmarks_dict[self.LANDMARK_NAMES[i]] = {
                    'x': lm.x,
                    'y': lm.y,
                    'z': lm.z,
                    'visibility': lm.visibility if hasattr(lm, 'visibility') else lm.presence
                }
        return landmarks_dict

    def get_video_info(self, video_path: str) -> dict:
        """Get video metadata."""
        cap = cv2.VideoCapture(video_path)
        info = {
            'fps': cap.get(cv2.CAP_PROP_FPS),
            'frame_count': int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
            'width': int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            'height': int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            'duration_ms': 0
        }
        if info['fps'] > 0:
            info['duration_ms'] = (info['frame_count'] / info['fps']) * 1000
        cap.release()
        return info

    def close(self):
        """Release resources."""
        pass
