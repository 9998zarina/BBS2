# BBS AI Assessment System
## Product Requirements Document (PRD)

---

# 1. 제품 개요

## 1.1 제품명
**BBS AI Assessment System** - AI 기반 Berg Balance Scale 자동 평가 시스템

## 1.2 제품 설명
물리치료사 및 재활의학 전문가를 위한 AI 기반 균형 평가 자동화 솔루션입니다.
환자의 균형 검사 영상을 업로드하면 AI가 자동으로 14가지 BBS(Berg Balance Scale) 검사 항목을 인식하고 채점합니다.

## 1.3 핵심 가치
| 기존 방식 | AI 솔루션 |
|-----------|-----------|
| 수동 관찰 및 기록 | 자동 영상 분석 |
| 평가자 간 편차 발생 | 일관된 객관적 평가 |
| 실시간 관찰 필요 | 영상 기반 사후 분석 가능 |
| 경험에 의존한 판단 | 데이터 기반 정량적 측정 |
| 30분+ 소요 | 5분 내 자동 분석 |

## 1.4 타겟 사용자
- 물리치료사
- 재활의학과 전문의
- 요양병원/재활병원
- 노인복지시설
- 스포츠 재활센터
- 연구기관

---

# 2. BBS (Berg Balance Scale) 검사 항목

## 2.1 검사 개요
Berg Balance Scale은 노인 및 신경계 환자의 균형 능력을 평가하는 표준 검사입니다.
- **총 14개 항목**
- **각 항목 0-4점** (총점 56점)
- **평가 시간**: 기존 15-20분 → AI 자동 분석 5분

## 2.2 점수 해석
| 점수 범위 | 낙상 위험도 | 보행 보조기구 |
|-----------|-------------|---------------|
| 41-56점 | 낮음 | 불필요 |
| 21-40점 | 중간 | 필요할 수 있음 |
| 0-20점 | 높음 | 필요 |

## 2.3 14개 검사 항목 상세

### 검사 1: 앉은 자세에서 일어서기 (Sitting to Standing)
| 점수 | 기준 |
|------|------|
| 4 | 손을 사용하지 않고 일어서서 안정적으로 섬 |
| 3 | 손을 사용하여 독립적으로 일어섬 |
| 2 | 여러 번 시도 후 손을 사용하여 일어섬 |
| 1 | 일어서거나 안정화하기 위해 최소한의 도움 필요 |
| 0 | 일어서기 위해 중등도 또는 최대의 도움 필요 |

**AI 측정 항목:**
- 무릎 각도 변화 (앉음 <120° → 섬 >160°)
- 손 지지 사용 여부 (손목이 엉덩이 아래로 내려가는지)
- 일어선 후 CoM(무게중심) 안정성

### 검사 2: 지지 없이 서기 (Standing Unsupported)
| 점수 | 기준 |
|------|------|
| 4 | 2분 동안 안전하게 서 있음 |
| 3 | 감독 하에 2분 동안 서 있음 |
| 2 | 지지 없이 30초 동안 서 있음 |
| 1 | 30초 동안 서 있기 위해 여러 번 시도 필요 |
| 0 | 지지 없이 30초 동안 서 있을 수 없음 |

**AI 측정 항목:**
- 서 있는 시간 (초)
- 무게중심(CoM) 궤적 분석
- 최대 편차 (max excursion)
- 균형 상실 이벤트 감지

### 검사 3: 지지 없이 앉기 (Sitting Unsupported)
| 점수 | 기준 |
|------|------|
| 4 | 등을 떼고 안전하게 2분 동안 앉아 있음 |
| 3 | 감독 하에 등을 떼고 2분 동안 앉아 있음 |
| 2 | 등을 떼고 30초 동안 앉아 있음 |
| 1 | 등을 떼고 10초 동안 앉아 있음 |
| 0 | 등을 떼고 10초 동안 앉아 있을 수 없음 |

**AI 측정 항목:**
- 어깨-엉덩이 정렬 분석 (측면 영상)
- 등이 의자에서 떨어진 시간 측정
- 좌우/앞뒤 흔들림 정도

