# BBS 1번 검사: 앉아서 일어서기 (Sitting to Standing)

---

## 1. 검사 개요

| 항목 | 내용 |
|------|------|
| **검사 번호** | 1번 |
| **검사명 (한글)** | 앉아서 일어서기 |
| **검사명 (영문)** | Sitting to Standing |
| **목적** | 앉은 자세에서 일어서는 능력 평가 |
| **시작 자세** | 의자에 앉은 상태 (팔짱 끼고) |
| **종료 자세** | 서있는 상태 |
| **측정 방식** | 동작 감지 (타이머 없음) |

---

## 2. BBS 공식 채점 기준

| 점수 | 공식 기준 | 핵심 요소 |
|------|----------|----------|
| **4점** | 손 사용 없이 독립적으로 일어섬 | 손 미사용 + 독립적 |
| **3점** | 손을 사용하여 독립적으로 일어섬 | 손 사용 + 독립적 |
| **2점** | 여러 번 시도 후 손을 사용하여 일어섬 | 손 사용 + 여러 번 시도 |
| **1점** | 일어서기 위해 최소한의 도움 필요 | 도움 필요 (최소) |
| **0점** | 일어서기 위해 중등도 또는 최대 도움 필요 | 도움 필요 (중등도/최대) |

### 핵심 평가 요소
1. **손 사용 여부**: 의자 팔걸이나 무릎을 짚었는지
2. **독립성**: 다른 사람의 도움 없이 수행했는지
3. **시도 횟수**: 한 번에 성공했는지, 여러 번 시도했는지

---

## 3. AI 측정 가능 항목

| 항목 | 측정 방법 | 정확도 |
|------|----------|--------|
| **동작 완료** | 앉음→서있음 자세 전환 감지 | 높음 |
| **손 사용 여부** | 팔/손목 위치가 엉덩이 아래로 내려갔는지 | 중간 |
| **안정성** | 연속 프레임 감지 횟수 | 높음 |
| **시도 횟수** | 서있음→앉음 반복 감지 | 중간 |
| **도움 필요** | 2명 이상 감지 + 접촉 | 낮음 |

---

## 4. AI 채점 로직

### 4.1 판단 기준

```
┌─────────────────────────────────────────────────────────┐
│                    동작 완료 여부                        │
│                         │                               │
│            ┌────────────┴────────────┐                  │
│            ▼                         ▼                  │
│         완료 (O)                  미완료 (X)             │
│            │                         │                  │
│     ┌──────┴──────┐           ┌──────┴──────┐          │
│     ▼             ▼           ▼             ▼          │
│  손 미사용     손 사용      시도함       시도 안함       │
│     │             │           │             │          │
│  ┌──┴──┐     ┌───┴───┐       │             │          │
│  ▼     ▼     ▼       ▼       ▼             ▼          │
│ 4점  (3점)  3점     2점     1점           0점          │
│      안정   1회    여러번                               │
└─────────────────────────────────────────────────────────┘
```

### 4.2 점수별 상세 조건

#### 4점 조건
```
- 동작 완료: O (앉음 → 서있음 전환 성공)
- 손 사용: X (팔이 몸 앞/옆에 유지)
- 시도 횟수: 1회
- 안정성: 연속 5프레임 이상 서있음 감지
```

#### 3점 조건
```
- 동작 완료: O
- 손 사용: O (팔/손목이 엉덩이 높이 이하로 내려감)
- 시도 횟수: 1회
- 안정성: 연속 3프레임 이상 서있음 감지
```

#### 2점 조건
```
- 동작 완료: O
- 손 사용: O
- 시도 횟수: 2회 이상 (서있음→앉음 반복 감지)
- 안정성: 연속 1프레임 이상 서있음 감지
```

#### 1점 조건
```
- 동작 완료: X (시도만 함)
- 손 사용: -
- 시도 횟수: 1회 이상
- 안정성: 서있음 잠깐 감지 후 사라짐
```

#### 0점 조건
```
- 동작 완료: X
- 손 사용: -
- 시도 횟수: 0회
- 안정성: 서있음 감지 안됨
```

---

## 5. 손 사용 감지 로직

