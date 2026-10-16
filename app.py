import os
import json
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
import database

import os
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# static 폴더 연동
app.mount("/static", StaticFiles(directory="static"), name="static")

# 메인 웹 페이지(/) 접속 시 index.html 띄우기
@app.get("/")
async def read_root():
    return FileResponse("static/index.html")

# (이 아래에는 기존에 있던 Gemini API 관련 @app.post("/api/ask") 코드 유지)


# DB 초기화
database.init_db()

# .env 파일 로드
load_dotenv()

# GEMINI_API_KEY 환경 변수 확인
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# FastAPI 앱 인스턴스 생성
app = FastAPI(
    title="AI 습관 튜터 서비스 API",
    description="작은 질문에서 시작하는 나만의 AI 습관 - 학생 AI 챌린지 웹 서비스 백엔드",
    version="1.0.0"
)

# CORS 설정 (프론트엔드 연동 대비)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 정적 파일(static) 서빙 설정
static_dir = Path("static")
if static_dir.exists():
    app.mount("/static", StaticFiles(directory="static"), name="static")

# Gemini 클라이언트 초기화 함수
def get_gemini_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GEMINI_API_KEY가 환경 변수(.env)에 설정되어 있지 않습니다."
        )
    return genai.Client(api_key=api_key)


# 요청 스키마
class AskRequest(BaseModel):
    user_id: str = Field(..., description="사용자 고유 식별자", example="student_123")
    user_question: str = Field(..., description="사용자의 질문 내용", example="인공지능이란 무엇인가요?")


# Gemini 구조화된 출력 스키마
class TutorContent(BaseModel):
    answer: str = Field(..., description="사용자 질문에 대한 친절한 설명과 답변")
    deep_dive_tip: str = Field(..., description="사용자가 AI 활용 능력을 키울 수 있는 오늘의 심화 질문 팁 1개")


# 응답 스키마
class AskResponse(BaseModel):
    user_id: str
    answer: str
    deep_dive_tip: str
    streak_count: int = Field(default=1, description="현재 연속 출석 일수")
    is_first_today: bool = Field(default=True, description="오늘 첫 출석 여부")
    attended_today: bool = Field(default=True, description="오늘 출석 완료 여부")


class UserStatusResponse(BaseModel):
    user_id: str
    name: str
    streak_count: int
    last_active_date: Optional[str]
    attended_today: bool


@app.get("/")
def read_root():
    """메인 모바일 UI 웹 페이지 서빙"""
    index_file = Path("static/index.html")
    if index_file.exists():
        return FileResponse(index_file)
    return {
        "status": "ok",
        "message": "AI 습관 튜터 백엔드 서비스가 정상 작동 중입니다."
    }


@app.get("/health")
def health_check():
    """서버 상태 확인용 헬스체크 엔드포인트"""
    return {"status": "ok"}


@app.get("/api/user/{user_id}", response_model=UserStatusResponse)
def get_user_status_api(user_id: str):
    """사용자의 출석 현황 및 streak 정보 조회"""
    return database.get_user_status(user_id)


@app.post("/api/ask", response_model=AskResponse)
async def ask_question(request: AskRequest):
    """
    유저의 질문을 받아 Gemini 모델을 통해 답변 및 심화 질문 팁을 생성하고,
    SQLite logs 및 users 테이블에 저장하여 연속 출석(streak)을 갱신합니다.
    """
    client = get_gemini_client()

    system_prompt = (
        "당신은 친절한 AI 습관 튜터입니다. "
        "사용자의 질문에 친절히 답변한 뒤, "
        "답변 끝에 사용자가 AI 활용 능력을 키울 수 있는 '오늘의 심화 질문 팁 1개'를 꼭 덧붙여주세요."
    )

    try:
        # Gemini 모델 비동기 호출 (현재 가장 안정적인 3.7 / 3.5 Flash 우선 적용)
        models_to_try = [
            "gemini-3.7-flash",
            "gemini-3.5-flash",
            "gemini-3.8-flash",
            "gemini-flash-latest",
        ]
        response = None
        last_error = None

        for model_name in models_to_try:
            try:
                response = await client.aio.models.generate_content(
                    model=model_name,
                    contents=request.user_question,
                    config=types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        response_mime_type="application/json",
                        response_schema=TutorContent,
                        temperature=0.7,
                    ),
                )
                if response:
                    break
            except Exception as me:
                print(f"[Gemini Call Warning] {model_name} 실패: {me}")
                last_error = me
                continue

        if response is None:
            raise last_error

        # 파싱된 결과 추출
        parsed_result: Optional[TutorContent] = response.parsed

        # fallback: 만약 parsed 속성이 없는 경우 text에서 JSON 파싱
        if parsed_result is None:
            raw_data = json.loads(response.text)
            parsed_result = TutorContent(**raw_data)

        # SQLite 데이터베이스에 질문/답변 저장 및 연속 출석(streak) 갱신
        streak_data = database.record_activity_and_update_streak(
            user_id=request.user_id,
            question=request.user_question,
            answer=parsed_result.answer,
        )

        return AskResponse(
            user_id=request.user_id,
            answer=parsed_result.answer,
            deep_dive_tip=parsed_result.deep_dive_tip,
            streak_count=streak_data["streak_count"],
            is_first_today=streak_data["is_first_today"],
            attended_today=streak_data["attended_today"],
        )

    except json.JSONDecodeError as jde:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gemini 응답 JSON 파싱 실패: {str(jde)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gemini API 호출 중 오류 발생: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn

 
