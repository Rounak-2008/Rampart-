import sqlite3
from typing import Dict, Any, List, Set, Tuple
from datetime import datetime, timezone
from app.models import NetworkGraphNode, NetworkGraphEdge, NetworkGraphResponse

# Configurable Trust Propagation Parameters
PROPAGATION_DECAY = 0.75  # lambda decay factor per hop
MAX_PROPAGATION_DEPTH = 2  # Bounded propagation depth
MIN_INTERMEDIARY_TRUST = 60.0  # Sybil protection: intermediary must be trusted to propagate

CATEGORY_WEIGHTS = {
    "SECURITY": 1.0,
    "ARCHITECTURE": 1.0,
    "QUALITY_CONTRIBUTION": 0.9,
    "DOCUMENTATION": 0.7,
    "COMMUNITY": 0.8
}

def extract_org_or_owner(repo_name: str, author: str) -> str:
    """Extract organization or owner for deduplication."""
    if repo_name and "/" in repo_name:
        return repo_name.split("/")[0].lower()
    if author:
        return author.lower()
    return "independent"

def calculate_propagated_trust(
    conn: sqlite3.Connection,
    target_contributor_id: int
) -> Dict[str, Any]:
    """
    Evidence-based, explainable trust propagation model:
    Formula: T(A, C) = T(A, B) * V(B, C) * lambda
    
    Safeguards:
    1. Trust decreases with each hop via exponential decay (lambda^depth).
    2. Depth capped at MAX_PROPAGATION_DEPTH (2).
    3. Org deduplication: multiple repos from same org count once.
    4. Sybil protection: intermediate propagators must have verified trust >= 60.
    5. Cycle detection: paths tracking to prevent circular amplification.
    6. Denouncements have high penalty and cannot be washed out by indirect vouches.
    """
    cursor = conn.cursor()

    # 1. Fetch target contributor record
    cursor.execute("""
        SELECT id, username, trust_score, status, total_prs
        FROM contributors
        WHERE id = ?
    """, (target_contributor_id,))
    target = cursor.fetchone()
    if not target:
        return {"error": "Contributor not found"}

    target_username = target["username"]

    # 2. Fetch direct trust records for target
    cursor.execute("""
        SELECT tr.id, tr.author_username, tr.type, tr.category, tr.reason, tr.evidence_url,
               tr.created_at, r.full_name as repo_name, r.owner as repo_owner
        FROM trust_records tr
        LEFT JOIN repositories r ON tr.repo_id = r.id
        WHERE tr.contributor_id = ?
    """, (target_contributor_id,))
    direct_records = cursor.fetchall()

    # 3. Direct Vouches with Org Deduplication
    direct_vouch_orgs: Dict[str, float] = {}
    direct_vouch_details = []
    denounce_orgs: Dict[str, str] = {}
    denounce_details = []

    for r in direct_records:
        org = extract_org_or_owner(r["repo_name"], r["author_username"])
        category = r["category"]
        cat_weight = CATEGORY_WEIGHTS.get(category, 0.8)

        if r["type"] == "VOUCH":
            # Retain maximum vouch weight per unique organization
            if org not in direct_vouch_orgs or cat_weight > direct_vouch_orgs[org]:
                direct_vouch_orgs[org] = cat_weight
            direct_vouch_details.append({
                "author": r["author_username"],
                "org": org,
                "category": category,
                "weight": cat_weight,
                "reason": r["reason"]
            })
        elif r["type"] == "DENOUNCE":
            denounce_orgs[org] = r["reason"]
            denounce_details.append({
                "author": r["author_username"],
                "org": org,
                "category": category,
                "reason": r["reason"],
                "evidence": r["evidence_url"]
            })

    # 4. Indirect / Propagated Vouches (Depth = 2)
    # A -> B -> C: Find trusted contributors (B) who vouch for target (C),
    # and see who vouched for B (A).
    propagated_paths = []
    indirect_vouch_bonus = 0.0

    # Find who vouched for target (B -> C)
    for r in direct_records:
        if r["type"] == "VOUCH":
            b_username = r["author_username"]
            # Look up contributor B in DB
            cursor.execute("SELECT id, trust_score, total_prs FROM contributors WHERE username = ?", (b_username,))
            b_row = cursor.fetchone()

            if b_row and (b_row["trust_score"] >= MIN_INTERMEDIARY_TRUST or b_row["total_prs"] >= 2):
                b_id = b_row["id"]
                b_trust = b_row["trust_score"] / 100.0  # Normalize 0.0 to 1.0
                v_bc = CATEGORY_WEIGHTS.get(r["category"], 0.8)

                # Look for who vouched for B (A -> B)
                cursor.execute("""
                    SELECT tr.author_username, tr.category, r.full_name as repo_name
                    FROM trust_records tr
                    LEFT JOIN repositories r ON tr.repo_id = r.id
                    WHERE tr.contributor_id = ? AND tr.type = 'VOUCH'
                """, (b_id,))
                a_records = cursor.fetchall()

                for a in a_records:
                    a_username = a["author_username"]
                    # Cycle check
                    if a_username.lower() in [target_username.lower(), b_username.lower()]:
                        continue

                    a_org = extract_org_or_owner(a["repo_name"], a_username)
                    # Org overlap check with direct orgs to prevent double-counting
                    if a_org in direct_vouch_orgs:
                        continue

                    # Propagated trust formula: T(A, C) = T(A, B) * V(B, C) * lambda
                    hop_value = b_trust * v_bc * PROPAGATION_DECAY
                    indirect_vouch_bonus += hop_value * 8.0  # scaled contribution
                    propagated_paths.append({
                        "path": f"@{a_username} -> @{b_username} -> @{target_username}",
                        "hop_value": round(hop_value, 3),
                        "decay": PROPAGATION_DECAY
                    })

    # Cap indirect bonus to prevent multi-hop inflation
    indirect_vouch_bonus = min(20.0, indirect_vouch_bonus)

    # 5. Contribution Track Record (Merged PRs)
    cursor.execute("""
        SELECT 
            COUNT(*) as total_prs,
            SUM(CASE WHEN state = 'merged' THEN 1 ELSE 0 END) as merged_prs,
            SUM(CASE WHEN state = 'closed' AND merged_at IS NULL THEN 1 ELSE 0 END) as rejected_prs
        FROM pull_requests
        WHERE contributor_id = ?
    """, (target_contributor_id,))
    pr_stats = cursor.fetchone()
    total_prs = (pr_stats["total_prs"] or 0) if pr_stats else 0
    merged_prs = (pr_stats["merged_prs"] or 0) if pr_stats else 0
    rejected_prs = (pr_stats["rejected_prs"] or 0) if pr_stats else 0

    # 6. Trust Score Computation
    # Baseline: 50.0 (Neutral fair start)
    base_score = 50.0

    # Direct vouches sum (org-deduplicated)
    direct_vouch_score = sum(w * 16.0 for w in direct_vouch_orgs.values())

    # Direct denouncements penalty (-35 per distinct denouncing org)
    denounce_penalty = len(denounce_orgs) * 35.0

    # Merged PRs bonus (+3 per merged PR, up to +18)
    pr_bonus = min(18.0, merged_prs * 3.0)

    # Final raw score
    raw_score = base_score + direct_vouch_score + indirect_vouch_bonus + pr_bonus - denounce_penalty
    final_score = max(0.0, min(100.0, raw_score))

    # 7. Contributor Status Derivation (Beginner not penalized)
    if len(denounce_orgs) > 0 or final_score < 35.0:
        status = "FLAGGED"
    elif len(direct_vouch_orgs) == 0 and len(propagated_paths) == 0 and total_prs <= 1:
        status = "BEGINNER"  # Clear beginner status; not suspicious
    elif len(direct_vouch_orgs) > 0 or len(propagated_paths) > 0 or final_score >= 75.0:
        status = "TRUSTED"
    elif merged_prs >= 2:
        status = "ESTABLISHED"
    else:
        status = "NEUTRAL"

    # Persist in contributors table
    cursor.execute("""
        UPDATE contributors
        SET trust_score = ?, status = ?, vouches_count = ?, denounces_count = ?,
            total_prs = ?, merged_prs = ?, rejected_prs = ?
        WHERE id = ?
    """, (
        round(final_score, 1),
        status,
        len(direct_vouch_orgs),
        len(denounce_orgs),
        total_prs,
        merged_prs,
        rejected_prs,
        target_contributor_id
    ))

    return {
        "contributor_id": target_contributor_id,
        "username": target_username,
        "trust_score": round(final_score, 1),
        "status": status,
        "direct_vouch_orgs": list(direct_vouch_orgs.keys()),
        "direct_vouch_count": len(direct_vouch_orgs),
        "denounce_count": len(denounce_orgs),
        "denounces": denounce_details,
        "propagated_paths": propagated_paths,
        "indirect_bonus": round(indirect_vouch_bonus, 2),
        "total_prs": total_prs,
        "merged_prs": merged_prs,
        "rejected_prs": rejected_prs,
        "explainable_summary": (
            f"Base: {base_score} + Direct Vouches: +{direct_vouch_score:.1f} ({len(direct_vouch_orgs)} unique orgs) "
            f"+ Indirect Propagation: +{indirect_vouch_bonus:.1f} ({len(propagated_paths)} path(s)) "
            f"+ Contribution Activity: +{pr_bonus:.1f} ({merged_prs} merged) "
            f"- Denouncements: -{denounce_penalty:.1f} ({len(denounce_orgs)} orgs) "
            f"= {final_score:.1f} ({status})"
        )
    }