### 5.1 판단 기준
- **손 미사용**: 양쪽 손목(wrist)이 무릎(knee)에서 **멀리** 있음
- **손 사용**: 한쪽 이상 손목이 무릎에 **가까이** 접근함

### 5.2 왜 무릎 근접 방식인가?

```
❌ 기존 방식 (엉덩이 높이 비교) - 문제점:

   그냥 손 내리고 앉아있음 → 손 사용으로 오판단!

      🙂
      │
   ───┼───
      │
   ───┼─── 엉덩이
      │
   ✋─┼─✋ ← 그냥 손 내림 (손 사용 아님인데 오판단)
     🦵🦵


✅ 개선 방식 (무릎 근접 거리) - 정확함:

  손 미사용                     손 사용 (무릎 짚음)

     🙂                            🙂
     │                             │
  ───┼───                       ───┼───
     │                             │
  ───┼─── 엉덩이                ───┼───
     │                             │
  ✋─┼─✋ 손 (멀리)              ───┼───
    🦵🦵                        ✋🦵🦵✋ ← 손이 무릎 근처!

  → 손목-무릎 거리: 멀다        → 손목-무릎 거리: 가깝다
  → 손 미사용 (4점)             → 손 사용 (3점)
```

### 5.3 거리 계산 원리

```
두 점 사이의 거리 = √[(x2-x1)² + (y2-y1)²]

예시:
  손목 위치: (100, 300)
  무릎 위치: (120, 350)

  거리 = √[(120-100)² + (350-300)²]
       = √[400 + 2500]
       = √2900
       = 53.85

  임계값이 60이라면 → 53.85 < 60 → 손이 무릎에 가깝다 → 손 사용!
```

### 5.4 코드

```typescript
/**
 * 손 사용 여부 감지 (무릎 근접 방식)
 * @param landmarks - YOLO 형식 랜드마크
 * @returns true = 손 사용함, false = 손 미사용
 */
function detectHandUsage(landmarks: YoloLandmarks): boolean {
  const leftWrist = landmarks['left_wrist'];
  const rightWrist = landmarks['right_wrist'];
  const leftKnee = landmarks['left_knee'];
  const rightKnee = landmarks['right_knee'];
  const leftHip = landmarks['left_hip'];
  const rightHip = landmarks['right_hip'];

  // 필수 랜드마크 확인
  if (!leftWrist || !rightWrist || !leftKnee || !rightKnee || !leftHip || !rightHip) {
    return false; // 판단 불가 시 손 미사용으로 처리
  }

  // ========== 1단계: 임계값 계산 ==========
  // 몸통 크기 (엉덩이~무릎 거리)를 기준으로 임계값 설정
  // → 사람마다 체형이 다르므로 상대적 거리 사용
  const torsoHeight = Math.abs(
    ((leftHip.y + rightHip.y) / 2) - ((leftKnee.y + rightKnee.y) / 2)
  );

  // 임계값: 몸통 높이의 50% 이내면 "가깝다"
  const threshold = torsoHeight * 0.5;

  // ========== 2단계: 손목-무릎 거리 계산 ==========
  // 왼쪽 손목 - 왼쪽 무릎 거리
  const leftDistance = Math.sqrt(
    Math.pow(leftWrist.x - leftKnee.x, 2) +
    Math.pow(leftWrist.y - leftKnee.y, 2)
  );

  // 오른쪽 손목 - 오른쪽 무릎 거리
  const rightDistance = Math.sqrt(
    Math.pow(rightWrist.x - rightKnee.x, 2) +
    Math.pow(rightWrist.y - rightKnee.y, 2)
  );

  // ========== 3단계: 판단 ==========
  // 한쪽이라도 무릎에 가까우면 손 사용
  const leftHandNearKnee = leftDistance < threshold;
  const rightHandNearKnee = rightDistance < threshold;

  console.log(`[손사용감지] 왼손거리: ${leftDistance.toFixed(1)}, 오른손거리: ${rightDistance.toFixed(1)}, 임계값: ${threshold.toFixed(1)}`);

  return leftHandNearKnee || rightHandNearKnee;
}
```

### 5.5 코드 단계별 설명

