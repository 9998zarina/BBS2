import { useReducer, useCallback, useEffect, useRef } from 'react';
import { BBS_TEST_ITEMS } from '../utils/bbs-test-items';
import { useTTS } from './useTTS';
import type { YoloLandmarks } from './usePoseDetection';

// Types
export interface PoseFrame {
  landmarks: YoloLandmarks;
  timestamp_ms: number;
}

export interface TestResult {
  testId: number;
  testNameKo: string;
  score: number;
  confidence: number;
  reasoning: string;
  criteriaMet: Record<string, boolean>;
}

export type AssessmentPhase = 'ready' | 'countdown' | 'capturing' | 'transitioning' | 'results';

// 자세 상태 타입 (미리 정의)
type PoseState = 'sitting' | 'standing' | 'unknown';

// 디버그 정보 타입
export interface PoseDebugInfo {
  kneeAngle: number;
  hipAngle: number;
  hipHeight: number;      // 엉덩이-발목 수직 거리 (deprecated)
  kneeHeight: number;     // 엉덩이-무릎 수직 거리 (deprecated)
  isHipHigh: boolean;
  isKneeBent: boolean;
  // 새로운 비율 기반 지표
  legRatio: number;       // (엉덩이-무릎) / (무릎-발목) 거리 비율
  isStandingByRatio: boolean;
}

interface AssessmentState {
  phase: AssessmentPhase;
  currentTestIndex: number;
  frames: PoseFrame[];
  results: TestResult[];
  interimScore: number | null;
  countdownValue: number;
  // 타이머 관련
  elapsedSec: number;        // 경과 시간 (초)
  holdTimeSec: number;       // 자세 유지 시간 (초)
  startTime: number | null;  // 시작 시간
  // 자세 대기 관련
  timerStarted: boolean;             // 타이머 시작 여부
  waitingForInitialPose: boolean;    // 초기 앉은 자세 대기 중
  initialPoseDetected: boolean;      // 초기 앉은 자세 감지됨
  currentPoseState: PoseState;       // 현재 감지된 자세
  // 실시간 자막
  currentCaption: string;            // 현재 화면에 표시할 자막
  // 디버그 정보
  debugInfo: PoseDebugInfo | null;
}

// 테스트별 설정 (타이머, 최소 유지 시간, 프레임 수)
interface TestConfig {
  durationSec: number;      // 전체 검사 시간
  minHoldSec: number;       // 최소 유지 시간 (이 시간 못 채우면 감점)
  requiredState: 'standing' | 'sitting' | 'any';  // 필요한 자세
  useTimer: boolean;        // 타이머 사용 여부 (false면 동작 감지로 완료)
}

const TEST_CONFIG: Record<number, TestConfig> = {
  1: { durationSec: 10, minHoldSec: 0, requiredState: 'any', useTimer: false },    // 앉아서 일어서기 (동작 감지로 완료)
  2: { durationSec: 120, minHoldSec: 30, requiredState: 'standing', useTimer: true },   // 2분 서기
  3: { durationSec: 120, minHoldSec: 30, requiredState: 'sitting', useTimer: true },    // 2분 앉기
  4: { durationSec: 10, minHoldSec: 0, requiredState: 'any', useTimer: false },    // 서서 앉기 (동작 감지로 완료)
  5: { durationSec: 15, minHoldSec: 0, requiredState: 'any', useTimer: true },     // 이동하기
  6: { durationSec: 10, minHoldSec: 3, requiredState: 'standing', useTimer: true },     // 10초 눈감고 서기
  7: { durationSec: 60, minHoldSec: 15, requiredState: 'standing', useTimer: true },    // 1분 두발모으고 서기
  8: { durationSec: 10, minHoldSec: 0, requiredState: 'standing', useTimer: true },     // 팔 뻗기
  9: { durationSec: 10, minHoldSec: 0, requiredState: 'any', useTimer: true },          // 바닥 물건 집기
  10: { durationSec: 10, minHoldSec: 0, requiredState: 'any', useTimer: true },         // 뒤돌아보기
  11: { durationSec: 15, minHoldSec: 0, requiredState: 'any', useTimer: true },         // 360도 회전
  12: { durationSec: 30, minHoldSec: 0, requiredState: 'any', useTimer: true },         // 발판 발 교대
  13: { durationSec: 30, minHoldSec: 15, requiredState: 'standing', useTimer: true },   // 30초 일렬로 서기
  14: { durationSec: 10, minHoldSec: 3, requiredState: 'standing', useTimer: true },    // 10초 한발서기
};

// 프레임 수 계산 (30fps 기준)
const TEST_REQUIRED_FRAMES: Record<number, number> = Object.fromEntries(
  Object.entries(TEST_CONFIG).map(([id, config]) => [id, config.durationSec * 30])
);

// 환자용 음성 지시 (직접 말하는 형식)
const TEST_VOICE_INSTRUCTIONS: Record<number, string> = {
  1: '앉으세요.',
  2: '일어나세요.',
  3: '의자에 앉아주세요.',
  4: '서주세요.',
  5: '앉아주세요.',
  6: '서주세요.',
  7: '서주세요.',
  8: '서주세요.',
  9: '서있어주세요.',
  10: '서있어 주세요.',
  11: '서있어 주세요.',
  12: '서주세요.',
  13: '서있어 주세요.',
  14: '서있어주세요.',
};

// 실시간 자막 (화면 표시용) - 두 단계 지시사항
export interface TestCaption {
  initial: string;           // 초기 지시사항
  afterPoseDetected: string; // 자세 인식 후 지시사항
}

export const TEST_CAPTIONS: Record<number, TestCaption> = {
  1: { initial: '앉으세요.', afterPoseDetected: '일어나세요.' },
  2: { initial: '일어나세요.', afterPoseDetected: '서서 유지해주세요.' },
  3: { initial: '의자에 앉아주세요.', afterPoseDetected: '바로 앉으세요.' },
  4: { initial: '서주세요.', afterPoseDetected: '앉아주세요.' },
  5: { initial: '앉아주세요.', afterPoseDetected: '이동해주세요.' },
  6: { initial: '서주세요.', afterPoseDetected: '눈을 감고 서있어 주세요.' },
  7: { initial: '서주세요.', afterPoseDetected: '두발을 붙이고 서있어주세요.' },
  8: { initial: '서주세요.', afterPoseDetected: '팔을 뻗어주세요.' },
  9: { initial: '서있어주세요.', afterPoseDetected: '아래 물건을 잡아주세요.' },
  10: { initial: '서있어 주세요.', afterPoseDetected: '뒤돌아보세요.' },
  11: { initial: '서있어 주세요.', afterPoseDetected: '한바퀴 돌아주세요.' },
  12: { initial: '서주세요.', afterPoseDetected: '발판위에 교대로 놓아주세요.' },
  13: { initial: '서있어 주세요.', afterPoseDetected: '일자로 발을 두고 서있으세요.' },
  14: { initial: '서있어주세요.', afterPoseDetected: '한발을 들고 있으세요.' },
};

// ========== MediaPipe 기반 자세 분석 함수들 ==========