### 검사 4: 서서 앉기 (Standing to Sitting)
| 점수 | 기준 |
|------|------|
| 4 | 손을 최소한으로 사용하여 안전하게 앉음 |
| 3 | 손을 사용하여 하강을 조절함 |
| 2 | 다리 뒤를 의자에 대어 하강을 조절함 |
| 1 | 독립적으로 앉지만 하강이 조절되지 않음 |
| 0 | 앉기 위해 도움이 필요함 |

**AI 측정 항목:**
- 엉덩이 하강 속도 분석
- 하강 조절 여부 (급격한 하강 감지)
- 손 지지 사용 여부

### 검사 5: 이동하기 (Transfers)
| 점수 | 기준 |
|------|------|
| 4 | 손을 약간 사용하여 안전하게 이동 |
| 3 | 손을 확실히 사용하여 안전하게 이동 |
| 2 | 언어적 지시 및/또는 감독이 필요 |
| 1 | 한 사람의 도움이 필요 |
| 0 | 두 사람의 도움 또는 감독이 필요 |

**AI 측정 항목:**
- 무게중심 이동 안정성
- 손 지지 사용 패턴
- 균형 상실 이벤트

### 검사 6: 눈 감고 서기 (Standing with Eyes Closed)
| 점수 | 기준 |
|------|------|
| 4 | 10초 동안 안전하게 서 있음 |
| 3 | 감독 하에 10초 동안 서 있음 |
| 2 | 3초 동안 서 있음 |
| 1 | 눈을 3초 감고 있지 못하지만 안전하게 서 있음 |
| 0 | 넘어지지 않도록 도움이 필요 |

**AI 측정 항목:**
- 서 있는 시간 측정
- 신체 흔들림(sway) 분석
- 최대 편차 (max excursion)

### 검사 7: 두 발 모으고 서기 (Standing with Feet Together)
| 점수 | 기준 |
|------|------|
| 4 | 두 발 모으고 1분 동안 안전하게 서 있음 |
| 3 | 감독 하에 두 발 모으고 1분 동안 서 있음 |
| 2 | 두 발 모으고 30초 동안 유지 |
| 1 | 자세를 취하는 데 도움이 필요하지만 15초 유지 가능 |
| 0 | 자세를 취하는 데 도움이 필요하고 15초 유지 불가 |

**AI 측정 항목:**
- 발 간격 (base of support width)
- 좌우 흔들림 (medial-lateral sway) - cm 단위
- 앞뒤 흔들림 (anterior-posterior sway) - cm 단위
- 안정성 등급: 안정(<3cm) / 약간 불안정(3-6cm) / 불안정(6-10cm) / 매우 불안정(>10cm)

### 검사 8: 팔 뻗어 내밀기 (Reaching Forward)
| 점수 | 기준 |
|------|------|
| 4 | 자신 있게 25cm 이상 앞으로 뻗음 |
| 3 | 12.5cm 이상 앞으로 뻗음 |
| 2 | 5cm 이상 앞으로 뻗음 |
| 1 | 앞으로 뻗지만 감독이 필요 |
| 0 | 시도하는 동안 균형을 잃거나 외부 지지가 필요 |

**AI 측정 항목:**
- 손목 이동 거리 (cm)
- 어깨 너비 기준 스케일 보정
- 균형 상실 이벤트

### 검사 9: 바닥 물건 집기 (Retrieving Object from Floor)
| 점수 | 기준 |
|------|------|
| 4 | 안전하고 쉽게 물건을 집음 |
| 3 | 물건을 집지만 감독이 필요 |
| 2 | 물건을 집지 못하지만 2-5cm 이내 도달, 균형 유지 |
| 1 | 집지 못하고 시도 시 감독 필요 |
| 0 | 시도 불가 / 균형 유지를 위해 도움 필요 |

**AI 측정 항목:**
- 손목 최저점 (발목 높이 도달 여부)
- 몸통 굴곡 각도
- 균형 상실 이벤트