| 단계 | 코드 | 설명 |
|------|------|------|
| 1 | `torsoHeight` | 엉덩이~무릎 거리 계산 (몸통 크기) |
| 2 | `threshold = torsoHeight * 0.5` | 임계값 = 몸통의 50% |
| 3 | `leftDistance`, `rightDistance` | 각 손목과 무릎 사이 거리 계산 |
| 4 | `distance < threshold` | 거리가 임계값보다 작으면 "가깝다" |
| 5 | `return left \|\| right` | 한쪽이라도 가까우면 손 사용 |

### 5.6 임계값 조정 가이드

| 임계값 비율 | 민감도 | 설명 |
|------------|--------|------|
| `0.3` (30%) | 낮음 | 손이 무릎에 아주 가까워야 감지 |
| `0.5` (50%) | 중간 | **권장값** |
| `0.7` (70%) | 높음 | 손이 조금만 내려가도 감지 |

---

## 6. 시도 횟수 감지 로직

### 6.1 시도 횟수란?

일어서려고 했다가 **다시 앉으면** = 시도 실패 1회

```
시도 1회 (성공):
  앉음 → 서있음 → 완료!
  attempts = 0

시도 2회 (1번 실패 후 성공):
  앉음 → 서있음 → 앉음 → 서있음 → 완료!
  attempts = 1 (중간에 1번 앉음)

시도 3회 (2번 실패 후 성공):
  앉음 → 서있음 → 앉음 → 서있음 → 앉음 → 서있음 → 완료!
  attempts = 2 (중간에 2번 앉음)
```

### 6.2 상태 전환 다이어그램

```
              ┌─────────────────────────────────┐
              │                                 │
              ▼                                 │
         ┌─────────┐                       ┌────┴────┐
         │  앉음   │ ──── 일어서기 ────▶  │ 서있음  │
         │ sitting │                       │standing │
         └─────────┘ ◀── 다시 앉음 ────── └─────────┘
              │              │
              │              └──── attempts += 1 (실패!)
              │
              └── 검사 시작점
```

### 6.3 판단 기준

| 이전 상태 | 현재 상태 | 의미 | 동작 |
|----------|----------|------|------|
| `sitting` | `standing` | 일어서기 시도 | `wasStanding = true` |
| `standing` | `sitting` | 다시 앉음 (실패) | `attempts += 1` |
| `standing` | `standing` | 서있음 유지 | 유지 (연속 프레임 카운트) |
| `sitting` | `sitting` | 앉아있음 유지 | 대기 |

### 6.4 코드

```typescript
interface AttemptTracker {
  attempts: number;                              // 실패 횟수
  lastState: 'sitting' | 'standing' | 'unknown'; // 이전 자세
  wasStanding: boolean;                          // 일어선 적 있는지
}

/**
 * 시도 횟수 추적
 * @param currentState - 현재 자세 상태
 * @param tracker - 시도 추적 객체
 * @returns 업데이트된 추적 객체
 */
function trackAttempts(
  currentState: 'sitting' | 'standing' | 'unknown',
  tracker: AttemptTracker
): AttemptTracker {
  const newTracker = { ...tracker };

  // ========== 케이스 1: 서있음 → 앉음 = 시도 실패 ==========
  if (tracker.lastState === 'standing' && currentState === 'sitting') {
    newTracker.attempts += 1;
    newTracker.wasStanding = false;
    console.log(`[시도횟수] 실패! 다시 앉음. 총 실패: ${newTracker.attempts}회`);
  }

  // ========== 케이스 2: 앉음 → 서있음 = 일어서기 시도 ==========
  if (tracker.lastState === 'sitting' && currentState === 'standing') {
    newTracker.wasStanding = true;
    console.log('[시도횟수] 일어서기 시도 중...');
  }

  newTracker.lastState = currentState;
  return newTracker;
}
```

### 6.5 코드 흐름 예시

**예시 1: 한 번에 성공 (4점 또는 3점)**
```
프레임 1: sitting  → lastState = sitting
프레임 2: sitting  → (변화 없음)
프레임 3: standing → wasStanding = true, 일어서기 시도!
프레임 4: standing → (유지)
프레임 5: standing → (유지) → 연속 5프레임 → 완료!

결과: attempts = 0 (실패 없음)
```

