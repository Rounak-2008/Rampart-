from fastapi import APIRouter, HTTPException, Query
from app.database import get_db
from app.models import APIResponse, VouchCreate, DenounceCreate, TrustRecordResponse, NetworkGraphResponse
from app.services.trust_service import recalculate_contributor_trust, build_network_graph
from datetime import datetime, timezone
from typing import Optional
import sqlite3

router = APIRouter(prefix="/api/trust", tags=["Trust System"])

@router.post("/vouch", response_model=APIResponse)
def submit_vouch(payload: VouchCreate):
    username = payload.contributor_username.strip()
    now = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        cursor = conn.cursor()

        # Find or create contributor
        cursor.execute("SELECT id FROM contributors WHERE username = ?", (username,))
        c = cursor.fetchone()
        if not c:
            cursor.execute("""
                INSERT INTO contributors (username, avatar_url, profile_url, trust_score, status, first_seen_at, last_active_at)
                VALUES (?, ?, ?, 50.0, 'NEW', ?, ?)
            """, (username, f"https://github.com/{username}.png", f"https://github.com/{username}", now, now))
            contributor_id = cursor.lastrowid
        else:
            contributor_id = c["id"]

        # Validate repo_id foreign key if supplied
        repo_id = payload.repo_id
        if repo_id:
            cursor.execute("SELECT id FROM repositories WHERE id = ?", (repo_id,))
            if not cursor.fetchone():
                cursor.execute("SELECT id FROM repositories LIMIT 1")
                first_repo = cursor.fetchone()
                repo_id = first_repo["id"] if first_repo else None

        # Insert Vouch record
        cursor.execute("""
            INSERT INTO trust_records (contributor_id, repo_id, author_username, type, category, reason, evidence_url, created_at)
            VALUES (?, ?, ?, 'VOUCH', ?, ?, ?, ?)
        """, (contributor_id, repo_id, payload.author_username, payload.category, payload.reason, payload.evidence_url, now))
        record_id = cursor.lastrowid

        # Recalculate contributor trust
        updated_stats = recalculate_contributor_trust(conn, contributor_id)

        # Notification
        cursor.execute("""
            INSERT INTO notifications (type, title, message, link_url, is_read, created_at)
            VALUES ('VOUCH', ?, ?, ?, 0, ?)
        """, (
            f"Vouch Recorded for {username}",
            f"{payload.author_username} vouched for {username}: '{payload.reason[:60]}...'",
            f"/contributors/{username}",
            now
        ))

        return APIResponse(
            success=True,
            data={"record_id": record_id, "contributor": updated_stats},
            message=f"Successfully recorded Vouch for '{username}'."
        )

@router.post("/denounce", response_model=APIResponse)
def submit_denounce(payload: DenounceCreate):
    username = payload.contributor_username.strip()
    now = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        cursor = conn.cursor()

        # Find or create contributor
        cursor.execute("SELECT id FROM contributors WHERE username = ?", (username,))
        c = cursor.fetchone()
        if not c:
            cursor.execute("""
                INSERT INTO contributors (username, avatar_url, profile_url, trust_score, status, first_seen_at, last_active_at)
                VALUES (?, ?, ?, 50.0, 'NEW', ?, ?)
            """, (username, f"https://github.com/{username}.png", f"https://github.com/{username}", now, now))
            contributor_id = cursor.lastrowid
        else:
            contributor_id = c["id"]

        # Validate repo_id foreign key if supplied
        repo_id = payload.repo_id
        if repo_id:
            cursor.execute("SELECT id FROM repositories WHERE id = ?", (repo_id,))
            if not cursor.fetchone():
                cursor.execute("SELECT id FROM repositories LIMIT 1")
                first_repo = cursor.fetchone()
                repo_id = first_repo["id"] if first_repo else None

        # Insert Denounce record
        cursor.execute("""
            INSERT INTO trust_records (contributor_id, repo_id, author_username, type, category, reason, evidence_url, created_at)
            VALUES (?, ?, ?, 'DENOUNCE', ?, ?, ?, ?)
        """, (contributor_id, repo_id, payload.author_username, payload.category, payload.reason, payload.evidence_url, now))
        record_id = cursor.lastrowid

        # Recalculate contributor trust
        updated_stats = recalculate_contributor_trust(conn, contributor_id)

        # Generate critical alert for any open PRs from this contributor
        cursor.execute("""
            SELECT id, repo_id, pr_number FROM pull_requests 
            WHERE contributor_id = ? AND state = 'open'
        """, (contributor_id,))
        open_prs = cursor.fetchall()
        for pr in open_prs:
            cursor.execute("""
                INSERT INTO alerts (repo_id, pr_id, contributor_id, severity, pattern_type, message, evidence_details, is_resolved, created_at)
                VALUES (?, ?, ?, 'CRITICAL', 'CROSS_REPO_SPAM_HISTORY', ?, ?, 0, ?)
            """, (
                pr["repo_id"],
                pr["id"],
                contributor_id,
                f"Contributor '{username}' has been denounced with verified evidence: {payload.reason[:100]}",
                f"Evidence: {payload.evidence_url}",
                now
            ))
            cursor.execute("UPDATE pull_requests SET risk_level = 'HIGH' WHERE id = ?", (pr["id"],))

        # Notification
        cursor.execute("""
            INSERT INTO notifications (type, title, message, link_url, is_read, created_at)
            VALUES ('ALERT', ?, ?, ?, 0, ?)
        """, (
            f"Denouncement Logged for {username}",
            f"{payload.author_username} denounced {username} ({payload.category}). Active PR alerts generated.",
            f"/contributors/{username}",
            now
        ))

        return APIResponse(
            success=True,
            data={"record_id": record_id, "contributor": updated_stats, "affected_open_prs": len(open_prs)},
            message=f"Successfully recorded Denouncement for '{username}'."
        )

@router.get("/records", response_model=APIResponse)
def list_trust_records(
    contributor_username: Optional[str] = Query(None),
    repo_id: Optional[int] = Query(None),
    type: Optional[str] = Query(None, description="VOUCH or DENOUNCE")
):
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT tr.*, c.username as contributor_username, r.full_name as repo_full_name
            FROM trust_records tr
            JOIN contributors c ON tr.contributor_id = c.id
            LEFT JOIN repositories r ON tr.repo_id = r.id
            WHERE 1=1
        """
        params = []
        if contributor_username:
            query += " AND c.username = ?"
            params.append(contributor_username)
        if repo_id:
            query += " AND tr.repo_id = ?"
            params.append(repo_id)
        if type:
            query += " AND tr.type = ?"
            params.append(type.upper())

        query += " ORDER BY tr.created_at DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        data = [
            TrustRecordResponse(
                id=r["id"],
                contributor_id=r["contributor_id"],
                contributor_username=r["contributor_username"],
                repo_id=r["repo_id"],
                repo_full_name=r["repo_full_name"],
                author_username=r["author_username"],
                type=r["type"],
                category=r["category"],
                reason=r["reason"],
                evidence_url=r["evidence_url"],
                created_at=r["created_at"]
            ).model_dump()
            for r in rows
        ]
        return APIResponse(success=True, data=data)

@router.get("/network-graph", response_model=APIResponse)
def get_network_graph():
    with get_db() as conn:
        graph = build_network_graph(conn)
        return APIResponse(success=True, data=graph.model_dump())
