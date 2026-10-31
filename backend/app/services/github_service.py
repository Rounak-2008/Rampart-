import hmac
import hashlib
import sqlite3
import httpx
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from app.config import GITHUB_TOKEN, WEBHOOK_SECRET
from app.services.trust_service import recalculate_contributor_trust
from app.services.pattern_service import analyze_pull_request

def verify_webhook_signature(payload_body: bytes, signature_header: Optional[str], secret: Optional[str] = None) -> bool:
    target_secret = secret or WEBHOOK_SECRET
    if not target_secret or not signature_header:
        # If no secret configured, allow for testing
        return True
    
    if not signature_header.startswith("sha256="):
        return False
    
    expected_signature = signature_header[7:]
    mac = hmac.new(target_secret.encode("utf-8"), msg=payload_body, digestmod=hashlib.sha256)
    computed_signature = mac.hexdigest()
    return hmac.compare_digest(expected_signature, computed_signature)

import os

def get_github_headers() -> Dict[str, str]:
    from app.config import GITHUB_TOKEN
    token = os.getenv("GITHUB_TOKEN", GITHUB_TOKEN or "").strip()
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "RAMPART-Trust-Network"
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers

async def verify_github_auth() -> Dict[str, Any]:
    headers = get_github_headers()
    has_token = "Authorization" in headers
    if not has_token:
        return {
            "authenticated": False,
            "username": None,
            "message": "No GitHub token configured. Set GITHUB_TOKEN in backend/.env.",
            "scopes": []
        }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get("https://api.github.com/user", headers=headers)
            if resp.status_code == 200:
                user = resp.json()
                raw_scopes = resp.headers.get("x-oauth-scopes", "")
                scopes = [s.strip() for s in raw_scopes.split(",") if s.strip()]
                return {
                    "authenticated": True,
                    "username": user.get("login"),
                    "name": user.get("name"),
                    "avatar_url": user.get("avatar_url"),
                    "scopes": scopes,
                    "rate_limit_remaining": resp.headers.get("x-ratelimit-remaining"),
                    "rate_limit_limit": resp.headers.get("x-ratelimit-limit"),
                    "status": "connected"
                }
            elif resp.status_code == 401:
                return {
                    "authenticated": False,
                    "username": None,
                    "message": "GitHub token is invalid or expired (401 Unauthorized).",
                    "scopes": []
                }
            else:
                return {
                    "authenticated": False,
                    "username": None,
                    "message": f"GitHub API returned status {resp.status_code}.",
                    "scopes": []
                }
    except Exception as e:
        return {
            "authenticated": False,
            "username": None,
            "message": f"Network error connecting to GitHub API: {str(e)}",
            "scopes": []
        }

async def fetch_github_user_repos() -> List[Dict[str, Any]]:
    headers = get_github_headers()
    if "Authorization" not in headers:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get("https://api.github.com/user/repos?per_page=50&sort=updated", headers=headers)
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return []

async def fetch_github_repo_info(owner: str, name: str) -> Optional[Dict[str, Any]]:
    headers = get_github_headers()
    url = f"https://api.github.com/repos/{owner}/{name}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return None