**예시 2: 한 번 실패 후 성공 (2점)**
```
프레임 1: sitting  → lastState = sitting
프레임 2: standing → wasStanding = true, 일어서기 시도!
프레임 3: standing → (유지)
프레임 4: sitting  → attempts = 1, 실패! 다시 앉음
프레임 5: sitting  → (대기)
프레임 6: standing → wasStanding = true, 다시 시도!
프레임 7: standing → (유지)
프레임 8: standing → (유지)
프레임 9: standing → (유지)
프레임 10: standing → 연속 5프레임 → 완료!

결과: attempts = 1 (1번 실패)
```

### 6.6 점수와의 관계

| 실패 횟수 (attempts) | 의미 | 점수 영향 |
|---------------------|------|----------|
| 0 | 한 번에 성공 | 4점 또는 3점 (손 사용 여부에 따라) |
| 1 | 두 번째 시도에 성공 | 2점 |
| 2+ | 세 번 이상 시도 | 2점 |
| 시도만 함 (완료 못함) | 일어서지 못함 | 1점 |

### 6.7 5번과 6번 비교

| 항목 | 5번 (손 사용 감지) | 6번 (시도 횟수 감지) |
|------|-------------------|---------------------|
| **측정 대상** | 손목-무릎 거리 | 자세 상태 전환 |
| **판단 기준** | 거리 < 임계값 | standing → sitting |
| **영향** | 4점 vs 3점 구분 | 3점 vs 2점 구분 |
| **측정 시점** | 일어서는 동안 | 검사 전체 |
| **정확도** | 중간 (카메라 각도 영향) | 높음 |

```
점수 결정 흐름:

  동작 완료? ─── No ──▶ 1점 또는 0점
      │
     Yes
      │
      ▼
  시도 횟수? ─── 2회 이상 ──▶ 2점 (6번 로직)
      │
    1회 이하
      │
      ▼
  손 사용? ─── Yes ──▶ 3점 (5번 로직)
      │
     No
      │
      ▼
    4점
```

---

## 7. 통합 채점 함수

```typescript
interface Test1Result {
  score: number;
  confidence: number;
  reasoning: string;
  details: {
    motionCompleted: boolean;
    handUsed: boolean;
    attempts: number;
    consecutiveFrames: number;
  };
}

/**
 * 1번 검사 (앉아서 일어서기) 채점
 * @param frames - 수집된 프레임 데이터
 * @param consecutiveFrames - 연속 서있음 감지 프레임 수
 * @param attempts - 시도 횟수
 * @param motionCompleted - 동작 완료 여부
 * @param handUsed - 손 사용 여부
 */
function scoreTest1(
  frames: PoseFrame[],
  consecutiveFrames: number,
  attempts: number,
  motionCompleted: boolean,
  handUsed: boolean
): Test1Result {

  const details = {
    motionCompleted,
    handUsed,
    attempts,
    consecutiveFrames
  };

  // ========== 0점: 동작 미완료 + 시도 없음 ==========
  if (!motionCompleted && attempts === 0) {
    return {
      score: 0,
      confidence: 0.9,
      reasoning: '일어서기 시도 불가',
      details
    };
  }

  // ========== 1점: 동작 미완료 + 시도함 ==========
  if (!motionCompleted && attempts > 0) {
    return {
      score: 1,
      confidence: 0.85,
      reasoning: '일어서기 시도했으나 완료하지 못함',
      details
    };
  }

  // ========== 2점: 동작 완료 + 여러 번 시도 ==========
  if (motionCompleted && attempts >= 2) {
    return {
      score: 2,
      confidence: 0.8,
      reasoning: '여러 번 시도 후 일어섬',
      details
    };
  }

  // ========== 3점: 동작 완료 + 손 사용 + 1회 시도 ==========
  if (motionCompleted && handUsed && attempts <= 1) {
    return {
      score: 3,
      confidence: 0.85,
      reasoning: '손을 사용하여 독립적으로 일어섬',
      details
    };
  }

  // ========== 4점: 동작 완료 + 손 미사용 + 1회 시도 ==========
  if (motionCompleted && !handUsed && attempts <= 1 && consecutiveFrames >= 5) {
    return {
      score: 4,
      confidence: 0.9,
      reasoning: '손 사용 없이 독립적으로 일어섬',
      details
    };
  }

  // 기본값: 3점 (동작 완료했으나 판단 불확실)
  return {
    score: 3,
    confidence: 0.7,
    reasoning: '일어섬 (세부 판단 불확실)',
    details
  };
}
```

