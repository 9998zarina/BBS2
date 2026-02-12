# BBS (Berg Balance Scale) AI 평가 시스템

AI 기반 Berg Balance Scale 자동 평가 웹 애플리케이션입니다.

## 기능

- 14가지 BBS 검사 항목 자동 채점
- 정면/측면 영상 업로드
- 오디오 Cross-Correlation을 통한 영상 동기화
- MediaPipe 기반 포즈 분석
- IndexedDB를 통한 로컬 데이터 저장

## 기술 스택

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Backend**: Python FastAPI + MediaPipe + OpenCV
- **Storage**: IndexedDB (브라우저)

## 설치 및 실행

### 사전 요구사항

- Node.js 18+
- Python 3.10+
- FFmpeg (오디오 동기화용)

### FFmpeg 설치

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows (Chocolatey)
choco install ffmpeg
```

### Backend 설정

```bash
# 가상환경 생성
cd backend
python -m venv venv

# 가상환경 활성화
# macOS/Linux
source venv/bin/activate
# Windows
venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# 서버 실행
uvicorn app.main:app --reload --port 8000
```

### Frontend 설정

```bash
# 의존성 설치
cd frontend
npm install

# 개발 서버 실행
npm run dev
```

### 접속

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API 문서: http://localhost:8000/docs

## 사용 방법

1. 홈페이지에서 "평가 시작하기" 클릭
2. 14개 검사 항목 중 하나 선택
3. 정면 영상과 측면 영상 업로드
4. "오디오 동기화" 버튼으로 영상 동기화 (선택사항)
5. "AI 분석 시작" 버튼으로 자동 채점
6. 결과 확인

## BBS 검사 항목

| 번호 | 항목 | 시간 기준 |
|------|------|----------|
| 1 | 앉은 자세에서 일어서기 | - |
| 2 | 지지 없이 서 있기 | 2분 |
| 3 | 지지 없이 앉아 있기 | 2분 |
| 4 | 선 자세에서 앉기 | - |
| 5 | 이동하기 | - |
| 6 | 눈 감고 서 있기 | 10초 |
| 7 | 두 발 모으고 서 있기 | 1분 |
| 8 | 팔 뻗어 앞으로 내밀기 | - |
| 9 | 바닥에서 물건 집어 올리기 | - |
| 10 | 뒤돌아보기 (좌/우) | - |
| 11 | 360도 회전하기 | 4초 |
| 12 | 발판 위에 발 교대로 올리기 | 20초 |
| 13 | 한 발 앞에 다른 발 두고 서기 | 30초 |
| 14 | 한 발로 서 있기 | 10초 |

## 점수 해석

- **41-56점**: 독립 보행 가능 (낮은 낙상 위험)
- **21-40점**: 보조 기구 필요 (중등도 낙상 위험)
- **0-20점**: 휠체어 필요 (높은 낙상 위험)

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/v1/video/upload` | 영상 업로드 |
| GET | `/api/v1/video/{id}` | 영상 조회 |
| POST | `/api/v1/sync/analyze` | 영상 동기화 분석 |
| GET | `/api/v1/sync/status/{job_id}` | 동기화 상태 조회 |
| POST | `/api/v1/analysis/start` | AI 분석 시작 |
| GET | `/api/v1/analysis/status/{job_id}` | 분석 상태 조회 |
| GET | `/api/v1/analysis/result/{job_id}` | 분석 결과 조회 |

## 프로젝트 구조

```
├── frontend/                    # React 프론트엔드
│   ├── src/
│   │   ├── components/         # UI 컴포넌트
│   │   ├── pages/              # 페이지 컴포넌트
│   │   ├── hooks/              # 커스텀 훅
│   │   ├── services/           # API 서비스
│   │   ├── types/              # TypeScript 타입
│   │   └── utils/              # 유틸리티
│   └── package.json
│
├── backend/                     # FastAPI 백엔드
│   ├── app/
│   │   ├── api/routes/         # API 라우트
│   │   ├── services/           # 비즈니스 로직
│   │   ├── scoring/            # BBS 채점 로직
│   │   └── utils/              # 유틸리티
│   └── requirements.txt
│
└── README.md
```

## 라이선스

MIT License
