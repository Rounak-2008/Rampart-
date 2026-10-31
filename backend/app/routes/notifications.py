from fastapi import APIRouter, HTTPException
from app.database import get_db
from app.models import APIResponse, NotificationResponse
import sqlite3

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

@router.get("", response_model=APIResponse)
def list_notifications():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM notifications ORDER BY is_read ASC, created_at DESC LIMIT 30")
        rows = cursor.fetchall()
        data = [
            NotificationResponse(
                id=r["id"],
                type=r["type"],
                title=r["title"],
                message=r["message"],
                link_url=r["link_url"],
                is_read=bool(r["is_read"]),
                created_at=r["created_at"]
            ).model_dump()
            for r in rows
        ]
        return APIResponse(success=True, data=data)

@router.patch("/{notification_id}/read", response_model=APIResponse)
def mark_as_read(notification_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM notifications WHERE id = ?", (notification_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Notification not found.")

        cursor.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (notification_id,))
        return APIResponse(success=True, message=f"Notification #{notification_id} marked as read.")

@router.post("/mark-all-read", response_model=APIResponse)
def mark_all_as_read():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE notifications SET is_read = 1 WHERE is_read = 0")
        return APIResponse(success=True, message="All notifications marked as read.")