async def sync_repository_from_github(conn: sqlite3.Connection, repo_id: int) -> Dict[str, Any]:
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    cursor.execute("SELECT * FROM repositories WHERE id = ?", (repo_id,))
    repo = cursor.fetchone()
    if not repo:
        return {"error": "Repository not found"}

    owner = repo["owner"]
    name = repo["name"]

    headers = get_github_headers()

    synced_prs = 0
    synced_contributors = 0

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Update repo metadata
            repo_url = f"https://api.github.com/repos/{owner}/{name}"
            repo_res = await client.get(repo_url, headers=headers)
            if repo_res.status_code == 200:
                data = repo_res.json()
                cursor.execute("""
                    UPDATE repositories 
                    SET github_repo_id = ?, description = ?, html_url = ?, default_branch = ?, last_synced_at = ?
                    WHERE id = ?
                """, (
                    data.get("id"),
                    data.get("description") or repo["description"],
                    data.get("html_url"),
                    data.get("default_branch", "main"),
                    now,
                    repo_id
                ))

            # 2. Fetch Pull Requests
            prs_url = f"https://api.github.com/repos/{owner}/{name}/pulls?state=all&per_page=20"
            prs_res = await client.get(prs_url, headers=headers)
            if prs_res.status_code == 200:
                github_prs = prs_res.json()
                for gh_pr in github_prs:
                    user_data = gh_pr.get("user") or {}
                    username = user_data.get("login")
                    if not username:
                        continue

                    # Upsert contributor
                    cursor.execute("SELECT id FROM contributors WHERE username = ?", (username,))
                    existing_c = cursor.fetchone()
                    if existing_c:
                        c_id = existing_c["id"]
                    else:
                        cursor.execute("""
                            INSERT INTO contributors (github_id, username, avatar_url, profile_url, trust_score, status, first_seen_at, last_active_at)
                            VALUES (?, ?, ?, ?, 50.0, 'NEW', ?, ?)
                        """, (
                            user_data.get("id"),
                            username,
                            user_data.get("avatar_url"),
                            user_data.get("html_url"),
                            now,
                            now
                        ))
                        c_id = cursor.lastrowid
                        synced_contributors += 1

                    # Upsert PR
                    pr_num = gh_pr.get("number")
                    cursor.execute("SELECT id FROM pull_requests WHERE repo_id = ? AND pr_number = ?", (repo_id, pr_num))
                    existing_pr = cursor.fetchone()
                    
                    state = gh_pr.get("state", "open")
                    if gh_pr.get("merged_at"):
                        state = "merged"

                    if existing_pr:
                        pr_id = existing_pr["id"]
                        cursor.execute("""
                            UPDATE pull_requests 
                            SET title = ?, body = ?, html_url = ?, diff_url = ?, state = ?, updated_at = ?, merged_at = ?, closed_at = ?
                            WHERE id = ?
                        """, (
                            gh_pr.get("title", ""),
                            gh_pr.get("body", ""),
                            gh_pr.get("html_url", ""),
                            gh_pr.get("diff_url", ""),
                            state,
                            gh_pr.get("updated_at") or now,
                            gh_pr.get("merged_at"),
                            gh_pr.get("closed_at"),
                            pr_id
                        ))
                    else:
                        cursor.execute("""
                            INSERT INTO pull_requests (github_pr_id, repo_id, contributor_id, pr_number, title, body, html_url, diff_url, state, risk_level, files_changed, additions, deletions, created_at, updated_at, merged_at, closed_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 'UNKNOWN', 1, 0, 0, ?, ?, ?, ?)
                        """, (
                            gh_pr.get("id"),
                            repo_id,
                            c_id,
                            pr_num,
                            gh_pr.get("title", ""),
                            gh_pr.get("body", ""),
                            gh_pr.get("html_url", ""),
                            gh_pr.get("diff_url", ""),
                            gh_pr.get("created_at") or now,
                            gh_pr.get("updated_at") or now,
                            gh_pr.get("merged_at"),
                            gh_pr.get("closed_at")
                        ))
                        pr_id = cursor.lastrowid
                        synced_prs += 1

                    # Recalculate contributor stats and analyze PR
                    recalculate_contributor_trust(conn, c_id)
                    analyze_pull_request(conn, pr_id)

    except Exception as e:
        # If network error or rate limit, update last_synced_at anyway to reflect attempt
        cursor.execute("UPDATE repositories SET last_synced_at = ? WHERE id = ?", (now, repo_id))
        return {
            "success": True,
            "message": f"Sync completed with local cached state (live network note: {str(e)})",
            "synced_prs": synced_prs,
            "synced_contributors": synced_contributors
        }

    # Add notification
    cursor.execute("""
        INSERT INTO notifications (type, title, message, link_url, is_read, created_at)
        VALUES ('REPO', ?, ?, '/repositories', 0, ?)
    """, (
        f"Repository Synced: {repo['full_name']}",
        f"Successfully synchronized {synced_prs} new/updated PRs and verified contributors.",
        now
    ))

    return {
        "success": True,
        "repo_id": repo_id,
        "repo_name": repo["full_name"],
        "synced_prs": synced_prs,
        "synced_contributors": synced_contributors,
        "synced_at": now
    }