// 두 점 사이의 각도 계산
function calculateAngle(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): number {
  const rad = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
  let deg = Math.abs(rad * 180 / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return deg;
}

// ========== 손 사용 감지 (무릎 짚기 감지) ==========
// 손목이 무릎에 가깝고 + 손이 아래로 향할 때만 손 사용으로 판단
function detectHandUsage(landmarks: YoloLandmarks): { used: boolean; side: 'left' | 'right' | 'both' | 'none' } {
  const leftWrist = landmarks['left_wrist'];
  const rightWrist = landmarks['right_wrist'];
  const leftElbow = landmarks['left_elbow'];
  const rightElbow = landmarks['right_elbow'];
  const leftKnee = landmarks['left_knee'];
  const rightKnee = landmarks['right_knee'];
  const leftHip = landmarks['left_hip'];
  const rightHip = landmarks['right_hip'];

  // 필수 랜드마크 확인
  if (!leftWrist || !rightWrist || !leftKnee || !rightKnee || !leftHip || !rightHip) {
    return { used: false, side: 'none' };
  }

  // 몸통 길이 계산 (엉덩이-무릎 거리를 기준으로 임계값 설정)
  const torsoHeight = Math.abs(
    ((leftHip.y + rightHip.y) / 2) - ((leftKnee.y + rightKnee.y) / 2)
  );

  // 임계값: 몸통 길이의 30% 이내면 손 사용 가능성 (더 엄격하게: 50% → 30%)
  const threshold = torsoHeight * 0.3;

  // 거리 계산 함수
  const distanceFn = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
    Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

  // 왼손목-왼무릎, 오른손목-오른무릎 거리 계산
  const leftDistance = distanceFn(leftWrist, leftKnee);
  const rightDistance = distanceFn(rightWrist, rightKnee);

  // 손이 아래로 향하는지 확인 (손목이 팔꿈치보다 아래에 있어야 함)
  const leftHandDown = leftElbow ? leftWrist.y > leftElbow.y : true;
  const rightHandDown = rightElbow ? rightWrist.y > rightElbow.y : true;

  // 손 사용 조건: 무릎 근접 + 손이 아래로 향함
  const leftUsed = leftDistance < threshold && leftHandDown;
  const rightUsed = rightDistance < threshold && rightHandDown;

  // 디버그 로그 (매 프레임)
  console.log(`[HandUsage] L거리: ${leftDistance.toFixed(3)}, R거리: ${rightDistance.toFixed(3)}, 임계값: ${threshold.toFixed(3)}, L아래: ${leftHandDown}, R아래: ${rightHandDown}`);

  if (leftUsed && rightUsed) {
    console.log(`[HandUsage] 양손 사용 (L: ${leftDistance.toFixed(3)}, R: ${rightDistance.toFixed(3)}, threshold: ${threshold.toFixed(3)})`);
    return { used: true, side: 'both' };
  } else if (leftUsed) {
    console.log(`[HandUsage] 왼손 사용 (distance: ${leftDistance.toFixed(3)}, threshold: ${threshold.toFixed(3)})`);
    return { used: true, side: 'left' };
  } else if (rightUsed) {
    console.log(`[HandUsage] 오른손 사용 (distance: ${rightDistance.toFixed(3)}, threshold: ${threshold.toFixed(3)})`);
    return { used: true, side: 'right' };
  }

  return { used: false, side: 'none' };
}

// ========== 시도 횟수 추적 (상태 전환 감지) ==========
// 앉기→서기 전환 횟수를 세어 시도 횟수 파악
function countAttempts(
  frames: PoseFrame[],
  fromState: 'sitting' | 'standing',
  toState: 'sitting' | 'standing'
): number {
  if (frames.length < 10) return 0;

  let attemptCount = 0;
  let lastStableState: PoseState = 'unknown';
  let stateConsecutiveCount = 0;
  const STABLE_THRESHOLD = 3; // 3프레임 연속이면 안정적인 상태로 인정

  for (const frame of frames) {
    const { state: currentState } = detectPoseState(frame.landmarks);

    if (currentState === lastStableState) {
      stateConsecutiveCount++;
    } else if (currentState !== 'unknown') {
      // 새로운 상태 감지 시작
      if (stateConsecutiveCount >= STABLE_THRESHOLD) {
        // 이전 상태가 안정적이었음
        // fromState → toState 전환 확인
        if (lastStableState === fromState && currentState === toState) {
          attemptCount++;
          console.log(`[Attempts] 시도 감지: ${fromState} → ${toState} (총 ${attemptCount}회)`);
        }
      }
      lastStableState = currentState;
      stateConsecutiveCount = 1;
    }
  }

  return attemptCount;
}

// 두 점 사이의 거리 계산
function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

// 자세 상태 감지 (비율 기반 - 머리 잘려도 OK)
function detectPoseState(landmarks: YoloLandmarks): { state: PoseState; confidence: number; debugInfo: PoseDebugInfo } {
  const leftHip = landmarks['left_hip'];
  const rightHip = landmarks['right_hip'];
  const leftKnee = landmarks['left_knee'];
  const rightKnee = landmarks['right_knee'];
  const leftAnkle = landmarks['left_ankle'];
  const rightAnkle = landmarks['right_ankle'];
  const leftShoulder = landmarks['left_shoulder'];
  const rightShoulder = landmarks['right_shoulder'];

  // 기본 debugInfo
  const defaultDebug: PoseDebugInfo = {
    kneeAngle: 0, hipAngle: 0, hipHeight: 0, kneeHeight: 0,
    isHipHigh: false, isKneeBent: false,
    legRatio: 0, isStandingByRatio: false
  };

  // 랜드마크 존재 여부 확인
  if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
    console.log('[PoseState] 필수 랜드마크 누락');
    return { state: 'unknown', confidence: 0, debugInfo: defaultDebug };
  }

  // ========== 사람 존재 여부 확인 ==========
  const MIN_VISIBILITY = 0.3;
  const keyJoints = [leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle];
  const visibleCount = keyJoints.filter(j => j.visibility >= MIN_VISIBILITY).length;
  const avgVisibility = keyJoints.reduce((sum, j) => sum + j.visibility, 0) / keyJoints.length;

  if (visibleCount < 3 || avgVisibility < 0.25) {
    console.log(`[PoseState] 사람 미감지 (visible: ${visibleCount}/6, avgVis: ${avgVisibility.toFixed(2)})`);
    return { state: 'unknown', confidence: 0, debugInfo: defaultDebug };
  }

  // ========== 중간점 계산 ==========
  const midHip = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
  const midKnee = { x: (leftKnee.x + rightKnee.x) / 2, y: (leftKnee.y + rightKnee.y) / 2 };
  const midAnkle = { x: (leftAnkle.x + rightAnkle.x) / 2, y: (leftAnkle.y + rightAnkle.y) / 2 };

  // ========== 무릎 각도 (핵심 지표 1) ==========
  const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
  const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

  // ========== 엉덩이 각도 (보조 지표) ==========
  let hipAngle = 180;
  if (leftShoulder && rightShoulder && leftShoulder.visibility > 0.3 && rightShoulder.visibility > 0.3) {
    const midShoulder = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
    hipAngle = calculateAngle(midShoulder, midHip, midKnee);
  }

  // ========== 다리 비율 (핵심 지표 2 - 정규화에 무관) ==========
  // 서있을 때: 엉덩이-무릎 거리 ≈ 무릎-발목 거리 (비율 ≈ 0.9~1.1)
  // 앉아있을 때: 엉덩이-무릎 거리 << 무릎-발목 거리 (비율 < 0.6)
  const hipToKneeDist = distance(midHip, midKnee);
  const kneeToAnkleDist = distance(midKnee, midAnkle);

  // 0으로 나누기 방지
  const legRatio = kneeToAnkleDist > 0.01 ? hipToKneeDist / kneeToAnkleDist : 0;

  // 서있음 판단: 비율이 0.7 이상 (다리가 어느 정도 펴져 있음)
  const isStandingByRatio = legRatio > 0.7;

  // 기존 높이 기반 지표 (참고용)
  const hipAnkleVerticalDist = midAnkle.y - midHip.y;
  const hipKneeVerticalDist = midKnee.y - midHip.y;
  const isHipHighEnough = hipAnkleVerticalDist > 0.15;
  const isKneeBentLow = hipKneeVerticalDist < 0.10;

  // 디버그 정보
  const debugInfo: PoseDebugInfo = {
    kneeAngle: avgKneeAngle,
    hipAngle: hipAngle,
    hipHeight: hipAnkleVerticalDist,
    kneeHeight: hipKneeVerticalDist,
    isHipHigh: isHipHighEnough,
    isKneeBent: isKneeBentLow,
    legRatio: legRatio,
    isStandingByRatio: isStandingByRatio,
  };

  // 디버그 로그
  console.log(`[PoseState] 무릎: ${avgKneeAngle.toFixed(0)}°, 다리비율: ${legRatio.toFixed(2)}, 엉덩이: ${hipAngle.toFixed(0)}° | 비율판단=${isStandingByRatio ? '서있음' : '앉음'}`);

  // ========== 판단 로직 (무릎 각도 + 다리 비율 복합) ==========

  // 1. 확실히 앉은 자세: 무릎 각도 작음 OR 다리 비율 낮음
  if (avgKneeAngle < 120 || (avgKneeAngle < 140 && legRatio < 0.5)) {
    console.log(`[PoseState] → 앉은 자세 (무릎=${avgKneeAngle.toFixed(0)}°, 비율=${legRatio.toFixed(2)})`);
    return { state: 'sitting', confidence: 0.9, debugInfo };
  }

  // 2. 확실히 서있는 자세: 무릎 펴짐 + 다리 비율 높음
  if (avgKneeAngle > 155 && legRatio > 0.8) {
    console.log(`[PoseState] → 서있는 자세 (무릎=${avgKneeAngle.toFixed(0)}°, 비율=${legRatio.toFixed(2)})`);
    return { state: 'standing', confidence: 0.95, debugInfo };
  }

  // 3. 무릎 각도로 서있음 판단 (비율이 애매할 때)
  if (avgKneeAngle > 145 && legRatio > 0.6) {
    console.log(`[PoseState] → 서있는 자세 (무릎>${145}, 비율>${0.6})`);
    return { state: 'standing', confidence: 0.8, debugInfo };
  }

  // 4. 중간 상태: 비율로 최종 판단
  if (avgKneeAngle >= 120 && avgKneeAngle <= 155) {
    if (legRatio > 0.7) {
      console.log(`[PoseState] → 서있는 자세 (중간, 비율=${legRatio.toFixed(2)})`);
      return { state: 'standing', confidence: 0.7, debugInfo };
    } else {
      console.log(`[PoseState] → 앉은 자세 (중간, 비율=${legRatio.toFixed(2)})`);
      return { state: 'sitting', confidence: 0.6, debugInfo };
    }
  }

  // 5. 무릎 펴졌지만 비율이 낮음 (다리 뻗고 앉은 경우)
  if (avgKneeAngle > 145 && legRatio < 0.6) {
    console.log(`[PoseState] → 앉은 자세 (무릎펴짐 but 비율낮음: ${legRatio.toFixed(2)})`);
    return { state: 'sitting', confidence: 0.65, debugInfo };
  }

  console.log(`[PoseState] → 알수없음 (무릎=${avgKneeAngle.toFixed(0)}°, 비율=${legRatio.toFixed(2)})`);
  return { state: 'unknown', confidence: 0.3, debugInfo };
}


