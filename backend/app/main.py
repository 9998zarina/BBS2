from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import video, sync, analysis, auto_analysis, realtime

app = FastAPI(
    title="BBS Assessment API",
    description="AI-based Berg Balance Scale Assessment API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(video.router, prefix="/api/v1/video", tags=["video"])
app.include_router(sync.router, prefix="/api/v1/sync", tags=["sync"])
app.include_router(analysis.router, prefix="/api/v1/analysis", tags=["analysis"])
app.include_router(auto_analysis.router, prefix="/api/v1/auto-analysis", tags=["auto-analysis"])
app.include_router(realtime.router, prefix="/api/v1/realtime", tags=["realtime"])


@app.get("/api/v1/health")
async def health_check():
    return {"status": "healthy", "service": "BBS Assessment API"}