### 검사 10: 뒤돌아보기 (Turning to Look Behind)
| 점수 | 기준 |
|------|------|
| 4 | 양쪽 모두 좋은 체중 이동으로 뒤를 봄 |
| 3 | 한쪽만 좋은 회전, 다른 쪽은 체중 이동 적음 |
| 2 | 옆으로만 돌지만 균형 유지 |
| 1 | 회전 시 감독 필요 |
| 0 | 균형 유지를 위해 도움 필요 |

**AI 측정 항목:**
- 척추 회전 각도 (좌/우)
- 양측 회전 대칭성
- 균형 상실 이벤트

### 검사 11: 360도 회전 (Turning 360 Degrees)
| 점수 | 기준 |
|------|------|
| 4 | 4초 이내에 안전하게 360도 회전 |
| 3 | 한쪽으로만 4초 이내 안전하게 회전 |
| 2 | 안전하게 360도 회전하지만 느림 |
| 1 | 근접 감독 또는 언어적 지시 필요 |
| 0 | 회전 시 도움 필요 |

**AI 측정 항목:**
- 회전 소요 시간 (초)
- 발 교차 횟수 (step count)
- 균형 상실 이벤트

### 검사 12: 발판에 발 교대로 올리기 (Placing Alternate Foot on Stool)
| 점수 | 기준 |
|------|------|
| 4 | 독립적으로 20초 내 8회 완료 |
| 3 | 독립적으로 20초 초과하여 8회 완료 |
| 2 | 감독 하에 4회 완료 |
| 1 | 최소 도움으로 2회 초과 완료 |
| 0 | 넘어지지 않도록 도움 필요 / 시도 불가 |

**AI 측정 항목:**
- 발 교차 횟수
- 소요 시간
- 균형 상실 이벤트

### 검사 13: 일렬로 서기 (Standing with One Foot in Front - Tandem)
| 점수 | 기준 |
|------|------|
| 4 | 독립적으로 tandem 자세 30초 유지 |
| 3 | 독립적으로 발을 앞에 놓고 30초 유지 |
| 2 | 독립적으로 작은 걸음으로 30초 유지 |
| 1 | 발을 내딛는 데 도움 필요하지만 15초 유지 가능 |
| 0 | 발을 내딛거나 서 있는 동안 균형 상실 |

**AI 측정 항목:**
- 발 위치 (tandem 자세 감지)
- tandem 자세 유지 시간
- 균형 상실 이벤트

### 검사 14: 한 발로 서기 (Standing on One Foot)
| 점수 | 기준 |
|------|------|
| 4 | 독립적으로 다리를 들고 10초 초과 유지 |
| 3 | 독립적으로 다리를 들고 5-10초 유지 |
| 2 | 독립적으로 다리를 들고 3초 이상 유지 |
| 1 | 다리를 들려고 하나 3초 유지 불가, 독립적으로 서 있음 |
| 0 | 시도 불가 또는 넘어지지 않도록 도움 필요 |

**AI 측정 항목:**
- 한 발 들기 감지 (발목 높이 차이)
- 한 발로 서 있는 시간
- 균형 상실 이벤트

---

# 3. 시스템 아키텍처

## 3.1 기술 스택

### Frontend
| 기술 | 용도 |
|------|------|
| React 18 | UI 프레임워크 |
| TypeScript | 타입 안전성 |
| Vite | 빌드 도구 |
| Tailwind CSS | 스타일링 |
| Axios | API 통신 |
| React Router | 라우팅 |

### Backend
| 기술 | 용도 |
|------|------|
| Python 3.11+ | 서버 언어 |
| FastAPI | REST API 프레임워크 |
| Uvicorn | ASGI 서버 |
| YOLOv8-pose | AI 포즈 추정 |
| OpenCV | 영상 처리 |
| NumPy/SciPy | 수치 연산 |
| FFmpeg | 오디오 추출 |

### AI/ML
| 기술 | 용도 |
|------|------|
| YOLOv8m-pose | 17개 관절 포즈 추정 |
| Cross-Correlation | 영상 동기화 |
| Rule-based Scoring | BBS 채점 로직 |

