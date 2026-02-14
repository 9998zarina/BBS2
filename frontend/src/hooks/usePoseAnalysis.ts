import { useCallback } from 'react';
import type { PoseResult } from './useMediaPipePose';

export type PoseState = 'unknown' | 'sitting' | 'standing' | 'standing_feet_together';

export interface PoseAnalysis {
  state: PoseState;
  confidence: number;
  details: {
    hipY: number;
    kneeAngle: number;
    hipAngle: number;  // Torso to thigh angle
    ankleDistance: number;
    hipKneeRatio: number;  // Vertical distance ratio
    isStable: boolean;
    isFrontView: boolean;
  };
}

export function usePoseAnalysis() {
  // Calculate angle between three points (2D)
  const calculateAngle = useCallback((
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number }
  ): number => {
    const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angle = Math.abs(radians * 180 / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  }, []);

  // Calculate distance between two points
  const calculateDistance = useCallback((
    p1: { x: number; y: number },
    p2: { x: number; y: number }
  ): number => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }, []);

  // Check if viewing from front (hips are roughly at same X position)
  const isFrontView = useCallback((
    leftHip: { x: number; y: number },
    rightHip: { x: number; y: number },
    leftShoulder: { x: number; y: number },
    rightShoulder: { x: number; y: number }
  ): boolean => {
    const hipWidth = Math.abs(leftHip.x - rightHip.x);
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    // In front view, both hips and shoulders are visible with similar width
    return hipWidth > 0.05 && shoulderWidth > 0.05;
  }, []);

  // Analyze pose to determine state
  const analyzePose = useCallback((pose: PoseResult): PoseAnalysis => {
    const landmarks = pose.landmarks;

    // Get key landmarks (MediaPipe indices)
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    // 최소 가시성 체크 (주요 랜드마크가 보여야 함)
    const minVisibility = 0.3;
    const keyLandmarksVisible =
      leftHip.visibility > minVisibility && rightHip.visibility > minVisibility &&
      leftKnee.visibility > minVisibility && rightKnee.visibility > minVisibility &&
      leftShoulder.visibility > minVisibility && rightShoulder.visibility > minVisibility;

    if (!keyLandmarksVisible) {
      // 주요 랜드마크가 안 보이면 unknown 반환
      console.log('[Pose] Key landmarks not visible');
      return {
        state: 'unknown',
        confidence: 0,
        details: {
          hipY: 0.5,
          kneeAngle: 0,
          hipAngle: 0,
          ankleDistance: 0,
          hipKneeRatio: 0,
          isStable: false,
          isFrontView: false,
        },
      };
    }

    // Calculate center points
    const hipCenter = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2
    };
    const kneeCenter = {
      x: (leftKnee.x + rightKnee.x) / 2,
      y: (leftKnee.y + rightKnee.y) / 2
    };
    const ankleCenter = {
      x: (leftAnkle.x + rightAnkle.x) / 2,
      y: (leftAnkle.y + rightAnkle.y) / 2
    };
    // shoulderCenter is not used currently but may be useful for future features
    // const shoulderCenter = {
    //   x: (leftShoulder.x + rightShoulder.x) / 2,
    //   y: (leftShoulder.y + rightShoulder.y) / 2
    // };

    // Check view angle
    const frontView = isFrontView(leftHip, rightHip, leftShoulder, rightShoulder);

    // Calculate hip Y position (normalized 0-1, lower = higher in frame)
    const hipY = hipCenter.y;

    // Calculate knee angles (straight leg ≈ 180°, bent ≈ 90°)
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    // Calculate hip angles (torso to thigh angle)
    // Shoulder -> Hip -> Knee angle
    const leftHipAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
    const rightHipAngle = calculateAngle(rightShoulder, rightHip, rightKnee);
    const avgHipAngle = (leftHipAngle + rightHipAngle) / 2;

    // Calculate vertical distance ratios for front view detection
    // In sitting: hip-to-knee distance is small, knee-to-ankle distance is larger
    const hipToKneeY = Math.abs(kneeCenter.y - hipCenter.y);
    const kneeToAnkleY = Math.abs(ankleCenter.y - kneeCenter.y);
    const hipKneeRatio = hipToKneeY / Math.max(0.01, kneeToAnkleY);

    // Calculate ankle distance (normalized by shoulder width)
    const shoulderWidth = calculateDistance(leftShoulder, rightShoulder);
    const ankleDistance = calculateDistance(leftAnkle, rightAnkle) / Math.max(0.01, shoulderWidth);

    // Calculate stability (how much the shoulders are level)
    const shoulderLevelDiff = Math.abs(leftShoulder.y - rightShoulder.y);
    const isStable = shoulderLevelDiff < 0.05;

    // ===== SITTING DETECTION =====
    // 앉은 자세: 무릎 굽힘 + 골반 굽힘
    let sittingScore = 0;

    // 1. 무릎 각도 (앉으면 90-130°)
    if (avgKneeAngle < 110) {
      sittingScore += 0.5;  // 매우 굽힌 상태
    } else if (avgKneeAngle < 125) {
      sittingScore += 0.35;
    } else if (avgKneeAngle < 135) {
      sittingScore += 0.2;
    }

    // 2. 골반 각도 (앉으면 60-120°, 상체-허벅지 각도)
    if (avgHipAngle < 100 && avgHipAngle > 50) {
      sittingScore += 0.4;  // 확실히 앉은 상태
    } else if (avgHipAngle < 120 && avgHipAngle > 40) {
      sittingScore += 0.25;
    } else if (avgHipAngle < 135 && avgHipAngle > 30) {
      sittingScore += 0.15;
    }

    // 3. 정면 뷰: 골반-무릎 수직 거리가 작음 (앉으면 허벅지가 거의 수평)
    if (frontView && hipKneeRatio < 0.3) {
      sittingScore += 0.25;
    } else if (frontView && hipKneeRatio < 0.5) {
      sittingScore += 0.1;
    }

    // ===== STANDING DETECTION =====
    // 서있는 자세: 무릎 펴짐 + 골반 펴짐
    let standingScore = 0;

    // 1. 무릎 각도 (서면 150-180°)
    if (avgKneeAngle > 160) {
      standingScore += 0.5;  // 완전히 펴진 상태
    } else if (avgKneeAngle > 150) {
      standingScore += 0.4;
    } else if (avgKneeAngle > 140) {
      standingScore += 0.3;
    } else if (avgKneeAngle > 135) {
      standingScore += 0.15;  // 약간 굽힌 서있는 상태
    }

    // 2. 골반 각도 (서면 140-180°, 상체-허벅지 직선)
    if (avgHipAngle > 160) {
      standingScore += 0.4;  // 완전히 펴진 상태
    } else if (avgHipAngle > 150) {
      standingScore += 0.3;
    } else if (avgHipAngle > 140) {
      standingScore += 0.2;
    } else if (avgHipAngle > 130) {
      standingScore += 0.1;
    }

    // 3. 정면 뷰: 골반-무릎 수직 거리가 큼 (서면 다리가 수직)
    if (frontView && hipKneeRatio > 0.7) {
      standingScore += 0.2;
    } else if (frontView && hipKneeRatio > 0.5) {
      standingScore += 0.1;
    }

    // 4. Hip Y 위치 보정 (서면 화면 중상단)
    if (hipY < 0.4) {
      standingScore += 0.1;
    } else if (hipY > 0.6) {
      sittingScore += 0.1;
    }

    // Determine pose state
    let state: PoseState = 'unknown';
    let confidence = 0;

    // Debug logging (10% of frames)
    if (Math.random() < 0.1) {
      console.log(`[Pose] knee:${avgKneeAngle.toFixed(0)}° hip:${avgHipAngle.toFixed(0)}° ratio:${hipKneeRatio.toFixed(2)} hipY:${hipY.toFixed(2)} sit:${sittingScore.toFixed(2)} stand:${standingScore.toFixed(2)}`);
    }

    // 상태 판단 (더 유연한 임계값)
    if (sittingScore >= 0.35 && sittingScore > standingScore + 0.1) {
      // 앉은 상태 (앉은 점수가 0.35 이상이고, 서있는 점수보다 0.1 이상 높으면)
      state = 'sitting';
      confidence = Math.min(1, sittingScore);
    } else if (standingScore >= 0.25 && standingScore > sittingScore) {
      // 서있는 상태 (서있는 점수가 0.25 이상이고, 앉은 점수보다 높으면)
      if (ankleDistance < 0.5) {
        state = 'standing_feet_together';
        confidence = Math.min(1, standingScore + (0.5 - ankleDistance) * 0.3);
      } else {
        state = 'standing';
        confidence = Math.min(1, standingScore);
      }
    } else if (standingScore >= 0.2) {
      // 낮은 확신도로 서있는 상태
      state = 'standing';
      confidence = standingScore * 0.8;
    } else if (sittingScore >= 0.25) {
      // 낮은 확신도로 앉은 상태
      state = 'sitting';
      confidence = sittingScore * 0.8;
    }

    return {
      state,
      confidence,
      details: {
        hipY,
        kneeAngle: avgKneeAngle,
        hipAngle: avgHipAngle,
        ankleDistance,
        hipKneeRatio,
        isStable,
        isFrontView: frontView,
      },
    };
  }, [calculateAngle, calculateDistance, isFrontView]);

  // Check specific pose criteria
  const checkSittingToStanding = useCallback((
    history: PoseAnalysis[],
    _durationMs: number
  ): { phase: 'waiting' | 'sitting' | 'standing' | 'complete'; usedHands: boolean; attempts: number } => {
    if (history.length < 5) {
      return { phase: 'waiting', usedHands: false, attempts: 0 };
    }

    const recentHistory = history.slice(-30); // Last ~1 second at 30fps
    const sittingFrames = recentHistory.filter(h => h.state === 'sitting').length;
    const standingFrames = recentHistory.filter(h => h.state === 'standing' || h.state === 'standing_feet_together').length;

    // Check sequence: sitting → standing
    const lastPose = history[history.length - 1];

    if (sittingFrames > standingFrames && lastPose.state === 'sitting') {
      return { phase: 'sitting', usedHands: false, attempts: 0 };
    }

    if (lastPose.state === 'standing' || lastPose.state === 'standing_feet_together') {
      // Check if we transitioned from sitting to standing
      const hadSitting = history.slice(-60).some(h => h.state === 'sitting');
      if (hadSitting) {
        return { phase: 'complete', usedHands: false, attempts: 1 };
      }
      return { phase: 'standing', usedHands: false, attempts: 0 };
    }

    return { phase: 'waiting', usedHands: false, attempts: 0 };
  }, []);

  // Check standing duration
  const checkStandingDuration = useCallback((
    history: PoseAnalysis[],
    _requiredDurationMs: number,
    startTime: number
  ): { isStanding: boolean; durationMs: number; stability: number } => {
    const standingHistory = history.filter(
      h => h.state === 'standing' || h.state === 'standing_feet_together'
    );

    const isStanding = standingHistory.length > history.length * 0.8;
    const durationMs = Date.now() - startTime;
    const stability = standingHistory.reduce((sum, h) => sum + (h.details.isStable ? 1 : 0), 0) / Math.max(1, standingHistory.length);

    return { isStanding, durationMs, stability };
  }, []);

  // Check sitting duration (for test 3)
  const checkSittingDuration = useCallback((
    history: PoseAnalysis[],
    startTime: number
  ): { isSitting: boolean; durationMs: number; hasGoodPosture: boolean } => {
    const sittingHistory = history.filter(h => h.state === 'sitting');
    const isSitting = sittingHistory.length > history.length * 0.8;
    const durationMs = Date.now() - startTime;

    // Good posture: stable shoulders
    const hasGoodPosture = sittingHistory.reduce((sum, h) => sum + (h.details.isStable ? 1 : 0), 0) / Math.max(1, sittingHistory.length) > 0.7;

    return { isSitting, durationMs, hasGoodPosture };
  }, []);

  // Check standing to sitting (for test 4)
  const checkStandingToSitting = useCallback((
    history: PoseAnalysis[]
  ): { phase: 'standing' | 'transitioning' | 'sitting'; quality: 'smooth' | 'controlled' | 'uncontrolled' } => {
    if (history.length < 10) {
      return { phase: 'standing', quality: 'smooth' };
    }

    const lastPose = history[history.length - 1];
    const recentHistory = history.slice(-30);

    // Calculate transition speed
    if (history.length > 20) {
      const hipYChange = history.slice(-20).map((h, i, arr) => {
        if (i === 0) return 0;
        return h.details.hipY - arr[i - 1].details.hipY;
      });
      const avgChange = hipYChange.reduce((a, b) => a + b, 0) / hipYChange.length;

      // Fast downward movement = uncontrolled
      if (avgChange > 0.02) {
        return { phase: 'transitioning', quality: 'uncontrolled' };
      }
    }

    if (lastPose.state === 'sitting') {
      const transitionFrames = recentHistory.filter(h => h.state !== 'sitting' && h.state !== 'standing').length;
      const quality = transitionFrames > 10 ? 'controlled' : 'smooth';
      return { phase: 'sitting', quality };
    }

    if (lastPose.state === 'standing' || lastPose.state === 'standing_feet_together') {
      return { phase: 'standing', quality: 'smooth' };
    }

    return { phase: 'transitioning', quality: 'controlled' };
  }, []);

  // Check feet together standing (for test 7)
  const checkFeetTogetherStanding = useCallback((
    history: PoseAnalysis[],
    startTime: number
  ): { isFeetTogether: boolean; durationMs: number; stability: number } => {
    const feetTogetherHistory = history.filter(h => h.state === 'standing_feet_together');
    const isFeetTogether = feetTogetherHistory.length > history.length * 0.7;
    const durationMs = Date.now() - startTime;
    const stability = feetTogetherHistory.reduce((sum, h) => sum + (h.details.isStable ? 1 : 0), 0) / Math.max(1, feetTogetherHistory.length);

    return { isFeetTogether, durationMs, stability };
  }, []);

  return {
    analyzePose,
    checkSittingToStanding,
    checkStandingDuration,
    checkSittingDuration,
    checkStandingToSitting,
    checkFeetTogetherStanding,
  };
}
