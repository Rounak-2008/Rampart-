from fastapi import APIRouter, HTTPException, Depends
from app.database import get_db
from app.models import APIResponse, RepositoryCreate, RepositoryResponse
from app.services.github_service import fetch_github_repo_info, sync_repository_from_github
from datetime import datetime, timezone
import sqlite3

router = APIRouter(prefix="/api/repositories", tags=["Repositories"])

@router.get("", response_model=APIResponse)
def list_repositories():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                r.*,
                (SELECT COUNT(*) FROM pull_requests pr WHERE pr.repo_id = r.id AND pr.state = 'open') as open_prs_count,
                (SELECT COUNT(*) FROM alerts a WHERE a.repo_id = r.id AND a.is_resolved = 0) as alerts_count,
                (SELECT COUNT(DISTINCT contributor_id) FROM pull_requests pr WHERE pr.repo_id = r.id) as contributor_count
            FROM repositories r
            ORDER BY r.created_at DESC
        """)
        rows = cursor.fetchall()
        data = [
            RepositoryResponse(
                id=r["id"],
                github_repo_id=r["github_repo_id"],
                owner=r["owner"],
                name=r["name"],
                full_name=r["full_name"],
                description=r["description"],
                html_url=r["html_url"],
                default_branch=r["default_branch"],
                is_active=bool(r["is_active"]),
                status="active" if r["is_active"] else "inactive",
                last_synced_at=r["last_synced_at"],
                last_sync=r["last_synced_at"],
                created_at=r["created_at"],
                open_prs=r["open_prs_count"],
                open_prs_count=r["open_prs_count"],
                alerts_count=r["alerts_count"],
                alert_count=r["alerts_count"],
                contributor_count=r["contributor_count"],
                prs=r["open_prs_count"]
            ).model_dump()
            for r in rows
        ]
        return APIResponse(success=True, data=data)

@router.post("", response_model=APIResponse)
async def connect_repository(payload: RepositoryCreate):
    # Support both full_name ("owner/repo") and individual owner + repo
    if payload.full_name:
        full_name = payload.full_name.strip()
    elif payload.owner and (payload.repo or payload.name):
        repo_name = payload.repo or payload.name
        full_name = f"{payload.owner.strip()}/{repo_name.strip()}"
    else:
        raise HTTPException(status_code=400, detail="Repository full_name or owner/repo is required.")

    if "/" not in full_name:
        raise HTTPException(status_code=400, detail="Repository must be in 'owner/repo' format.")

    owner, name = full_name.split("/", 1)
    now = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM repositories WHERE full_name = ?", (full_name,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail=f"Repository '{full_name}' is already connected.")

        # Attempt to get GitHub info
        gh_info = await fetch_github_repo_info(owner, name)
        description = payload.description or (gh_info.get("description") if gh_info else "")
        html_url = (gh_info.get("html_url") if gh_info else f"https://github.com/{full_name}")
        github_repo_id = gh_info.get("id") if gh_info else None
        default_branch = (gh_info.get("default_branch") if gh_info else "main")

        cursor.execute("""
            INSERT INTO repositories (github_repo_id, owner, name, full_name, description, html_url, default_branch, is_active, webhook_secret, last_synced_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?)
        """, (github_repo_id, owner, name, full_name, description, html_url, default_branch, payload.webhook_secret, now))
        repo_id = cursor.lastrowid

        # Trigger sync
        await sync_repository_from_github(conn, repo_id)

        # Notification
        cursor.execute("""
            INSERT INTO notifications (type, title, message, link_url, is_read, created_at)
            VALUES ('REPO', ?, ?, '/repositories', 0, ?)
        """, (f"Repository Connected: {full_name}", f"Repository {full_name} has joined the RAMPART trust network.", now))

        cursor.execute("SELECT * FROM repositories WHERE id = ?", (repo_id,))
        repo = cursor.fetchone()
        repo_dict = dict(repo)
        repo_dict["status"] = "active" if repo["is_active"] else "inactive"
        repo_dict["open_prs"] = 0
        repo_dict["alert_count"] = 0
        repo_dict["last_sync"] = repo["last_synced_at"]

        return APIResponse(
            success=True,
            data=repo_dict,
            message=f"Repository '{full_name}' successfully connected to RAMPART."
        )

@router.delete("/{repo_id}", response_model=APIResponse)
def disconnect_repository(repo_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT full_name FROM repositories WHERE id = ?", (repo_id,))
        repo = cursor.fetchone()
        if not repo:
            raise HTTPException(status_code=404, detail="Repository not found.")

        cursor.execute("DELETE FROM repositories WHERE id = ?", (repo_id,))
        return APIResponse(success=True, message=f"Repository '{repo['full_name']}' successfully disconnected.")

@router.post("/{repo_id}/sync", response_model=APIResponse)
async def sync_repository(repo_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM repositories WHERE id = ?", (repo_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Repository not found.")

        result = await sync_repository_from_github(conn, repo_id)
        return APIResponse(success=True, data=result, message="Repository synchronized successfully.")