## 3.2 시스템 구성도

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
├─────────────────────────────────────────────────────────────┤
│  HomePage  │  AutoAnalysisPage  │  AssessmentPage           │
│            │  (자동 분석)        │  (수동 검사 선택)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ REST API
┌─────────────────────────────────────────────────────────────┐
│                      Backend (FastAPI)                       │
├─────────────────────────────────────────────────────────────┤
│  /api/v1/video/*        │ 영상 업로드/관리                   │
│  /api/v1/sync/*         │ 영상 동기화                        │
│  /api/v1/analysis/*     │ 수동 분석                          │
│  /api/v1/auto-analysis/*│ 자동 분석 (검사 인식 + 채점)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      AI Services                             │
├─────────────────────────────────────────────────────────────┤
│  PoseEstimationService  │ YOLOv8-pose 포즈 추정              │
│  ActionRecognitionService│ 검사 종류 자동 인식               │
│  BBSScoringService      │ 14개 검사 자동 채점                │
│  AudioSyncService       │ Cross-Correlation 동기화           │
└─────────────────────────────────────────────────────────────┘
```

## 3.3 프로젝트 디렉토리 구조

```
bbs-assessment/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── video/
│   │   │       ├── VideoUploader.tsx      # 영상 업로드
│   │   │       └── DualVideoPlayer.tsx    # 듀얼 영상 플레이어
│   │   ├── pages/
│   │   │   ├── HomePage.tsx               # 메인 페이지
│   │   │   ├── AutoAnalysisPage.tsx       # 자동 분석 페이지
│   │   │   └── AssessmentPage.tsx         # 수동 평가 페이지
│   │   ├── services/
│   │   │   └── api.ts                     # API 클라이언트
│   │   ├── hooks/
│   │   │   └── useIndexedDB.ts            # 로컬 저장소
│   │   └── utils/
│   │       └── bbs-test-items.ts          # BBS 검사 정의
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── main.py                        # FastAPI 앱
│   │   ├── api/routes/
│   │   │   ├── video.py                   # 영상 API
│   │   │   ├── sync.py                    # 동기화 API
│   │   │   ├── analysis.py                # 분석 API
│   │   │   └── auto_analysis.py           # 자동 분석 API
│   │   ├── services/
│   │   │   ├── pose_estimation.py         # YOLO 포즈 추정
│   │   │   ├── action_recognition.py      # 검사 인식
│   │   │   ├── bbs_scoring.py             # BBS 채점
│   │   │   └── audio_sync.py              # 오디오 동기화
│   │   └── utils/
│   │       ├── angle_calculator.py        # 관절 각도 계산
│   │       └── stability_analyzer.py      # 안정성 분석
│   └── requirements.txt
│
└── PRD.md
```

---

# 4. 핵심 기능

## 4.1 자동 분석 (Option B) - 핵심 차별점

### 작동 방식
1. **영상 업로드**: 정면 영상(필수) + 측면 영상(선택)
2. **포즈 추정**: YOLOv8로 프레임별 17개 관절 좌표 추출
3. **검사 자동 인식**: 동작 패턴 분석으로 14개 중 어떤 검사인지 판별
4. **자동 채점**: 인식된 검사에 맞는 채점 로직 적용
5. **결과 표시**: 점수, 신뢰도, 판단 근거 표시

### 검사 인식 알고리즘
```python
# 각 검사별 동작 패턴 분석
검사 1 (앉았다 일어서기): 무릎 각도 90° → 180° 변화
검사 2 (지지 없이 서기): 무릎 각도 > 160° 유지
검사 3 (지지 없이 앉기): 무릎 각도 < 120° + 등 떼기
검사 6 (눈 감고 서기): 무릎 > 160° + 안정적 서기
검사 7 (두 발 모으고 서기): 발 간격 < 15cm + 서기
검사 11 (360도 회전): 몸통 회전 감지
검사 14 (한 발로 서기): 양 발목 높이 차이 > 8cm
...
```

## 4.2 영상 동기화 (Audio Cross-Correlation)

### 작동 원리
1. 정면/측면 영상에서 오디오 트랙 추출 (FFmpeg)
2. 두 오디오 신호의 상관관계 계산 (scipy.signal.correlate)
3. 최대 상관값 위치에서 시간 오프셋 계산
4. 영상 재생 시 오프셋 적용

```python
# 핵심 알고리즘
correlation = signal.correlate(audio1, audio2, mode='full', method='fft')
offset_samples = np.argmax(correlation) - len(audio2) + 1
offset_ms = (offset_samples / sample_rate) * 1000
```

## 4.3 포즈 추정 (YOLOv8-pose)

### 17개 관절 포인트
```
0: 코 (nose)
1-2: 눈 (left_eye, right_eye)
3-4: 귀 (left_ear, right_ear)
5-6: 어깨 (left_shoulder, right_shoulder)
7-8: 팔꿈치 (left_elbow, right_elbow)
9-10: 손목 (left_wrist, right_wrist)
11-12: 엉덩이 (left_hip, right_hip)
13-14: 무릎 (left_knee, right_knee)
15-16: 발목 (left_ankle, right_ankle)
```

### 다중 인물 처리
- 영상에 여러 사람이 있을 경우, 가장 큰 바운딩 박스 선택
- 환자는 보통 카메라에 더 가까이 있어 더 크게 나타남

## 4.4 안정성 분석 (Stability Analyzer)

### 측정 지표
| 지표 | 설명 | 용도 |
|------|------|------|
| max_excursion | 중심에서 최대 편차 | 균형 상실 감지 |
| mean_velocity | 평균 이동 속도 | 흔들림 정도 |
| path_length | 총 이동 거리 | 불안정성 지표 |
| sway_area | 95% 신뢰 타원 면적 | 전체 흔들림 |
| ml_range | 좌우 흔들림 범위 | 측면 안정성 |
| ap_range | 앞뒤 흔들림 범위 | 전후 안정성 |

---

# 5. API 명세

## 5.1 영상 API

### 영상 업로드
```
POST /api/v1/video/upload
Content-Type: multipart/form-data

Request:
  file: <video_file>

Response:
{
  "id": "uuid-string",
  "filename": "video.mp4",
  "duration": 30.5,
  "width": 1920,
  "height": 1080,
  "fps": 30
}
```

### 영상 스트리밍
```
GET /api/v1/video/{video_id}
Response: video/mp4 stream
```

## 5.2 동기화 API

### 동기화 분석 시작
```
POST /api/v1/sync/analyze
Content-Type: application/json

Request:
{
  "front_video_id": "uuid",
  "side_video_id": "uuid",
  "test_item_id": 1
}

Response:
{
  "job_id": "uuid",
  "status": "pending"
}
```

### 동기화 상태 조회
```
GET /api/v1/sync/status/{job_id}

Response:
{
  "job_id": "uuid",
  "status": "completed",
  "offset_ms": 150.5,
  "confidence": 0.95
}
```

## 5.3 자동 분석 API

### 자동 분석 시작
```
POST /api/v1/auto-analysis/start
Content-Type: application/json

Request:
{
  "front_video_id": "uuid",
  "side_video_id": "uuid" (선택),
  "sync_offset_ms": 0
}

Response:
{
  "job_id": "uuid",
  "status": "pending"
}
```

### 자동 분석 결과 조회
```
GET /api/v1/auto-analysis/status/{job_id}

Response:
{
  "job_id": "uuid",
  "status": "completed",
  "detected_test_id": 7,
  "detected_test_name": "Standing with Feet Together",
  "detected_test_name_ko": "두 발 모으고 서기",
  "detection_confidence": 0.85,
  "score": 3,
  "scoring_confidence": 0.78,
  "reasoning": "두 발 모으고 45초 서 있음 (약간 불안정: 좌우 흔들림 4.2cm)",
  "criteria_met": {
    "feet_together": true,
    "duration_30sec": true,
    "stable": false,
    "lateral_sway_cm": 4.2,
    "ap_sway_cm": 3.1
  },
  "all_test_scores": {
    "1": 15.2,
    "2": 42.1,
    "7": 85.3,
    ...
  }
}
```

---

# 6. 사용자 인터페이스

## 6.1 메인 화면 (HomePage)

### 두 가지 평가 모드
1. **자동 BBS 분석** (추천)
   - AI가 검사 종류를 자동 인식
   - 영상만 업로드하면 완전 자동 채점
   - 보라색 그라데이션 강조 UI

2. **수동 평가**
   - 검사 항목을 직접 선택
   - 14개 항목별 개별 평가
   - 기존 방식과 유사

## 6.2 자동 분석 화면 (AutoAnalysisPage)

### UI 구성
1. **영상 업로드 영역**
   - 정면 영상 (필수)
   - 측면 영상 (선택)
   - 드래그 앤 드롭 지원

2. **영상 미리보기**
   - 듀얼 비디오 플레이어
   - 동기화된 재생

3. **분석 결과**
   - 감지된 검사: 검사 번호, 이름, 신뢰도
   - 검사별 매칭 점수: 14개 검사 모두 표시
   - 채점 결과: 점수(0-4), 채점 신뢰도
   - AI 판단 근거: 상세 설명
   - 충족 기준: 체크리스트

## 6.3 수동 평가 화면 (AssessmentPage)

### UI 구성
1. **검사 항목 선택**
   - 14개 검사 카드 그리드
   - 각 카드에 검사 설명

2. **영상 업로드**
   - 정면/측면 영상 업로드
   - 영상 동기화 분석

3. **분석 결과**
   - 점수 및 판단 근거
   - 채점 기준 비교

---

# 7. 설치 및 실행

## 7.1 시스템 요구사항

### 최소 사양
- CPU: Intel i5 / AMD Ryzen 5 이상
- RAM: 8GB 이상
- GPU: NVIDIA GPU (CUDA 지원) 권장
- 저장공간: 10GB 이상
- OS: Windows 10/11, macOS 11+, Ubuntu 20.04+

### 권장 사양
- CPU: Intel i7 / AMD Ryzen 7 이상
- RAM: 16GB 이상
- GPU: NVIDIA RTX 3060 이상
- 저장공간: 50GB 이상

## 7.2 설치 방법

### Backend 설치
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend 설치
```bash
cd frontend
npm install
```

### FFmpeg 설치
```bash
# macOS
brew install ffmpeg

# Ubuntu
sudo apt install ffmpeg

# Windows
# https://ffmpeg.org/download.html 에서 다운로드
```

## 7.3 실행 방법

### Backend 실행
```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend 실행
```bash
cd frontend
npm run dev
```

### 접속
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API 문서: http://localhost:8000/docs

---

# 8. 향후 개발 계획

## 8.1 Phase 2 기능
- [ ] 환자 정보 관리 (DB 연동)
- [ ] 평가 이력 저장 및 추이 분석
- [ ] PDF 리포트 생성
- [ ] 다국어 지원 (영어, 일본어)

## 8.2 Phase 3 기능
- [ ] 클라우드 배포 (AWS/GCP)
- [ ] 모바일 앱 (React Native)
- [ ] 실시간 영상 분석
- [ ] EMR/HIS 시스템 연동

## 8.3 AI 고도화
- [ ] 딥러닝 기반 채점 모델 학습
- [ ] 환자별 맞춤 분석
- [ ] 치료사-환자 자동 구분
- [ ] 이상 동작 감지

---

# 9. 라이선스 및 연락처

## 9.1 라이선스
- 상업용 라이선스 (별도 문의)
- 기술 지원 포함

## 9.2 문의
- 이메일: [contact@example.com]
- 전화: [02-XXX-XXXX]

---

# 부록: 채점 정확도 검증

## A.1 검증 방법
- 전문 물리치료사 3인의 평가와 AI 평가 비교
- Cohen's Kappa 계수로 일치도 측정

## A.2 예상 정확도
| 검사 항목 | 예상 정확도 |
|-----------|-------------|
| 앉았다 일어서기 | 85-90% |
| 지지 없이 서기 | 90-95% |
| 두 발 모으고 서기 | 85-90% |
| 한 발로 서기 | 90-95% |
| 360도 회전 | 80-85% |

---

*Document Version: 1.0*
*Last Updated: 2024*