---

## 8. 검사 흐름 다이어그램

```
┌──────────────────────────────────────────────────────────────┐
│                      [검사 시작]                              │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ [1단계] 앉은 자세 대기                                   │ │
│  │  - 자막: "앉으세요"                                      │ │
│  │  - 앉은 자세 감지 대기 (연속 5프레임)                    │ │
│  │  - 손 위치 기록 시작                                     │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           │                                  │
│                    앉은 자세 감지됨                          │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ [2단계] 일어서기 대기                                    │ │
│  │  - 자막: "일어나세요"                                    │ │
│  │  - 서있는 자세 감지 대기                                 │ │
│  │  - 손 사용 여부 실시간 감지                              │ │
│  │  - 시도 횟수 카운트                                      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           │                                  │
│                    서있는 자세 감지됨                        │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ [3단계] 채점                                             │ │
│  │  - 동작 완료 확인                                        │ │
│  │  - 손 사용 여부 확인                                     │ │
│  │  - 시도 횟수 확인                                        │ │
│  │  - 안정성 확인 (연속 프레임)                             │ │
│  │  - 최종 점수 결정                                        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           │                                  │
│                           ▼                                  │
│                    [검사 완료]                               │
│                   점수 표시 + 음성 안내                      │
└──────────────────────────────────────────────────────────────┘
```

---

## 9. 상태 관리 코드

```typescript
interface Test1State {
  phase: 'waiting_sit' | 'waiting_stand' | 'done';
  handUsageDetected: boolean;
  attempts: number;
  consecutiveStandingFrames: number;
  startTime: number | null;
}

const initialTest1State: Test1State = {
  phase: 'waiting_sit',
  handUsageDetected: false,
  attempts: 0,
  consecutiveStandingFrames: 0,
  startTime: null
};

/**
 * 1번 검사 상태 업데이트
 */
function updateTest1State(
  state: Test1State,
  currentPose: 'sitting' | 'standing' | 'unknown',
  landmarks: YoloLandmarks
): Test1State {
  const newState = { ...state };

  switch (state.phase) {
    case 'waiting_sit':
      // 앉은 자세 감지 대기
      if (currentPose === 'sitting') {
        newState.phase = 'waiting_stand';
        newState.startTime = Date.now();
      }
      break;

    case 'waiting_stand':
      // 손 사용 여부 감지
      if (detectHandUsage(landmarks)) {
        newState.handUsageDetected = true;
      }

      // 서있는 자세 감지
      if (currentPose === 'standing') {
        newState.consecutiveStandingFrames += 1;

        // 연속 5프레임 감지 시 완료
        if (newState.consecutiveStandingFrames >= 5) {
          newState.phase = 'done';
        }
      } else if (currentPose === 'sitting') {
        // 다시 앉음 = 시도 실패
        if (newState.consecutiveStandingFrames > 0) {
          newState.attempts += 1;
        }
        newState.consecutiveStandingFrames = 0;
      }
      break;

    case 'done':
      // 완료 상태 유지
      break;
  }

  return newState;
}
```

---

## 10. 참고사항

### AI 한계점
| 항목 | 한계 | 보완 방법 |
|------|------|----------|
| 손 사용 여부 | 카메라 각도에 따라 부정확 | 정면 촬영 권장 |
| 의자 팔걸이 사용 | 팔걸이 인식 불가 | 팔걸이 없는 의자 사용 |
| 도움 필요 여부 | 접촉 판단 어려움 | 검사자 수동 조정 |

### 권장 촬영 환경
- 카메라 위치: 정면, 전신이 보이도록
- 의자: 팔걸이 없는 의자 권장
- 조명: 밝은 환경
- 복장: 관절이 보이는 복장

---

## 11. 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2024-XX-XX | 1.0 | 초기 문서 작성 |
| 2024-XX-XX | 1.1 | 손 사용 감지 로직 추가 |
| 2024-XX-XX | 1.2 | 시도 횟수 감지 로직 추가 |
