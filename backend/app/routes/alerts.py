from fastapi import APIRouter, HTTPException, Query
from app.database import get_db
from app.models import APIResponse, AlertResponse, AlertResolveRequest
from typing import Optional
from datetime import datetime, timezone
import sqlite3

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])

@router.get("", response_model=APIResponse)
def list_alerts(
    repo_id: Optional[int] = Query(None),
    severity: Optional[str] = Query(None, description="INFO, WARNING, CRITICAL"),
    is_resolved: Optional[bool] = Query(None)
):
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT a.*, 
                   r.full_name as repo_full_name,
                   c.username as contributor_username,
                   pr.pr_number,
                   pr.title as pr_title
            FROM alerts a
            LEFT JOIN repositories r ON a.repo_id = r.id
            JOIN contributors c ON a.contributor_id = c.id
            LEFT JOIN pull_requests pr ON a.pr_id = pr.id
            WHERE 1=1
        """
        params = []
        if repo_id is not None:
            query += " AND a.repo_id = ?"
            params.append(repo_id)
        if severity:
            query += " AND a.severity = ?"
            params.append(severity.upper())
        if is_resolved is not None:
            query += " AND a.is_resolved = ?"
            params.append(1 if is_resolved else 0)

        query += " ORDER BY a.created_at DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        data = [
            AlertResponse(
                id=r["id"],
                repo_id=r["repo_id"],
                repo_full_name=r["repo_full_name"],
                pr_id=r["pr_id"],
                pr_number=r["pr_number"],
                pr_title=r["pr_title"],
                contributor_id=r["contributor_id"],
                contributor_username=r["contributor_username"],
                severity=r["severity"],
                pattern_type=r["pattern_type"],
                message=r["message"],
                evidence_details=r["evidence_details"],
                is_resolved=bool(r["is_resolved"]),
                resolved_by=r["resolved_by"],
                resolved_at=r["resolved_at"],
                created_at=r["created_at"]
            ).model_dump()
            for r in rows
        ]
        return APIResponse(success=True, data=data)

@router.patch("/{alert_id}/resolve", response_model=APIResponse)
def resolve_alert(alert_id: int, payload: AlertResolveRequest = None):
    resolved_by = payload.resolved_by if payload and payload.resolved_by else "maintainer"
    now = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM alerts WHERE id = ?", (alert_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Alert not found.")

        cursor.execute("""
            UPDATE alerts 
            SET is_resolved = 1, resolved_by = ?, resolved_at = ?
            WHERE id = ?
        """, (resolved_by, now, alert_id))

        return APIResponse(success=True, message=f"Alert #{alert_id} resolved by {resolved_by}.")
