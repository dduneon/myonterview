from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import init_db
from app.api import session, tts, stt, feedback, recording
from app.ws.interview import interview_ws_handler

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="면터뷰 API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST 라우터
app.include_router(session.router)
app.include_router(tts.router)
app.include_router(stt.router)
app.include_router(feedback.router)
app.include_router(recording.router)


# WebSocket
@app.websocket("/ws/session/{session_id}")
async def ws_interview(websocket: WebSocket, session_id: str):
    await interview_ws_handler(websocket, session_id)


@app.get("/health")
async def health():
    return {"status": "ok"}
