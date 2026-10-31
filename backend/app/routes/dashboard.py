from fastapi import APIRouter, Depends
from app.database import get_db
from app.models import APIResponse, DashboardStatsResponse, ActivityItem, DashboardActivityResponse
import sqlite3

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

@router.get("/stats", response_model=APIResponse)
def get_dashboard_stats():
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as cnt FROM repositories WHERE is_active = 1")
        total_repos = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM pull_requests WHERE state = 'open'")
        active_prs = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM contributors")
        total_contributors = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM alerts WHERE is_resolved = 0")
        active_alerts = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM trust_records WHERE type = 'VOUCH'")
        total_vouches = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM trust_records WHERE type = 'DENOUNCE'")
        total_denounces = cursor.fetchone()["cnt"]

        cursor.execute("SELECT AVG(trust_score) as avg_score FROM contributors")
        avg_score_row = cursor.fetchone()
        network_health = round(avg_score_row["avg_score"] or 50.0, 1)

        data = DashboardStatsResponse(
            total_repositories=total_repos,
            active_pull_requests=active_prs,
            analyzed_contributors=total_contributors,
            active_alerts=active_alerts,
            total_vouches=total_vouches,
            total_denouncements=total_denounces,
            network_health_score=network_health
        )
        return APIResponse(success=True, data=data.model_dump())

@router.get("/activity", response_model=APIResponse)
def get_dashboard_activity():
    with get_db() as conn:
        cursor = conn.cursor()
        activities = []

        # Recent PRs
        cursor.execute("""
            SELECT pr.id, pr.pr_number, pr.title, pr.risk_level, pr.created_at, r.full_name as repo_name, c.username
            FROM pull_requests pr
            JOIN repositories r ON pr.repo_id = r.id
            JOIN contributors c ON pr.contributor_id = c.id
            ORDER BY pr.created_at DESC LIMIT 5
        """)
        for row in cursor.fetchall():
            activities.append(ActivityItem(
                id=row["id"],
                type="PR",
                title=f"PR #{row['pr_number']}: {row['title']}",
                subtitle=f"by {row['username']} in {row['repo_name']}",
                timestamp=row["created_at"],
                severity=row["risk_level"],
                link=f"/pull-requests/{row['id']}"
            ))

        # Recent Trust Records
        cursor.execute("""
            SELECT tr.id, tr.type, tr.category, tr.reason, tr.created_at, c.username, r.full_name as repo_name
            FROM trust_records tr
            JOIN contributors c ON tr.contributor_id = c.id
            LEFT JOIN repositories r ON tr.repo_id = r.id
            ORDER BY tr.created_at DESC LIMIT 5
        """)
        for row in cursor.fetchall():
            activities.append(ActivityItem(
                id=row["id"],
                type=row["type"],
                title=f"{row['type']}: {row['username']} ({row['category']})",
                subtitle=row["reason"][:80] + ("..." if len(row["reason"]) > 80 else ""),
                timestamp=row["created_at"],
                severity="LOW" if row["type"] == "VOUCH" else "HIGH",
                link=f"/contributors/{row['username']}"
            ))

        # Recent Alerts
        cursor.execute("""
            SELECT a.id, a.severity, a.pattern_type, a.message, a.created_at, r.full_name as repo_name
            FROM alerts a
            LEFT JOIN repositories r ON a.repo_id = r.id
            WHERE a.is_resolved = 0
            ORDER BY a.created_at DESC LIMIT 5
        """)
        for row in cursor.fetchall():
            activities.append(ActivityItem(
                id=row["id"],
                type="ALERT",
                title=f"Alert: {row['pattern_type']}",
                subtitle=f"[{row['repo_name'] or 'Network'}] {row['message']}",
                timestamp=row["created_at"],
                severity=row["severity"],
                link="/alerts"
            ))

        # Sort all combined by timestamp desc
        activities.sort(key=lambda x: x.timestamp, reverse=True)
        return APIResponse(success=True, data=[a.model_dump() for a in activities[:12]])
