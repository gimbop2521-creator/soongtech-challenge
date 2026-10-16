import sqlite3
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

DB_FILE = "challenge.db"


def get_db_connection():
    """데이터베이스 연결 객체 생성 (Row 팩토리 적용)"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """users 및 logs 테이블 초기화"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. users 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            name TEXT,
            streak_count INTEGER DEFAULT 0,
            last_active_date TEXT
        )
    """)

    # 2. logs 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
    """)

    conn.commit()
    conn.close()


def get_user_status(user_id: str) -> Dict[str, Any]:
    """사용자의 현재 출석 상태 및 연속 출석일(streak) 조회"""
    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT user_id, name, streak_count, last_active_date FROM users WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return {
            "user_id": user_id,
            "name": user_id,
            "streak_count": 0,
            "last_active_date": None,
            "attended_today": False,
        }

    last_date = row["last_active_date"]
    streak = row["streak_count"] or 0
    attended_today = (last_date == today)

    # 어제도 오늘도 출석하지 않았다면 현재 연속 일수는 0으로 계산 (다음 출석 시 1일부터 재시작)
    effective_streak = streak
    if last_date and last_date != today and last_date != yesterday:
        effective_streak = 0

    return {
        "user_id": row["user_id"],
        "name": row["name"] or user_id,
        "streak_count": effective_streak,
        "last_active_date": last_date,
        "attended_today": attended_today,
    }


def record_activity_and_update_streak(user_id: str, question: str, answer: str, name: Optional[str] = None) -> Dict[str, Any]:
    """
    질문과 AI 답변을 logs 테이블에 저장하고,
    오늘 첫 질문인 경우 streak_count를 +1 갱신합니다.
    """
    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. logs 테이블에 대화 기록 저장
    cursor.execute(
        "INSERT INTO logs (user_id, question, answer, created_at) VALUES (?, ?, ?, ?)",
        (user_id, question, answer, now_str)
    )

    # 2. 사용자 정보 확인
    cursor.execute("SELECT user_id, name, streak_count, last_active_date FROM users WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()

    display_name = name or user_id
    is_first_today = False

    if row is None:
        # 최초 사용자 등록: 1일차 시작
        new_streak = 1
        is_first_today = True
        cursor.execute(
            "INSERT INTO users (user_id, name, streak_count, last_active_date) VALUES (?, ?, ?, ?)",
            (user_id, display_name, new_streak, today)
        )
    else:
        last_date = row["last_active_date"]
        current_streak = row["streak_count"] or 0

        if last_date == today:
            # 오늘 이미 출석을 완료한 경우: streak 유지
            is_first_today = False
            new_streak = current_streak
        elif last_date == yesterday:
            # 어제 출석하고 오늘 처음 질문한 경우: 연속 출석 +1 증가!
            is_first_today = True
            new_streak = current_streak + 1
            cursor.execute(
                "UPDATE users SET streak_count = ?, last_active_date = ? WHERE user_id = ?",
                (new_streak, today, user_id)
            )
        else:
            # 연속 출석이 끊긴 경우: 1일차로 새로 시작
            is_first_today = True
            new_streak = 1
            cursor.execute(
                "UPDATE users SET streak_count = ?, last_active_date = ? WHERE user_id = ?",
                (new_streak, today, user_id)
            )

    conn.commit()
    conn.close()

    return {
        "user_id": user_id,
        "streak_count": new_streak,
        "is_first_today": is_first_today,
        "attended_today": True,
        "last_active_date": today,
    }