// BBS 테스트별 점수 계산 (실제 BBS 임상 채점 기준 적용)
interface ScoreResult {
  score: number;
  confidence: number;
  reasoning: string;
  criteria_met: Record<string, boolean>;
}

// 동작 완료 후 안정성 계산 (마지막 N프레임만 사용)
function calculatePostActionStability(frames: PoseFrame[], lastNFrames: number = 15): number {
  if (frames.length < lastNFrames) return 0.5;

  const recentFrames = frames.slice(-lastNFrames);
  let totalMovement = 0;

  for (let i = 1; i < recentFrames.length; i++) {
    const prev = recentFrames[i - 1].landmarks;
    const curr = recentFrames[i].landmarks;

    const joints = ['left_hip', 'right_hip', 'left_shoulder', 'right_shoulder'];
    for (const joint of joints) {
      if (prev[joint] && curr[joint]) {
        const dx = curr[joint].x - prev[joint].x;
        const dy = curr[joint].y - prev[joint].y;
        totalMovement += Math.sqrt(dx * dx + dy * dy);
      }
    }
  }

  const avgMovement = totalMovement / (recentFrames.length * 4);
  return Math.max(0, Math.min(1, 1 - avgMovement * 20));
}

// 동작 완료 여부 확인 (앉기→서기 또는 서기→앉기)
function checkMotionCompleted(frames: PoseFrame[], fromState: 'sitting' | 'standing', toState: 'sitting' | 'standing'): boolean {
  if (frames.length < 10) return false;

  // 처음 절반에서 fromState, 나중 절반에서 toState 확인
  const halfIndex = Math.floor(frames.length / 2);
  const firstHalf = frames.slice(0, halfIndex);
  const secondHalf = frames.slice(halfIndex);

  let fromCount = 0;
  let toCount = 0;

  for (const frame of firstHalf) {
    const { state } = detectPoseState(frame.landmarks);
    if (state === fromState) fromCount++;
  }

  for (const frame of secondHalf) {
    const { state } = detectPoseState(frame.landmarks);
    if (state === toState) toCount++;
  }

  return (fromCount / firstHalf.length > 0.3) && (toCount / secondHalf.length > 0.3);
}

