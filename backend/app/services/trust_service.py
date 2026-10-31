import sqlite3
from typing import Dict, Any, List
from datetime import datetime, timezone
from app.models import NetworkGraphNode, NetworkGraphEdge, NetworkGraphResponse

def recalculate_contributor_trust(conn: sqlite3.Connection, contributor_id: int) -> Dict[str, Any]:
    cursor = conn.cursor()

    # Get vouches & denounces
    cursor.execute("""
        SELECT 
            SUM(CASE WHEN type = 'VOUCH' THEN 1 ELSE 0 END) as vouches,
            SUM(CASE WHEN type = 'DENOUNCE' THEN 1 ELSE 0 END) as denounces
        FROM trust_records
        WHERE contributor_id = ?
    """, (contributor_id,))
    rec = cursor.fetchone()
    vouches = (rec["vouches"] or 0) if rec else 0
    denounces = (rec["denounces"] or 0) if rec else 0

    # Get PR counts
    cursor.execute("""
        SELECT 
            COUNT(*) as total_prs,
            SUM(CASE WHEN state = 'merged' THEN 1 ELSE 0 END) as merged_prs
        FROM pull_requests
        WHERE contributor_id = ?
    """, (contributor_id,))
    pr_rec = cursor.fetchone()
    total_prs = (pr_rec["total_prs"] or 0) if pr_rec else 0
    merged_prs = (pr_rec["merged_prs"] or 0) if pr_rec else 0

    # Calculation logic
    # Base: 50.0
    score = 50.0 + (vouches * 18.0) - (denounces * 32.0) + (merged_prs * 3.0)
    score = max(0.0, min(100.0, score))

    if vouches == 0 and denounces == 0:
        if total_prs <= 1:
            status = "NEW"
        else:
            status = "NEUTRAL"
    elif denounces > 0 and vouches == 0:
        status = "FLAGGED"
    elif vouches > 0 and denounces == 0:
        status = "TRUSTED"
    else:
        status = "MIXED"

    cursor.execute("""
        UPDATE contributors 
        SET trust_score = ?, status = ?, vouches_count = ?, denounces_count = ?, total_prs = ?
        WHERE id = ?
    """, (round(score, 1), status, vouches, denounces, total_prs, contributor_id))

    return {
        "contributor_id": contributor_id,
        "trust_score": round(score, 1),
        "status": status,
        "vouches_count": vouches,
        "denounces_count": denounces,
        "total_prs": total_prs
    }

def build_network_graph(conn: sqlite3.Connection) -> NetworkGraphResponse:
    cursor = conn.cursor()
    nodes: List[NetworkGraphNode] = []
    edges: List[NetworkGraphEdge] = []

    # 1. Repositories as Nodes
    cursor.execute("SELECT id, full_name, owner FROM repositories WHERE is_active = 1")
    repos = cursor.fetchall()
    for r in repos:
        nodes.append(NetworkGraphNode(
            id=f"repo_{r['id']}",
            label=r["full_name"],
            type="repository",
            status="active"
        ))

    # 2. Contributors as Nodes
    cursor.execute("SELECT id, username, trust_score, status, avatar_url FROM contributors")
    contributors = cursor.fetchall()
    for c in contributors:
        nodes.append(NetworkGraphNode(
            id=f"contrib_{c['id']}",
            label=c["username"],
            type="contributor",
            trust_score=c["trust_score"],
            status=c["status"],
            avatar_url=c["avatar_url"]
        ))

    # 3. Edges from Trust Records
    cursor.execute("""
        SELECT tr.id, tr.contributor_id, tr.repo_id, tr.author_username, tr.type, tr.category, tr.reason, r.full_name as repo_name
        FROM trust_records tr
        LEFT JOIN repositories r ON tr.repo_id = r.id
    """)
    records = cursor.fetchall()
    for rec in records:
        source_id = f"repo_{rec['repo_id']}" if rec["repo_id"] else f"maintainer_{rec['author_username']}"
        target_id = f"contrib_{rec['contributor_id']}"
        weight = 1.0 if rec["type"] == "VOUCH" else -1.0
        edges.append(NetworkGraphEdge(
            source=source_id,
            target=target_id,
            type=rec["type"],
            weight=weight,
            category=rec["category"],
            reason=rec["reason"]
        ))

    # 4. Edges from Contributions (PRs)
    cursor.execute("""
        SELECT repo_id, contributor_id, COUNT(*) as pr_count
        FROM pull_requests
        GROUP BY repo_id, contributor_id
    """)
    pr_edges = cursor.fetchall()
    for pe in pr_edges:
        edges.append(NetworkGraphEdge(
            source=f"contrib_{pe['contributor_id']}",
            target=f"repo_{pe['repo_id']}",
            type="CONTRIBUTED_TO",
            weight=float(pe["pr_count"]),
            category=f"{pe['pr_count']} PR(s)",
            reason="Submitted Pull Requests"
        ))

    return NetworkGraphResponse(nodes=nodes, edges=edges)
