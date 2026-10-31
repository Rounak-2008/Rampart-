from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.database import get_db
from app.models import APIResponse, PullRequestResponse, PullRequestDetailResponse
from app.services.pattern_service import analyze_pull_request
import sqlite3

router = APIRouter(prefix="/api/pull-requests", tags=["Pull Requests"])

@router.get("", response_model=APIResponse)
def list_pull_requests(
    repo_id: Optional[int] = Query(None, description="Filter by repository ID"),
    risk_level: Optional[str] = Query(None, description="Filter by risk level: LOW, MEDIUM, HIGH, UNKNOWN"),
    state: Optional[str] = Query(None, description="Filter by state: open, closed, merged")
):
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT pr.*, 
                   r.full_name as repo_full_name,
                   c.username as contributor_username,
                   c.avatar_url as contributor_avatar_url,
                   c.trust_score as contributor_trust_score,
                   c.status as contributor_status
            FROM pull_requests pr
            JOIN repositories r ON pr.repo_id = r.id
            JOIN contributors c ON pr.contributor_id = c.id
            WHERE 1=1
        """
        params = []
        if repo_id:
            query += " AND pr.repo_id = ?"
            params.append(repo_id)
        if risk_level:
            query += " AND pr.risk_level = ?"
            params.append(risk_level.upper())
        if state:
            query += " AND pr.state = ?"
            params.append(state.lower())

        query += " ORDER BY pr.created_at DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        data = [
            PullRequestResponse(
                id=r["id"],
                github_pr_id=r["github_pr_id"],
                repo_id=r["repo_id"],
                repo_full_name=r["repo_full_name"],
                contributor_id=r["contributor_id"],
                contributor_username=r["contributor_username"],
                contributor_avatar_url=r["contributor_avatar_url"],
                contributor_trust_score=r["contributor_trust_score"],
                contributor_status=r["contributor_status"],
                pr_number=r["pr_number"],
                title=r["title"],
                body=r["body"],
                html_url=r["html_url"],
                diff_url=r["diff_url"],
                state=r["state"],
                risk_level=r["risk_level"],
                analysis_summary=r["analysis_summary"],
                files_changed=r["files_changed"],
                additions=r["additions"],
                deletions=r["deletions"],
                created_at=r["created_at"],
                updated_at=r["updated_at"]
            ).model_dump()
            for r in rows
        ]
        return APIResponse(success=True, data=data)

@router.get("/{pr_id}", response_model=APIResponse)
def get_pull_request(pr_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT pr.*, 
                   r.full_name as repo_full_name,
                   c.username as contributor_username,
                   c.avatar_url as contributor_avatar_url,
                   c.trust_score as contributor_trust_score,
                   c.status as contributor_status,
                   c.vouches_count as contributor_vouches,
                   c.denounces_count as contributor_denounces
            FROM pull_requests pr
            JOIN repositories r ON pr.repo_id = r.id
            JOIN contributors c ON pr.contributor_id = c.id
            WHERE pr.id = ?
        """, (pr_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Pull request not found.")

        # Get active alerts for this PR
        cursor.execute("""
            SELECT * FROM alerts WHERE pr_id = ? ORDER BY created_at DESC
        """, (pr_id,))
        alerts = [dict(a) for a in cursor.fetchall()]

        data = PullRequestDetailResponse(
            id=row["id"],
            github_pr_id=row["github_pr_id"],
            repo_id=row["repo_id"],
            repo_full_name=row["repo_full_name"],
            contributor_id=row["contributor_id"],
            contributor_username=row["contributor_username"],
            contributor_avatar_url=row["contributor_avatar_url"],
            contributor_trust_score=row["contributor_trust_score"],
            contributor_status=row["contributor_status"],
            pr_number=row["pr_number"],
            title=row["title"],
            body=row["body"],
            html_url=row["html_url"],
            diff_url=row["diff_url"],
            state=row["state"],
            risk_level=row["risk_level"],
            analysis_summary=row["analysis_summary"],
            files_changed=row["files_changed"],
            additions=row["additions"],
            deletions=row["deletions"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            contributor_vouches=row["contributor_vouches"],
            contributor_denounces=row["contributor_denounces"],
            active_alerts=alerts
        )
        return APIResponse(success=True, data=data.model_dump())

@router.post("/{pr_id}/analyze", response_model=APIResponse)
def run_pr_analysis(pr_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM pull_requests WHERE id = ?", (pr_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Pull request not found.")

        result = analyze_pull_request(conn, pr_id)
        return APIResponse(success=True, data=result, message="Pull request analyzed successfully.")