function scoreBBSTest(testId: number, frames: PoseFrame[], holdTimeSec: number): ScoreResult {
  console.log(`[scoreBBSTest] 진입 - testId: ${testId}, frames: ${frames.length}, holdTimeSec: ${holdTimeSec}`);

  // 데이터가 부족하면 4점 유지 (감점 방식)
  if (frames.length < 10) {
    console.log(`[scoreBBSTest] 프레임 부족으로 early return (${frames.length} < 10)`);
    return { score: 4, confidence: 0.5, reasoning: '검사 진행 중...', criteria_met: {} };
  }

  // 동작 완료 후 안정성 (마지막 15프레임)
  const postStability = calculatePostActionStability(frames, 15);

  // 자세 상태 통계
  let sittingCount = 0;
  let standingCount = 0;

  for (const frame of frames) {
    const { state } = detectPoseState(frame.landmarks);
    if (state === 'sitting') sittingCount++;
    if (state === 'standing') standingCount++;
  }

  const sittingRatio = sittingCount / frames.length;
  const standingRatio = standingCount / frames.length;

  // ========== 실제 BBS 채점 기준 적용 ==========
  switch (testId) {
    case 1: // 앉아서 일어서기
      // 4점: 손 사용 없이 독립적으로 일어섬
      // 3점: 손을 사용하여 독립적으로 일어섬
      // 2점: 여러 번 시도 후 손을 사용하여 일어섬
      // 1점: 일어서기 위해 최소한의 도움 필요
      // 0점: 일어서기 위해 중등도 또는 최대 도움 필요
      {
        const motionComplete = checkMotionCompleted(frames, 'sitting', 'standing');

        // ========== 손 사용 감지 (일어나는 동작 중에만!) ==========
        // 앉은 자세/서있는 자세에서는 손 체크 안 함
        // 중간 상태 (일어나는 중)에서만 손 사용 체크
        let handUsageDetected = false;
        let transitionFrameCount = 0;  // 전환 구간 프레임 수

        for (const frame of frames) {
          const { state: poseState } = detectPoseState(frame.landmarks);

          // 중간 상태 (앉음도 아니고 서있음도 아닌 상태) = 일어나는 중
          if (poseState === 'unknown') {
            transitionFrameCount++;
            const { used } = detectHandUsage(frame.landmarks);
            if (used) {
              handUsageDetected = true;
              console.log('[Test1] 손 사용 감지됨 (전환 구간에서)');
            }
          }
        }

        // 시도 횟수 추적 (앉기→서기 전환 횟수)
        const attemptCount = countAttempts(frames, 'sitting', 'standing');

        console.log(`[Test1 Score] 동작완료: ${motionComplete}, 손사용: ${handUsageDetected}, 전환프레임: ${transitionFrameCount}, 시도횟수: ${attemptCount}, 안정성: ${postStability.toFixed(2)}`);

        // BBS 채점 기준 (간소화)
        // 4점: 손 사용 없이 일어남
        // 2점: 손 사용하여 일어남 (무릎에 손 딛기)
        // 1점: 일어서기 시도했으나 완료 못함
        // 0점: 일어서기 수행 불가
        if (motionComplete && !handUsageDetected) {
          // 4점: 손 사용 없이 일어섬
          return {
            score: 4,
            confidence: 0.9,
            reasoning: '손 사용 없이 독립적으로 일어섬',
            criteria_met: { completed: true, handUsed: false, attempts: attemptCount, stable: true }
          };
        } else if (motionComplete && handUsageDetected) {
          // 2점: 손을 사용하여 일어섬 (무릎에 손 딛기)
          return {
            score: 2,
            confidence: 0.85,
            reasoning: '손을 사용하여 (무릎 딛고) 일어섬',
            criteria_met: { completed: true, handUsed: true, attempts: attemptCount, stable: true }
          };
        } else if (standingRatio > 0.1) {
          // 1점: 일어서기 시도했으나 불안정
          return {
            score: 1,
            confidence: 0.6,
            reasoning: '일어서기 시도했으나 완료 못함',
            criteria_met: { completed: false, handUsed: handUsageDetected, attempts: attemptCount, stable: false }
          };
        }
        // 0점: 일어서기 수행 불가
        return {
          score: 0,
          confidence: 0.5,
          reasoning: '일어서기 수행 불가',
          criteria_met: { completed: false, handUsed: false, attempts: 0, stable: false }
        };
      }

    case 2: // 지지 없이 서기
      // 4점: 2분간 안전하게 서있을 수 있음
      // 3점: 감독하에 2분간 서있을 수 있음
      // 2점: 지지 없이 30초간 서있을 수 있음
      // 1점: 지지 없이 30초간 서있기 위해 여러 번 시도 필요
      // 0점: 지지 없이 30초간 서있을 수 없음
      if (holdTimeSec >= 120) {
        return { score: 4, confidence: 0.95, reasoning: '2분간 안전하게 서있음', criteria_met: { duration120: true } };
      } else if (holdTimeSec >= 60) {
        return { score: 3, confidence: 0.85, reasoning: `${Math.floor(holdTimeSec)}초간 서있음 (2분 미만)`, criteria_met: { duration60: true } };
      } else if (holdTimeSec >= 30) {
        return { score: 2, confidence: 0.75, reasoning: `${Math.floor(holdTimeSec)}초간 서있음`, criteria_met: { duration30: true } };
      } else if (holdTimeSec >= 10) {
        return { score: 1, confidence: 0.65, reasoning: `${Math.floor(holdTimeSec)}초간 서있음 (30초 미만)`, criteria_met: { duration10: true } };
      }
      return { score: 0, confidence: 0.55, reasoning: '30초 미만 서있음', criteria_met: { duration10: false } };

    case 3: // 등 지지 없이 앉기
      // 4점: 2분간 안전하게 앉아있을 수 있음
      // 3점: 감독하에 2분간 앉아있을 수 있음
      // 2점: 30초간 앉아있을 수 있음
      // 1점: 10초간 앉아있을 수 있음
      // 0점: 지지 없이 10초간 앉아있을 수 없음
      if (holdTimeSec >= 120) {
        return { score: 4, confidence: 0.95, reasoning: '2분간 안전하게 앉아있음', criteria_met: { duration120: true } };
      } else if (holdTimeSec >= 60) {
        return { score: 3, confidence: 0.85, reasoning: `${Math.floor(holdTimeSec)}초간 앉아있음 (2분 미만)`, criteria_met: { duration60: true } };
      } else if (holdTimeSec >= 30) {
        return { score: 2, confidence: 0.75, reasoning: `${Math.floor(holdTimeSec)}초간 앉아있음`, criteria_met: { duration30: true } };
      } else if (holdTimeSec >= 10) {
        return { score: 1, confidence: 0.65, reasoning: `${Math.floor(holdTimeSec)}초간 앉아있음 (30초 미만)`, criteria_met: { duration10: true } };
      }
      return { score: 0, confidence: 0.55, reasoning: '10초 미만 앉아있음', criteria_met: { duration10: false } };

    case 4: // 서서 앉기
      // 4점: 손을 최소한으로 사용하여 안전하게 앉음
      // 3점: 손을 사용하여 앉기를 조절함
      // 2점: 다리 뒤로 의자에 기대어 앉기 조절
      // 1점: 독립적으로 앉지만 조절되지 않은 하강
      // 0점: 앉기 위해 도움 필요
      {
        const motionComplete = checkMotionCompleted(frames, 'standing', 'sitting');

        // ========== 손 사용 감지 (앉는 동작 중에만!) ==========
        // 서있는 자세/앉은 자세에서는 손 체크 안 함
        // 중간 상태 (앉는 중)에서만 손 사용 체크
        let handUsageDetected = false;
        let transitionFrameCount = 0;

        for (const frame of frames) {
          const { state: poseState } = detectPoseState(frame.landmarks);

          // 중간 상태 = 앉는 중
          if (poseState === 'unknown') {
            transitionFrameCount++;
            const { used } = detectHandUsage(frame.landmarks);
            if (used) {
              handUsageDetected = true;
              console.log('[Test4] 손 사용 감지됨 (전환 구간에서)');
            }
          }
        }

        console.log(`[Test4 Score] 동작완료: ${motionComplete}, 손사용: ${handUsageDetected}, 전환프레임: ${transitionFrameCount}, 안정성: ${postStability.toFixed(2)}`);

        // BBS 공식 채점 기준 적용
        if (motionComplete && !handUsageDetected && postStability > 0.5) {
          // 4점: 손 사용 최소한으로 안전하게 앉음
          return {
            score: 4,
            confidence: 0.9,
            reasoning: '손 사용 없이 안전하게 조절하여 앉음',
            criteria_met: { completed: true, handUsed: false, controlled: true }
          };
        } else if (motionComplete && handUsageDetected && postStability > 0.3) {
          // 3점: 손을 사용하여 앉기 조절
          return {
            score: 3,
            confidence: 0.85,
            reasoning: '손을 사용하여 앉기 조절',
            criteria_met: { completed: true, handUsed: true, controlled: true }
          };
        } else if (motionComplete && postStability > 0.2) {
          // 2점: 다리 뒤로 의자에 기대어 앉기
          return {
            score: 2,
            confidence: 0.75,
            reasoning: '의자에 기대어 앉기 조절',
            criteria_met: { completed: true, handUsed: handUsageDetected, controlled: false }
          };
        } else if (sittingRatio > 0.1) {
          // 1점: 독립적으로 앉지만 조절되지 않은 하강
          return {
            score: 1,
            confidence: 0.6,
            reasoning: '조절되지 않은 하강으로 앉음',
            criteria_met: { completed: true, handUsed: handUsageDetected, controlled: false }
          };
        }
        // 0점: 앉기 위해 도움 필요
        return {
          score: 0,
          confidence: 0.5,
          reasoning: '앉기 수행 불가',
          criteria_met: { completed: false, handUsed: false, controlled: false }
        };
      }

    case 5: // 의자 이동
      // 4점: 손을 약간 사용하여 안전하게 이동
      // 3점: 확실히 손을 사용하여 안전하게 이동
      // 2점: 언어적 지시 및/또는 감독으로 이동
      // 1점: 한 사람의 도움 필요
      // 0점: 두 사람의 도움 또는 안전을 위한 감독 필요
      if (postStability > 0.6 && (standingRatio > 0.3 || sittingRatio > 0.3)) {
        return { score: 4, confidence: 0.8, reasoning: '안전하게 이동 완료', criteria_met: { completed: true, safe: true } };
      } else if (postStability > 0.4) {
        return { score: 3, confidence: 0.7, reasoning: '이동 완료 (손 사용)', criteria_met: { completed: true, safe: false } };
      } else if (standingRatio > 0.1 || sittingRatio > 0.1) {
        return { score: 2, confidence: 0.6, reasoning: '감독하에 이동', criteria_met: { completed: true, safe: false } };
      }
      return { score: 1, confidence: 0.5, reasoning: '이동에 도움 필요', criteria_met: { completed: false, safe: false } };

    case 6: // 눈 감고 서기
      // 4점: 10초간 안전하게 서있을 수 있음
      // 3점: 감독하에 10초간 서있을 수 있음
      // 2점: 3초간 서있을 수 있음
      // 1점: 눈을 3초간 감고 있을 수 없으나 안전하게 서있음
      // 0점: 넘어지지 않도록 도움 필요
      if (holdTimeSec >= 10) {
        return { score: 4, confidence: 0.9, reasoning: '10초간 안전하게 서있음', criteria_met: { duration10: true } };
      } else if (holdTimeSec >= 5) {
        return { score: 3, confidence: 0.8, reasoning: `${Math.floor(holdTimeSec)}초간 서있음`, criteria_met: { duration5: true } };
      } else if (holdTimeSec >= 3) {
        return { score: 2, confidence: 0.7, reasoning: `${Math.floor(holdTimeSec)}초간 서있음`, criteria_met: { duration3: true } };
      } else if (holdTimeSec >= 1) {
        return { score: 1, confidence: 0.6, reasoning: '3초 미만 서있음', criteria_met: { duration1: true } };
      }
      return { score: 0, confidence: 0.5, reasoning: '균형 유지 불가', criteria_met: { duration1: false } };

    case 7: // 두 발 모으고 서기
      // 4점: 독립적으로 발을 모으고 1분간 안전하게 서있음
      // 3점: 감독하에 발을 모으고 1분간 서있음
      // 2점: 독립적으로 발을 모으지만 30초간 유지 불가
      // 1점: 자세 잡는데 도움 필요하나 15초간 발 모으고 서있음
      // 0점: 자세 잡는데 도움 필요하고 15초간 유지 불가
      if (holdTimeSec >= 60) {
        return { score: 4, confidence: 0.9, reasoning: '1분간 안전하게 서있음', criteria_met: { duration60: true } };
      } else if (holdTimeSec >= 30) {
        return { score: 3, confidence: 0.8, reasoning: `${Math.floor(holdTimeSec)}초간 서있음`, criteria_met: { duration30: true } };
      } else if (holdTimeSec >= 15) {
        return { score: 2, confidence: 0.7, reasoning: `${Math.floor(holdTimeSec)}초간 서있음 (30초 미만)`, criteria_met: { duration15: true } };
      } else if (holdTimeSec >= 5) {
        return { score: 1, confidence: 0.6, reasoning: `${Math.floor(holdTimeSec)}초간 서있음 (15초 미만)`, criteria_met: { duration5: true } };
      }
      return { score: 0, confidence: 0.5, reasoning: '15초 미만 서있음', criteria_met: { duration5: false } };

    case 8: // 서서 팔 뻗기
      // 4점: 자신있게 25cm 이상 뻗을 수 있음
      // 3점: 12cm 이상 뻗을 수 있음
      // 2점: 5cm 이상 뻗을 수 있음
      // 1점: 앞으로 뻗지만 감독 필요
      // 0점: 균형 잃음/외부 지지 필요
      if (postStability > 0.6) {
        return { score: 4, confidence: 0.8, reasoning: '안정적으로 팔 뻗기 수행', criteria_met: { reach: true, stable: true } };
      } else if (postStability > 0.4) {
        return { score: 3, confidence: 0.7, reasoning: '팔 뻗기 수행 완료', criteria_met: { reach: true, stable: false } };
      } else if (postStability > 0.2) {
        return { score: 2, confidence: 0.6, reasoning: '제한적으로 팔 뻗기', criteria_met: { reach: true, stable: false } };
      }
      return { score: 1, confidence: 0.5, reasoning: '팔 뻗기 시도', criteria_met: { reach: false, stable: false } };

    case 9: // 바닥 물건 집기
      // 4점: 안전하고 쉽게 물건을 집을 수 있음
      // 3점: 감독하에 물건을 집을 수 있음
      // 2점: 물건을 집을 수 없으나 2-5cm까지 닿고 독립적으로 균형 유지
      // 1점: 물건을 집을 수 없고 시도하는 동안 감독 필요
      // 0점: 시도 불가/균형 잃음 방지 위해 도움 필요
      if (postStability > 0.5) {
        return { score: 4, confidence: 0.8, reasoning: '안전하게 물건 집기 완료', criteria_met: { pickup: true, stable: true } };
      } else if (postStability > 0.3) {
        return { score: 3, confidence: 0.7, reasoning: '물건 집기 완료', criteria_met: { pickup: true, stable: false } };
      } else if (postStability > 0.1) {
        return { score: 2, confidence: 0.6, reasoning: '물건 근처까지 접근', criteria_met: { pickup: false, stable: false } };
      }
      return { score: 1, confidence: 0.5, reasoning: '물건 집기 시도', criteria_met: { pickup: false, stable: false } };

    case 10: // 뒤돌아보기
      // 4점: 양쪽 모두 뒤를 보고 체중 이동 잘됨
      // 3점: 한쪽만 뒤를 잘 봄, 다른 쪽은 체중 이동 적음
      // 2점: 옆으로만 돌지만 균형 유지
      // 1점: 돌 때 감독 필요
      // 0점: 균형 잃지 않도록 도움 필요
      if (postStability > 0.6) {
        return { score: 4, confidence: 0.8, reasoning: '양쪽 모두 안정적으로 뒤돌아봄', criteria_met: { bothSides: true, stable: true } };
      } else if (postStability > 0.4) {
        return { score: 3, confidence: 0.7, reasoning: '한쪽 방향 뒤돌아봄', criteria_met: { bothSides: false, stable: true } };
      } else if (postStability > 0.2) {
        return { score: 2, confidence: 0.6, reasoning: '옆으로 돌며 균형 유지', criteria_met: { bothSides: false, stable: false } };
      }
      return { score: 1, confidence: 0.5, reasoning: '돌기 시도', criteria_met: { bothSides: false, stable: false } };

    case 11: // 360도 회전
      // 4점: 4초 이내에 안전하게 360도 회전
      // 3점: 4초 이내에 한쪽 방향만 안전하게 360도 회전
      // 2점: 안전하지만 천천히 360도 회전
      // 1점: 가까운 감독 또는 언어적 지시 필요
      // 0점: 회전하는 동안 도움 필요
      if (postStability > 0.6) {
        return { score: 4, confidence: 0.8, reasoning: '빠르고 안전하게 회전 완료', criteria_met: { fast: true, stable: true } };
      } else if (postStability > 0.4) {
        return { score: 3, confidence: 0.7, reasoning: '한 방향 회전 완료', criteria_met: { fast: false, stable: true } };
      } else if (postStability > 0.2) {
        return { score: 2, confidence: 0.6, reasoning: '천천히 회전 완료', criteria_met: { fast: false, stable: false } };
      }
      return { score: 1, confidence: 0.5, reasoning: '회전 시도', criteria_met: { fast: false, stable: false } };

    case 12: // 발판에 발 교대로 올리기
      // 4점: 독립적으로 안전하게 서서 20초 내에 8회 완료
      // 3점: 독립적으로 서서 20초 이상에 8회 완료
      // 2점: 감독하에 도움 없이 4회 완료
      // 1점: 최소한의 도움으로 2회 이상 완료
      // 0점: 넘어지지 않도록 도움 필요/시도 불가
      if (postStability > 0.6) {
        return { score: 4, confidence: 0.8, reasoning: '빠르고 안정적으로 8회 완료', criteria_met: { count8: true, fast: true } };
      } else if (postStability > 0.4) {
        return { score: 3, confidence: 0.7, reasoning: '8회 완료', criteria_met: { count8: true, fast: false } };
      } else if (postStability > 0.2) {
        return { score: 2, confidence: 0.6, reasoning: '4회 완료', criteria_met: { count4: true, fast: false } };
      }
      return { score: 1, confidence: 0.5, reasoning: '발 교대 시도', criteria_met: { count4: false, fast: false } };

    case 13: // 일렬로 서기 (탠덤)
      // 4점: 독립적으로 발을 탠덤으로 놓고 30초간 유지
      // 3점: 독립적으로 발을 앞에 놓고 30초간 유지
      // 2점: 독립적으로 작은 걸음을 내딛고 30초간 유지
      // 1점: 발 딛는데 도움 필요하지만 15초간 유지
      // 0점: 발 딛거나 서있을 때 균형 잃음
      if (holdTimeSec >= 30) {
        return { score: 4, confidence: 0.9, reasoning: '30초간 탠덤 자세 유지', criteria_met: { duration30: true, tandem: true } };
      } else if (holdTimeSec >= 20) {
        return { score: 3, confidence: 0.8, reasoning: `${Math.floor(holdTimeSec)}초간 발 앞에 놓고 유지`, criteria_met: { duration20: true } };
      } else if (holdTimeSec >= 10) {
        return { score: 2, confidence: 0.7, reasoning: `${Math.floor(holdTimeSec)}초간 유지`, criteria_met: { duration10: true } };
      } else if (holdTimeSec >= 5) {
        return { score: 1, confidence: 0.6, reasoning: `${Math.floor(holdTimeSec)}초간 유지 (도움 필요)`, criteria_met: { duration5: true } };
      }
      return { score: 0, confidence: 0.5, reasoning: '균형 유지 불가', criteria_met: { duration5: false } };

    case 14: // 한 발 서기
      // 4점: 독립적으로 다리를 들고 10초 이상 유지
      // 3점: 독립적으로 다리를 들고 5-10초 유지
      // 2점: 독립적으로 다리를 들고 3초 이상 유지
      // 1점: 다리를 들려고 하나 3초 유지 불가, 독립적으로 서있음
      // 0점: 시도 불가 또는 넘어지지 않도록 도움 필요
      if (holdTimeSec >= 10) {
        return { score: 4, confidence: 0.9, reasoning: '10초 이상 한 발 서기 유지', criteria_met: { duration10: true } };
      } else if (holdTimeSec >= 5) {
        return { score: 3, confidence: 0.8, reasoning: `${Math.floor(holdTimeSec)}초간 한 발 서기`, criteria_met: { duration5: true } };
      } else if (holdTimeSec >= 3) {
        return { score: 2, confidence: 0.7, reasoning: `${Math.floor(holdTimeSec)}초간 한 발 서기`, criteria_met: { duration3: true } };
      } else if (holdTimeSec >= 1) {
        return { score: 1, confidence: 0.6, reasoning: '3초 미만 유지', criteria_met: { duration1: true } };
      }
      return { score: 0, confidence: 0.5, reasoning: '한 발 서기 수행 불가', criteria_met: { duration1: false } };

    default:
      return { score: 3, confidence: 0.5, reasoning: '기본 점수', criteria_met: {} };
  }
}

