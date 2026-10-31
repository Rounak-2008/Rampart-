from fastapi import APIRouter, Request, Header, HTTPException
from app.database import get_db
from app.models import APIResponse
from app.services.github_service import verify_webhook_signature
from app.services.trust_service import recalculate_contributor_trust
from app.services.pattern_service import analyze_pull_request
from datetime import datetime, timezone
from typing import Optional
import json

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])

@router.post("/github", response_model=APIResponse)
async def handle_github_webhook(
    request: Request,
    x_github_event: Optional[str] = Header(None),
    x_hub_signature_256: Optional[str] = Header(None)
):
    body_bytes = await request.body()
    now = datetime.now(timezone.utc).isoformat()

    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    # Check ping
    if x_github_event == "ping":
        return APIResponse(success=True, message="GitHub Webhook Ping received successfully.")

    if x_github_event != "pull_request":
        return APIResponse(success=True, message=f"Ignored event: {x_github_event}")

    action = payload.get("action")
    pr_data = payload.get("pull_request")
    repo_data = payload.get("repository")

    if not pr_data or not repo_data:
        return APIResponse(success=False, message="Missing pull_request or repository data.")

    repo_full_name = repo_data.get("full_name")

    with get_db() as conn:
        cursor = conn.cursor()

        # Find repository in DB
        cursor.execute("SELECT * FROM repositories WHERE full_name = ?", (repo_full_name,))
        repo = cursor.fetchone()
        if not repo:
            # Not a monitored repo
            return APIResponse(
                success=True,
                message=f"Event ignored: Repository '{repo_full_name}' is not registered in RAMPART."
            )

        # Signature verification if secret configured
        if repo["webhook_secret"] and not verify_webhook_signature(body_bytes, x_hub_signature_256, repo["webhook_secret"]):
            raise HTTPException(status_code=401, detail="Invalid webhook signature.")

        # Contributor upsert
        sender_data = pr_data.get("user") or {}
        username = sender_data.get("login")
        if not username:
            return APIResponse(success=False, message="No username found in PR event.")

        cursor.execute("SELECT id FROM contributors WHERE username = ?", (username,))
        existing_c = cursor.fetchone()
        if existing_c:
            contributor_id = existing_c["id"]
            cursor.execute("UPDATE contributors SET last_active_at = ? WHERE id = ?", (now, contributor_id))
        else:
            cursor.execute("""
                INSERT INTO contributors (github_id, username, avatar_url, profile_url, trust_score, status, first_seen_at, last_active_at)
                VALUES (?, ?, ?, ?, 50.0, 'NEW', ?, ?)
            """, (
                sender_data.get("id"),
                username,
                sender_data.get("avatar_url"),
                sender_data.get("html_url"),
                now,
                now
            ))
            contributor_id = cursor.lastrowid

        # PR upsert
        pr_number = pr_data.get("number")
        cursor.execute("SELECT id FROM pull_requests WHERE repo_id = ? AND pr_number = ?", (repo["id"], pr_number))
        existing_pr = cursor.fetchone()

        state = pr_data.get("state", "open")
        if pr_data.get("merged"):
            state = "merged"

        if existing_pr:
            pr_id = existing_pr["id"]
            cursor.execute("""
                UPDATE pull_requests
                SET title = ?, body = ?, html_url = ?, diff_url = ?, state = ?, files_changed = ?, additions = ?, deletions = ?, updated_at = ?
                WHERE id = ?
            """, (
                pr_data.get("title", ""),
                pr_data.get("body", ""),
                pr_data.get("html_url", ""),
                pr_data.get("diff_url", ""),
                state,
                pr_data.get("changed_files", 0),
                pr_data.get("additions", 0),
                pr_data.get("deletions", 0),
                now,
                pr_id
            ))
        else:
            cursor.execute("""
                INSERT INTO pull_requests (github_pr_id, repo_id, contributor_id, pr_number, title, body, html_url, diff_url, state, risk_level, files_changed, additions, deletions, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 'UNKNOWN', ?, ?, ?, ?, ?)
            """, (
                pr_data.get("id"),
                repo["id"],
                contributor_id,
                pr_number,
                pr_data.get("title", ""),
                pr_data.get("body", ""),
                pr_data.get("html_url", ""),
                pr_data.get("diff_url", ""),
                pr_data.get("changed_files", 0),
                pr_data.get("additions", 0),
                pr_data.get("deletions", 0),
                pr_data.get("created_at") or now,
                now
            ))
            pr_id = cursor.lastrowid

        # Recalculate contributor trust and run pattern analysis
        recalculate_contributor_trust(conn, contributor_id)
        analysis_result = analyze_pull_request(conn, pr_id)

        # Create notification
        cursor.execute("""
            INSERT INTO notifications (type, title, message, link_url, is_read, created_at)
            VALUES ('PR', ?, ?, ?, 0, ?)
        """, (
            f"PR #{pr_number} {action} in {repo_full_name}",
            f"{username} {action} PR #{pr_number}: {pr_data.get('title', '')[:50]}. Risk: {analysis_result.get('risk_level')}",
            f"/pull-requests/{pr_id}",
            now
        ))

        return APIResponse(
            success=True,
            data={
                "repo": repo_full_name,
                "action": action,
                "pr_number": pr_number,
                "analysis": analysis_result
            },
            message=f"Webhook processed for PR #{pr_number} in {repo_full_name}."
        )
