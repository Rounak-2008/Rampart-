from fastapi import APIRouter, HTTPException, Query
from app.database import get_db
from app.models import APIResponse, AlertResponse, AlertResolveRequest
from typing import Optional
from datetime import datetime, timezone
import sqlite3

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])

def normalize_severity(sev: Optional[str]) -> Optional[list]:
    if not sev:
        return None
    s = sev.upper().strip()
    if s in ("CRITICAL", "HIGH"):
        return ["CRITICAL", "HIGH"]
    if s in ("WARNING", "MEDIUM"):
        return ["WARNING", "MEDIUM"]
    if s in ("INFO", "LOW"):
        return ["INFO", "LOW"]
    return [s]

@router.get("", response_model=APIResponse)
def list_alerts(
    repo_id: Optional[int] = Query(None),
    severity: Optional[str] = Query(None, description="CRITICAL/HIGH, WARNING/MEDIUM, INFO/LOW"),
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

        sev_list = normalize_severity(severity)
        if sev_list:
            placeholders = ",".join("?" * len(sev_list))
            query += f" AND UPPER(a.severity) IN ({placeholders})"
            params.extend(sev_list)

        if is_resolved is not None:
            query += " AND a.is_resolved = ?"
            params.append(1 if is_resolved else 0)

        query += " ORDER BY a.is_resolved ASC, a.created_at DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        data = [
            AlertResponse(
                id=r["id"],
                repo_id=r["repo_id"],
                repo_full_name=r["repo_full_name"],
                repository=r["repo_full_name"] or "Network-wide",
                pr_id=r["pr_id"],
                pr_number=r["pr_number"],
                pr_title=r["pr_title"],
                contributor_id=r["contributor_id"],
                contributor_username=r["contributor_username"],
                contributor=f"@{r['contributor_username']}",
                type=r["pattern_type"].replace("_", " ").title(),
                severity=r["severity"].lower(),
                pattern_type=r["pattern_type"],
                message=r["message"],
                evidence_details=r["evidence_details"],
                is_resolved=bool(r["is_resolved"]),
                resolved_by=r["resolved_by"],
                resolved_at=r["resolved_at"],
                created_at=r["created_at"],
                date=r["created_at"][:10] if r["created_at"] else "Recent"
            ).model_dump()
            for r in rows
        ]
        return APIResponse(success=True, data=data)

@router.get("/{alert_id}", response_model=APIResponse)
def get_alert(alert_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.*, 
                   r.full_name as repo_full_name,
                   c.username as contributor_username,
                   pr.pr_number,
                   pr.title as pr_title
            FROM alerts a
            LEFT JOIN repositories r ON a.repo_id = r.id
            JOIN contributors c ON a.contributor_id = c.id
            LEFT JOIN pull_requests pr ON a.pr_id = pr.id
            WHERE a.id = ?
        """, (alert_id,))
        r = cursor.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Alert not found.")

        data = AlertResponse(
            id=r["id"],
            repo_id=r["repo_id"],
            repo_full_name=r["repo_full_name"],
            repository=r["repo_full_name"] or "Network-wide",
            pr_id=r["pr_id"],
            pr_number=r["pr_number"],
            pr_title=r["pr_title"],
            contributor_id=r["contributor_id"],
            contributor_username=r["contributor_username"],
            contributor=f"@{r['contributor_username']}",
            type=r["pattern_type"].replace("_", " ").title(),
            severity=r["severity"].lower(),
            pattern_type=r["pattern_type"],
            message=r["message"],
            evidence_details=r["evidence_details"],
            is_resolved=bool(r["is_resolved"]),
            resolved_by=r["resolved_by"],
            resolved_at=r["resolved_at"],
            created_at=r["created_at"],
            date=r["created_at"][:10] if r["created_at"] else "Recent"
        ).model_dump()
        return APIResponse(success=True, data=data)

@router.patch("/{alert_id}/resolve", response_model=APIResponse)
def resolve_alert(alert_id: int, payload: AlertResolveRequest = None):
    resolved_by = payload.resolved_by if payload and payload.resolved_by else "Rounak-2008"
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

        # Add notification about resolved alert
        cursor.execute("""
            INSERT INTO notifications (type, title, message, link_url, is_read, created_at)
            VALUES ('ALERT', ?, ?, '/alerts', 0, ?)
        """, (
            f"Alert #{alert_id} Resolved",
            f"Alert #{alert_id} was acknowledged and resolved by {resolved_by}.",
            now
        ))

        return APIResponse(success=True, message=f"Alert #{alert_id} resolved by {resolved_by}.")