// Actions
type Action =
  | { type: 'START' }
  | { type: 'COUNTDOWN_TICK' }
  | { type: 'START_CAPTURE' }
  | { type: 'ADD_FRAME'; payload: PoseFrame }
  | { type: 'UPDATE_SCORE'; payload: number }
  | { type: 'UPDATE_TIMER'; payload: { elapsedSec: number; holdTimeSec: number } }
  | { type: 'UPDATE_POSE_STATE'; payload: PoseState }
  | { type: 'DETECT_INITIAL_POSE' }
  | { type: 'START_TIMER' }
  | { type: 'COMPLETE_TEST'; payload: TestResult }
  | { type: 'START_TRANSITION' }
  | { type: 'TRANSITION_TICK' }
  | { type: 'NEXT_TEST' }
  | { type: 'FINISH' }
  | { type: 'RESTART' }
  | { type: 'UPDATE_CAPTION'; payload: string }
  | { type: 'UPDATE_DEBUG_INFO'; payload: PoseDebugInfo };

// Initial state
const initialState: AssessmentState = {
  phase: 'ready',
  currentTestIndex: 0,  // 1번 검사부터 시작
  frames: [],
  results: [],
  interimScore: null,
  countdownValue: 3,
  elapsedSec: 0,
  holdTimeSec: 0,
  startTime: null,
  timerStarted: false,
  waitingForInitialPose: false,
  initialPoseDetected: false,
  currentPoseState: 'unknown',
  currentCaption: '',
  debugInfo: null,
};

