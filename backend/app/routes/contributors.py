from fastapi import APIRouter, HTTPException, Query
from app.database import get_db
from app.models import APIResponse, ContributorResponse, ContributorDetailResponse, ContributorHistoryItem
from typing import Optional
import sqlite3

router = APIRouter(prefix="/api/contributors", tags=["Contributors"])

@router.get("", response_model=APIResponse)
def list_contributors(
    status: Optional[str] = Query(None, description="Filter by status: NEW, TRUSTED, FLAGGED, NEUTRAL, MIXED")
):
    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM contributors WHERE 1=1"
        params = []
        if status:
            query += " AND status = ?"
            params.append(status.upper())
        query += " ORDER BY trust_score DESC, total_prs DESC"

        cursor.execute(query, params)
        rows = cursor.fetchall()
        data = [
            ContributorResponse(
                id=c["id"],
                github_id=c["github_id"],
                username=c["username"],
                avatar_url=c["avatar_url"],
                profile_url=c["profile_url"],
                trust_score=c["trust_score"],
                status=c["status"],
                total_prs=c["total_prs"],
                vouches_count=c["vouches_count"],
                denounces_count=c["denounces_count"],
                first_seen_at=c["first_seen_at"],
                last_active_at=c["last_active_at"]
            ).model_dump()
            for c in rows
        ]
        return APIResponse(success=True, data=data)

@router.get("/{username}", response_model=APIResponse)
def get_contributor(username: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM contributors WHERE username = ?", (username,))
        c = cursor.fetchone()
        if not c:
            raise HTTPException(status_code=404, detail=f"Contributor '{username}' not found.")

        contributor_id = c["id"]

        # Recent PRs
        cursor.execute("""
            SELECT pr.id as pr_id, r.full_name as repo_full_name, pr.pr_number, pr.title, pr.state, pr.risk_level, pr.created_at
            FROM pull_requests pr
            JOIN repositories r ON pr.repo_id = r.id
            WHERE pr.contributor_id = ?
            ORDER BY pr.created_at DESC LIMIT 10
        """, (contributor_id,))
        prs = [
            ContributorHistoryItem(
                pr_id=row["pr_id"],
                repo_full_name=row["repo_full_name"],
                pr_number=row["pr_number"],
                title=row["title"],
                state=row["state"],
                risk_level=row["risk_level"],
                created_at=row["created_at"]
            ).model_dump()
            for row in cursor.fetchall()
        ]

        # Trust Records
        cursor.execute("""
            SELECT tr.*, r.full_name as repo_full_name
            FROM trust_records tr
            LEFT JOIN repositories r ON tr.repo_id = r.id
            WHERE tr.contributor_id = ?
            ORDER BY tr.created_at DESC
        """, (contributor_id,))
        records = [dict(r) for r in cursor.fetchall()]

        data = ContributorDetailResponse(
            id=c["id"],
            github_id=c["github_id"],
            username=c["username"],
            avatar_url=c["avatar_url"],
            profile_url=c["profile_url"],
            trust_score=c["trust_score"],
            status=c["status"],
            total_prs=c["total_prs"],
            vouches_count=c["vouches_count"],
            denounces_count=c["denounces_count"],
            first_seen_at=c["first_seen_at"],
            last_active_at=c["last_active_at"],
            recent_prs=prs,
            trust_records=records
        )
        return APIResponse(success=True, data=data.model_dump())

@router.get("/{username}/history", response_model=APIResponse)
def get_contributor_history(username: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM contributors WHERE username = ?", (username,))
        c = cursor.fetchone()
        if not c:
            raise HTTPException(status_code=404, detail=f"Contributor '{username}' not found.")

        cursor.execute("""
            SELECT pr.id as pr_id, r.full_name as repo_full_name, pr.pr_number, pr.title, pr.state, pr.risk_level, pr.created_at
            FROM pull_requests pr
            JOIN repositories r ON pr.repo_id = r.id
            WHERE pr.contributor_id = ?
            ORDER BY pr.created_at DESC
        """, (c["id"],))
        history = [
            ContributorHistoryItem(
                pr_id=row["pr_id"],
                repo_full_name=row["repo_full_name"],
                pr_number=row["pr_number"],
                title=row["title"],
                state=row["state"],
                risk_level=row["risk_level"],
                created_at=row["created_at"]
            ).model_dump()
            for row in cursor.fetchall()
        ]
        return APIResponse(success=True, data=history)