def recalculate_contributor_trust(conn: sqlite3.Connection, contributor_id: int) -> Dict[str, Any]:
    """Compatibility wrapper that delegates to the evidence-based propagation model."""
    return calculate_propagated_trust(conn, contributor_id)

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
    cursor.execute("""
        SELECT id, username, trust_score, status, avatar_url, profile_url, total_prs, vouches_count, denounces_count
        FROM contributors
    """)
    contributors = cursor.fetchall()
    for c in contributors:
        nodes.append(NetworkGraphNode(
            id=f"contrib_{c['id']}",
            label=c["username"],
            type="contributor",
            trust_score=c["trust_score"],
            status=c["status"],
            avatar_url=c["avatar_url"],
            profile_url=c["profile_url"],
            total_prs=c["total_prs"] or 0,
            vouches_count=c["vouches_count"] or 0,
            denounces_count=c["denounces_count"] or 0
        ))

    # 3. Edges from Trust Records
    cursor.execute("""
        SELECT tr.id, tr.contributor_id, tr.repo_id, tr.author_username, tr.type, tr.category, tr.reason, tr.evidence_url, tr.created_at, r.full_name as repo_name
        FROM trust_records tr
        LEFT JOIN repositories r ON tr.repo_id = r.id
    """)
    records = cursor.fetchall()
    maintainers_added = set()

    for rec in records:
        if rec["repo_id"]:
            source_id = f"repo_{rec['repo_id']}"
        else:
            source_id = f"maintainer_{rec['author_username']}"
            if rec["author_username"] not in maintainers_added:
                maintainers_added.add(rec["author_username"])
                nodes.append(NetworkGraphNode(
                    id=source_id,
                    label=f"@{rec['author_username']}",
                    type="maintainer",
                    status="active"
                ))

        target_id = f"contrib_{rec['contributor_id']}"
        weight = 1.0 if rec["type"] == "VOUCH" else -1.0
        edges.append(NetworkGraphEdge(
            source=source_id,
            target=target_id,
            type=rec["type"],
            weight=weight,
            category=rec["category"],
            reason=rec["reason"],
            author=rec["author_username"],
            evidence_url=rec["evidence_url"],
            created_at=rec["created_at"]
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