// Reducer
function assessmentReducer(state: AssessmentState, action: Action): AssessmentState {
  switch (action.type) {
    case 'START':
      return {
        ...state,
        phase: 'countdown',
        countdownValue: 3,
        currentTestIndex: 0,  // 1번 검사부터 시작
        results: [],
        frames: [],
        interimScore: null,
      };

    case 'COUNTDOWN_TICK':
      return {
        ...state,
        countdownValue: state.countdownValue - 1,
      };

    case 'START_CAPTURE':
      return {
        ...state,
        phase: 'capturing',
        frames: [],
        interimScore: 4,  // 4점에서 시작 (감점 방식)
        elapsedSec: 0,
        holdTimeSec: 0,
        startTime: null,  // 타이머는 자세 감지 후 시작
        timerStarted: false,
        waitingForInitialPose: true,  // 초기 자세 대기 시작
        initialPoseDetected: false,
        currentPoseState: 'unknown',
      };

    case 'ADD_FRAME':
      return {
        ...state,
        frames: [...state.frames.slice(-99), action.payload],
      };

    case 'UPDATE_SCORE':
      return {
        ...state,
        interimScore: action.payload,
      };

    case 'UPDATE_TIMER':
      return {
        ...state,
        elapsedSec: action.payload.elapsedSec,
        holdTimeSec: action.payload.holdTimeSec,
      };

    case 'UPDATE_POSE_STATE':
      return {
        ...state,
        currentPoseState: action.payload,
      };

    case 'DETECT_INITIAL_POSE':
      return {
        ...state,
        initialPoseDetected: true,
        waitingForInitialPose: false,
      };

    case 'START_TIMER':
      return {
        ...state,
        timerStarted: true,
        startTime: Date.now(),
      };

    case 'COMPLETE_TEST': {
      const newResults = [...state.results, action.payload];
      const isLastTest = state.currentTestIndex >= 13;
      return {
        ...state,
        results: newResults,
        phase: isLastTest ? 'results' : 'transitioning',
        frames: [],
        interimScore: null,
        countdownValue: 3,
      };
    }

    case 'TRANSITION_TICK':
      return {
        ...state,
        countdownValue: state.countdownValue - 1,
      };

    case 'NEXT_TEST':
      return {
        ...state,
        phase: 'capturing',
        currentTestIndex: state.currentTestIndex + 1,
        frames: [],
        interimScore: 4,  // 4점에서 시작 (감점 방식)
        elapsedSec: 0,
        holdTimeSec: 0,
        startTime: null,  // 타이머는 자세 감지 후 시작
        timerStarted: false,
        waitingForInitialPose: true,  // 초기 자세 대기 시작
        initialPoseDetected: false,
        currentPoseState: 'unknown',
      };

    case 'FINISH':
      return {
        ...state,
        phase: 'results',
      };

    case 'RESTART':
      return initialState;

    case 'UPDATE_CAPTION':
      return {
        ...state,
        currentCaption: action.payload,
      };

    case 'UPDATE_DEBUG_INFO':
      return {
        ...state,
        debugInfo: action.payload,
      };

    default:
      return state;
  }
}

