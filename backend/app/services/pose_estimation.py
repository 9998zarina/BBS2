import cv2
import numpy as np
from ultralytics import YOLO
from typing import Optional, List
import os

MODEL_NAME = "yolov8m-pose.pt"


class PoseEstimationService:
    """
    YOLO-Pose based pose estimation service.

    YOLO Keypoints (17 points):
    0: nose, 1: left_eye, 2: right_eye, 3: left_ear, 4: right_ear,
    5: left_shoulder, 6: right_shoulder, 7: left_elbow, 8: right_elbow,
    9: left_wrist, 10: right_wrist, 11: left_hip, 12: right_hip,
    13: left_knee, 14: right_knee, 15: left_ankle, 16: right_ankle
    """

    LANDMARK_NAMES = [
        'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
        'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
        'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
        'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
    ]

    # MediaPipe 호환 매핑 (BBS 채점에서 사용하는 키포인트)
    COMPAT_MAPPING = {
        'nose': 'nose',
        'left_eye': 'left_eye',
        'right_eye': 'right_eye',
        'left_ear': 'left_ear',
        'right_ear': 'right_ear',
        'left_shoulder': 'left_shoulder',
        'right_shoulder': 'right_shoulder',
        'left_elbow': 'left_elbow',
        'right_elbow': 'right_elbow',
        'left_wrist': 'left_wrist',
        'right_wrist': 'right_wrist',
        'left_hip': 'left_hip',
        'right_hip': 'right_hip',
        'left_knee': 'left_knee',
        'right_knee': 'right_knee',
        'left_ankle': 'left_ankle',
        'right_ankle': 'right_ankle',
        # MediaPipe에만 있는 키포인트는 가장 가까운 것으로 대체
        'left_heel': 'left_ankle',
        'right_heel': 'right_ankle',
        'left_foot_index': 'left_ankle',
        'right_foot_index': 'right_ankle',
    }

    def __init__(self):
        print(f"Loading YOLO pose model: {MODEL_NAME}")
        self.model = YOLO(MODEL_NAME)
        print("YOLO model loaded successfully")

    def process_video(self, video_path: str, select_person: str = "largest") -> list[dict]:
        """
        Process video and extract pose landmarks for each frame.

        Args:
            video_path: Path to video file
            select_person: How to select person when multiple detected
                          "largest" - select largest bounding box
                          "center" - select most centered person
                          "most_movement" - select person with most movement

        Returns:
            List of frame data with landmarks
        """
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames_data = []
        frame_number = 0

        prev_keypoints = None
        person_movements = {}

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                timestamp_ms = int((frame_number / fps) * 1000) if fps > 0 else 0

                # YOLO 추론
                results = self.model(frame, verbose=False)

                frame_data = {
                    'frame_number': frame_number,
                    'timestamp_ms': timestamp_ms,
                    'landmarks': None,
                    'has_pose': False,
                    'num_people': 0,
                    'all_poses': []
                }

                if results and len(results) > 0 and results[0].keypoints is not None:
                    keypoints = results[0].keypoints
                    boxes = results[0].boxes

                    if keypoints.xy is not None and len(keypoints.xy) > 0:
                        num_people = len(keypoints.xy)
                        frame_data['num_people'] = num_people

                        # 모든 사람의 포즈 저장
                        all_poses = []
                        for i in range(num_people):
                            kp = keypoints.xy[i].cpu().numpy()
                            conf = keypoints.conf[i].cpu().numpy() if keypoints.conf is not None else np.ones(17)
                            box = boxes.xyxy[i].cpu().numpy() if boxes is not None else None

                            pose_data = self._extract_landmarks(kp, conf)
                            pose_data['_box'] = box
                            pose_data['_box_area'] = (box[2] - box[0]) * (box[3] - box[1]) if box is not None else 0
                            pose_data['_center_x'] = (box[0] + box[2]) / 2 if box is not None else 0
                            all_poses.append(pose_data)

                        frame_data['all_poses'] = all_poses

                        # 대상 선택
                        selected_pose = self._select_person(all_poses, frame.shape, select_person)

                        if selected_pose:
                            # 내부 메타데이터 제거
                            landmarks = {k: v for k, v in selected_pose.items() if not k.startswith('_')}
                            frame_data['landmarks'] = landmarks
                            frame_data['has_pose'] = True

                frames_data.append(frame_data)
                frame_number += 1

        finally:
            cap.release()

        return frames_data

    def _select_person(self, all_poses: List[dict], frame_shape: tuple, method: str) -> Optional[dict]:
        """Select which person to track based on the method."""
        if not all_poses:
            return None

        if len(all_poses) == 1:
            return all_poses[0]

        if method == "largest":
            # 가장 큰 바운딩 박스
            return max(all_poses, key=lambda p: p.get('_box_area', 0))

        elif method == "center":
            # 화면 중앙에 가장 가까운 사람
            frame_center_x = frame_shape[1] / 2
            return min(all_poses, key=lambda p: abs(p.get('_center_x', 0) - frame_center_x))

        else:  # default to largest
            return max(all_poses, key=lambda p: p.get('_box_area', 0))

    def process_frame(self, frame, timestamp_ms: int = 0) -> Optional[dict]:
        """Process a single frame and return landmarks."""
        results = self.model(frame, verbose=False)

        print(f"[YOLO DEBUG] Results: {len(results) if results else 0}")

        if results and len(results) > 0 and results[0].keypoints is not None:
            keypoints = results[0].keypoints
            print(f"[YOLO DEBUG] Keypoints found: xy shape = {keypoints.xy.shape if keypoints.xy is not None else 'None'}")

            if keypoints.xy is not None and len(keypoints.xy) > 0:
                # 첫 번째 사람 (또는 가장 큰 사람)
                kp = keypoints.xy[0].cpu().numpy()
                conf = keypoints.conf[0].cpu().numpy() if keypoints.conf is not None else np.ones(17)
                print(f"[YOLO DEBUG] Person detected! Keypoints: {kp.shape}, Conf avg: {conf.mean():.2f}")
                return self._extract_landmarks(kp, conf)
        else:
            print(f"[YOLO DEBUG] No keypoints in results")

        return None

    def _extract_landmarks(self, keypoints: np.ndarray, confidences: np.ndarray) -> dict:
        """Convert YOLO keypoints to dictionary format compatible with BBS scoring."""
        landmarks_dict = {}

        for i, name in enumerate(self.LANDMARK_NAMES):
            if i < len(keypoints):
                landmarks_dict[name] = {
                    'x': float(keypoints[i][0]),
                    'y': float(keypoints[i][1]),
                    'z': 0.0,  # YOLO doesn't provide Z coordinate
                    'visibility': float(confidences[i]) if i < len(confidences) else 1.0
                }

        # MediaPipe 호환 키포인트 추가 (BBS 채점 코드 호환성)
        for mp_name, yolo_name in self.COMPAT_MAPPING.items():
            if mp_name not in landmarks_dict and yolo_name in landmarks_dict:
                landmarks_dict[mp_name] = landmarks_dict[yolo_name].copy()

        return landmarks_dict

    def detect_all_people(self, frame) -> List[dict]:
        """Detect all people in a frame and return their poses."""
        results = self.model(frame, verbose=False)
        all_poses = []

        if results and len(results) > 0 and results[0].keypoints is not None:
            keypoints = results[0].keypoints
            boxes = results[0].boxes

            if keypoints.xy is not None:
                for i in range(len(keypoints.xy)):
                    kp = keypoints.xy[i].cpu().numpy()
                    conf = keypoints.conf[i].cpu().numpy() if keypoints.conf is not None else np.ones(17)
                    box = boxes.xyxy[i].cpu().numpy() if boxes is not None else None

                    pose = self._extract_landmarks(kp, conf)
                    pose['bounding_box'] = box.tolist() if box is not None else None
                    pose['person_id'] = i
                    all_poses.append(pose)

        return all_poses

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