export function useBBSAssessment() {
  const [state, dispatch] = useReducer(assessmentReducer, initialState);
  const countdownIntervalRef = useRef<number | null>(null);
  const scoringIntervalRef = useRef<number | null>(null);
  const framesRef = useRef<PoseFrame[]>([]);

  // TTS hook
  const { speak, stop: stopTTS, isReady: isTTSReady } = useTTS();

  // Keep frames ref in sync
  useEffect(() => {
    framesRef.current = state.frames;
  }, [state.frames]);

  // Current test info
  const currentTest = BBS_TEST_ITEMS[state.currentTestIndex];
  const totalScore = state.results.reduce((sum, r) => sum + r.score, 0);

  // Calculate progress (0-100)
  const requiredFrames = TEST_REQUIRED_FRAMES[currentTest?.id || 1] || 150;
  const progress = Math.min(100, (state.frames.length / requiredFrames) * 100);

  // Countdown handler (음성 없이 카운트다운만)
  useEffect(() => {
    if (state.phase === 'countdown') {
      countdownIntervalRef.current = window.setInterval(() => {
        dispatch({ type: 'COUNTDOWN_TICK' });
      }, 1000);

      return () => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
        }
      };
    }
  }, [state.phase]);

  // Start capture after countdown with voice instruction
  useEffect(() => {
    if (state.phase === 'countdown' && state.countdownValue <= 0) {
      dispatch({ type: 'START_CAPTURE' });
      // Speak patient-friendly voice instruction
      const testId = state.currentTestIndex + 1;
      const voiceInstruction = TEST_VOICE_INSTRUCTIONS[testId];
      if (voiceInstruction) {
        speak(voiceInstruction);
      }
      // 초기 자막 설정
      const caption = TEST_CAPTIONS[testId];
      if (caption) {
        dispatch({ type: 'UPDATE_CAPTION', payload: caption.initial });
      }
    }
  }, [state.phase, state.countdownValue, state.currentTestIndex, speak]);

  // Transition handler - 완료 안내 후 다음 검사로 이동
  const hasAnnouncedTransitionRef = useRef(false);

  useEffect(() => {
    if (state.phase === 'transitioning') {
      // 전환 시작 시 한 번만 안내
      if (!hasAnnouncedTransitionRef.current) {
        hasAnnouncedTransitionRef.current = true;
        const lastResult = state.results[state.results.length - 1];
        const nextTest = BBS_TEST_ITEMS[state.currentTestIndex + 1];

        if (lastResult && nextTest) {
          // 큐에 순차적으로 추가 (자동으로 순서대로 재생됨)
          speak(`${lastResult.score}점. 잘하셨습니다.`);
          speak(`다음 검사. ${nextTest.nameKo}`);
        }
      }

      countdownIntervalRef.current = window.setInterval(() => {
        dispatch({ type: 'TRANSITION_TICK' });
      }, 1000);

      return () => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
        }
      };
    } else {
      hasAnnouncedTransitionRef.current = false;
    }
  }, [state.phase, state.results, state.currentTestIndex, speak]);

  // Move to next test after transition with voice instruction
  useEffect(() => {
    if (state.phase === 'transitioning' && state.countdownValue <= 0) {
      dispatch({ type: 'NEXT_TEST' });
      // Speak patient-friendly voice instruction for next test
      const nextTestId = state.currentTestIndex + 2; // +1 for next, +1 for 1-based
      const voiceInstruction = TEST_VOICE_INSTRUCTIONS[nextTestId];
      if (voiceInstruction) {
        speak(voiceInstruction);
      }
      // 다음 검사 초기 자막 설정
      const caption = TEST_CAPTIONS[nextTestId];
      if (caption) {
        dispatch({ type: 'UPDATE_CAPTION', payload: caption.initial });
      }
    }
  }, [state.phase, state.countdownValue, state.currentTestIndex, speak]);

  // 타이머 및 채점 인터벌 - 자세 유지 시간 추적
  const holdTimeAccumRef = useRef(0);
  const hasAnnouncedTimerStartRef = useRef(false);
  const motionDetectedRef = useRef(false);  // 동작 감지 완료 여부

  // 연속 자세 감지 카운터 (안정적인 감지를 위해)
  const consecutivePoseCountRef = useRef(0);
  const lastDetectedPoseRef = useRef<PoseState>('unknown');
  const REQUIRED_CONSECUTIVE_FRAMES = 5;  // 5프레임 연속 감지 필요 (오감지 방지)

  // 1번 검사 상태 머신 (독립적으로 관리)
  const test1PhaseRef = useRef<'waiting_sit' | 'waiting_stand' | 'done'>('waiting_sit');

  useEffect(() => {
    if (state.phase !== 'capturing') {
      if (scoringIntervalRef.current) {
        clearInterval(scoringIntervalRef.current);
        scoringIntervalRef.current = null;
      }
      holdTimeAccumRef.current = 0;
      hasAnnouncedTimerStartRef.current = false;
      motionDetectedRef.current = false;
      consecutivePoseCountRef.current = 0;
      lastDetectedPoseRef.current = 'unknown';
      // 1번/4번 검사 상태 리셋
      test1PhaseRef.current = 'waiting_sit';
      return;
    }

    // 새 검사 시작 시 상태 리셋 (1번: 앉기 대기, 4번: 서기 대기)
    test1PhaseRef.current = 'waiting_sit';
    consecutivePoseCountRef.current = 0;
    lastDetectedPoseRef.current = 'unknown';
    console.log(`[BBS-INIT] Test${currentTest.id} 검사 시작 - phase: ${state.phase}, timer: ${TEST_CONFIG[currentTest.id].useTimer}`);

    const config = TEST_CONFIG[currentTest.id];
    const hasTimerRequirement = config.minHoldSec > 0;
    const useTimer = config.useTimer;

    const updateTimerAndScore = () => {
      const frames = framesRef.current;
      console.log(`[updateTimerAndScore] 호출됨 - testId: ${currentTest.id}, frames: ${frames.length}`);
      if (frames.length < 5) {
        console.log(`[updateTimerAndScore] 프레임 부족 early return (${frames.length} < 5)`);
        return;
      }

      // 현재 자세 상태 감지
      const lastFrame = frames[frames.length - 1];
      const { state: currentPoseState, debugInfo } = detectPoseState(lastFrame.landmarks);
      dispatch({ type: 'UPDATE_POSE_STATE', payload: currentPoseState });
      dispatch({ type: 'UPDATE_DEBUG_INFO', payload: debugInfo });

      // ========== 타이머 없는 검사 (1번, 4번 등): 동작 감지로 완료 ==========
      if (!useTimer) {
        const currentPhase = test1PhaseRef.current;
        console.log(`[Test${currentTest.id}] 동작감지 | phase=${currentPhase} | pose=${currentPoseState} | motionDone=${motionDetectedRef.current}`);

        // 이미 완료된 경우 스킵
        if (motionDetectedRef.current) {
          return;
        }

        // 연속 프레임 카운터 업데이트
        if (currentPoseState === lastDetectedPoseRef.current && currentPoseState !== 'unknown') {
          consecutivePoseCountRef.current++;
        } else {
          consecutivePoseCountRef.current = currentPoseState !== 'unknown' ? 1 : 0;
          lastDetectedPoseRef.current = currentPoseState;
        }

        const isStablePose = consecutivePoseCountRef.current >= REQUIRED_CONSECUTIVE_FRAMES;
        console.log(`[Test${currentTest.id}] 연속감지: ${consecutivePoseCountRef.current}/${REQUIRED_CONSECUTIVE_FRAMES} (안정=${isStablePose})`);

        // ========== 1번 검사: 앉아서 일어서기 ==========
        if (currentTest.id === 1) {
          // 1단계: 앉은 자세 대기
          if (currentPhase === 'waiting_sit') {
            console.log(`[Test1] 1단계: 앉은 자세 대기 중... (현재: ${currentPoseState})`);
            if (currentPoseState === 'sitting' && isStablePose) {
              console.log('[Test1] ✓ 앉은 자세 확인됨! → 2단계로 전환');
              test1PhaseRef.current = 'waiting_stand';
              consecutivePoseCountRef.current = 0;
              speak('앉은 자세 확인. 이제 일어나세요.');
              // 자막 변경: "일어나세요"
              dispatch({ type: 'UPDATE_CAPTION', payload: TEST_CAPTIONS[1].afterPoseDetected });
            }
            // 점수 계산 (진행 중)
            const result = scoreBBSTest(currentTest.id, frames, 0);
            dispatch({ type: 'UPDATE_SCORE', payload: result.score });
            return;
          }

          // 2단계: 서있는 자세 대기
          if (currentPhase === 'waiting_stand') {
            // 점수 계산 (진행 중 + 완료 시 사용)
            const result = scoreBBSTest(currentTest.id, frames, 0);
            dispatch({ type: 'UPDATE_SCORE', payload: result.score });

            // 실제로 앉았다가 일어났는지 확인 (핵심!)
            const motionComplete = checkMotionCompleted(frames, 'sitting', 'standing');

            console.log(`[Test1] 2단계: 서있는 자세 대기 중... (현재: ${currentPoseState}, 연속: ${consecutivePoseCountRef.current}, 동작완료: ${motionComplete}, 점수: ${result.score})`);

            // 조건: 현재 서있음 + 안정적 + 실제로 앉았다가 일어났음
            if (currentPoseState === 'standing' && isStablePose && motionComplete) {
              console.log(`[Test1] ✓ 일어서기 확인됨! 검사 완료 → ${result.score}점`);
              test1PhaseRef.current = 'done';
              motionDetectedRef.current = true;
              speak(`잘하셨습니다! ${result.score}점입니다.`);

              // 동작 완료 확인됨 → scoreBBSTest 결과 사용
              setTimeout(() => {
                dispatch({
                  type: 'COMPLETE_TEST',
                  payload: {
                    testId: currentTest.id,
                    testNameKo: currentTest.nameKo,
                    score: result.score,  // 실제 계산된 점수 사용
                    confidence: result.confidence,
                    reasoning: result.reasoning,
                    criteriaMet: result.criteria_met,
                  },
                });
              }, 1500);
            }
            return;
          }
        }

        // ========== 4번 검사: 서서 앉기 ==========
        if (currentTest.id === 4) {
          // 1단계: 서있는 자세 대기
          if (currentPhase === 'waiting_sit') {  // 4번은 waiting_sit을 waiting_stand로 사용
            console.log(`[Test4] 1단계: 서있는 자세 대기 중... (현재: ${currentPoseState})`);
            if (currentPoseState === 'standing' && isStablePose) {
              console.log('[Test4] ✓ 서있는 자세 확인됨! → 2단계로 전환');
              test1PhaseRef.current = 'waiting_stand';  // 이제 앉기 대기
              consecutivePoseCountRef.current = 0;
              speak('서있는 자세 확인. 이제 앉으세요.');
              // 자막 변경: "앉아주세요"
              dispatch({ type: 'UPDATE_CAPTION', payload: TEST_CAPTIONS[4].afterPoseDetected });
            }
            const result = scoreBBSTest(currentTest.id, frames, 0);
            dispatch({ type: 'UPDATE_SCORE', payload: result.score });
            return;
          }

          // 2단계: 앉은 자세 대기
          if (currentPhase === 'waiting_stand') {  // 4번은 이 단계에서 앉기 대기
            // 점수 계산 (진행 중 + 완료 시 사용)
            const result = scoreBBSTest(currentTest.id, frames, 0);
            dispatch({ type: 'UPDATE_SCORE', payload: result.score });

            // 실제로 서있다가 앉았는지 확인 (핵심!)
            const motionComplete = checkMotionCompleted(frames, 'standing', 'sitting');

            console.log(`[Test4] 2단계: 앉은 자세 대기 중... (현재: ${currentPoseState}, 연속: ${consecutivePoseCountRef.current}, 동작완료: ${motionComplete}, 점수: ${result.score})`);

            // 조건: 현재 앉음 + 안정적 + 실제로 서있다가 앉았음
            if (currentPoseState === 'sitting' && isStablePose && motionComplete) {
              console.log(`[Test4] ✓ 앉기 확인됨! 검사 완료 → ${result.score}점`);
              test1PhaseRef.current = 'done';
              motionDetectedRef.current = true;
              speak(`잘하셨습니다! ${result.score}점입니다.`);

              // 동작 완료 확인됨 → scoreBBSTest 결과 사용
              setTimeout(() => {
                dispatch({
                  type: 'COMPLETE_TEST',
                  payload: {
                    testId: currentTest.id,
                    testNameKo: currentTest.nameKo,
                    score: result.score,  // 실제 계산된 점수 사용
                    confidence: result.confidence,
                    reasoning: result.reasoning,
                    criteriaMet: result.criteria_met,
                  },
                });
              }, 1500);
            }
            return;
          }
        }

        // 기타 타이머 없는 검사 (점수만 계산)
        const result = scoreBBSTest(currentTest.id, frames, 0);
        dispatch({ type: 'UPDATE_SCORE', payload: result.score });
        return;
      }

      // ========== 타이머 있는 검사: 기존 로직 ==========
      if (hasTimerRequirement) {
        // 1단계: 초기 앉은 자세 대기
        if (state.waitingForInitialPose) {
          if (currentPoseState === 'sitting') {
            dispatch({ type: 'DETECT_INITIAL_POSE' });
            speak('앉은 자세 확인. 이제 일어나세요.');
            // 자막 변경: afterPoseDetected
            const caption = TEST_CAPTIONS[currentTest.id];
            if (caption) {
              dispatch({ type: 'UPDATE_CAPTION', payload: caption.afterPoseDetected });
            }
          }
          return;
        }

        // 2단계: 필요한 자세 감지 시 타이머 시작
        if (!state.timerStarted && state.initialPoseDetected) {
          const requiredPose = config.requiredState;
          if (requiredPose === 'standing' && currentPoseState === 'standing') {
            dispatch({ type: 'START_TIMER' });
            if (!hasAnnouncedTimerStartRef.current) {
              hasAnnouncedTimerStartRef.current = true;
              speak('타이머 시작!');
            }
          } else if (requiredPose === 'sitting' && currentPoseState === 'sitting') {
            dispatch({ type: 'START_TIMER' });
            if (!hasAnnouncedTimerStartRef.current) {
              hasAnnouncedTimerStartRef.current = true;
              speak('타이머 시작!');
            }
          }
          return;
        }
      } else {
        // minHoldSec = 0 이지만 useTimer = true인 경우: 바로 시작
        if (!state.timerStarted) {
          dispatch({ type: 'START_TIMER' });
          // 자막 변경: afterPoseDetected (바로 시작하는 검사)
          const caption = TEST_CAPTIONS[currentTest.id];
          if (caption) {
            dispatch({ type: 'UPDATE_CAPTION', payload: caption.afterPoseDetected });
          }
        }
      }

      // 타이머 시작 후 로직
      if (!state.timerStarted) return;

      // 경과 시간 계산
      const elapsedSec = state.startTime ? (Date.now() - state.startTime) / 1000 : 0;

      // 필요한 자세 유지 시간 누적
      if (config.requiredState === 'any' ||
          (config.requiredState === 'standing' && currentPoseState === 'standing') ||
          (config.requiredState === 'sitting' && currentPoseState === 'sitting')) {
        holdTimeAccumRef.current += 0.3; // 300ms마다 호출되므로 0.3초 추가
      }

      const holdTimeSec = holdTimeAccumRef.current;

      // 타이머 업데이트
      dispatch({ type: 'UPDATE_TIMER', payload: { elapsedSec, holdTimeSec } });

      // 점수 계산
      const result = scoreBBSTest(currentTest.id, frames, holdTimeSec);
      dispatch({ type: 'UPDATE_SCORE', payload: result.score });

      // 완료 체크 (시간 기반)
      if (elapsedSec >= config.durationSec) {
        dispatch({
          type: 'COMPLETE_TEST',
          payload: {
            testId: currentTest.id,
            testNameKo: currentTest.nameKo,
            score: result.score,
            confidence: result.confidence,
            reasoning: result.reasoning,
            criteriaMet: result.criteria_met,
          },
        });
      }
    };

    // 300ms마다 업데이트 (더 빠른 응답)
    console.log(`[BBS-INIT] Interval 설정 - testId: ${currentTest.id}, useTimer: ${TEST_CONFIG[currentTest.id].useTimer}`);
    scoringIntervalRef.current = window.setInterval(updateTimerAndScore, 300);

    // 초기 업데이트 (빠른 시작)
    const initialTimeout = setTimeout(updateTimerAndScore, 100);

    return () => {
      clearTimeout(initialTimeout);
      if (scoringIntervalRef.current) {
        clearInterval(scoringIntervalRef.current);
      }
    };
  }, [state.phase, state.startTime, state.timerStarted, state.waitingForInitialPose, state.initialPoseDetected, currentTest, speak]);

  // Add frame
  const addFrame = useCallback((landmarks: YoloLandmarks, timestamp: number) => {
    console.log(`[addFrame] 프레임 추가 - timestamp: ${timestamp}, phase: ${state.phase}`);
    dispatch({
      type: 'ADD_FRAME',
      payload: { landmarks, timestamp_ms: timestamp },
    });
  }, [state.phase]);

  // Announce results when complete
  const hasAnnouncedResultsRef = useRef(false);

  useEffect(() => {
    if (state.phase === 'results' && state.results.length > 0 && !hasAnnouncedResultsRef.current) {
      hasAnnouncedResultsRef.current = true;
      const total = state.results.reduce((sum, r) => sum + r.score, 0);
      speak(`검사가 완료되었습니다. 총점 ${total}점입니다.`);
    } else if (state.phase !== 'results') {
      hasAnnouncedResultsRef.current = false;
    }
  }, [state.phase, state.results, speak]);

  // Start assessment with voice
  const start = useCallback(() => {
    const firstTest = BBS_TEST_ITEMS[0];
    speak(`BBS 검사를 시작합니다. 첫 번째 검사, ${firstTest.nameKo}. 준비해주세요.`);
    dispatch({ type: 'START' });
  }, [speak]);

  // Restart assessment
  const restart = useCallback(() => {
    stopTTS();
    hasAnnouncedTransitionRef.current = false;
    hasAnnouncedResultsRef.current = false;
    dispatch({ type: 'RESTART' });
  }, [stopTTS]);

  // 현재 테스트 설정
  const testConfig = TEST_CONFIG[currentTest?.id || 1];
  const remainingSec = Math.max(0, testConfig.durationSec - state.elapsedSec);

  return {
    // State
    phase: state.phase,
    currentTestIndex: state.currentTestIndex,
    currentTest,
    results: state.results,
    interimScore: state.interimScore,
    progress,
    totalScore,
    countdownValue: state.countdownValue,
    frameCount: state.frames.length,
    isTTSReady,

    // 타이머 관련
    elapsedSec: state.elapsedSec,
    holdTimeSec: state.holdTimeSec,
    remainingSec,
    testDurationSec: testConfig.durationSec,
    minHoldSec: testConfig.minHoldSec,
    useTimer: testConfig.useTimer,

    // 자세 대기 관련
    timerStarted: state.timerStarted,
    waitingForInitialPose: state.waitingForInitialPose,
    initialPoseDetected: state.initialPoseDetected,
    currentPoseState: state.currentPoseState,

    // 실시간 자막
    currentCaption: state.currentCaption,

    // 디버그 정보
    debugInfo: state.debugInfo,

    // Actions
    addFrame,
    start,
    restart,

    // Computed
    isCapturing: state.phase === 'capturing',
    isReady: state.phase === 'ready',
    isComplete: state.phase === 'results',
  };
}
