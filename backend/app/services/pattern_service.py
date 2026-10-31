import sqlite3
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

def analyze_pull_request(conn: sqlite3.Connection, pr_id: int) -> Dict[str, Any]:
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    # 1. Fetch PR details
    cursor.execute("""
        SELECT pr.*, c.username, c.trust_score, c.status as contributor_status, c.total_prs,
               r.full_name as repo_name, r.id as repo_id
        FROM pull_requests pr
        JOIN contributors c ON pr.contributor_id = c.id
        JOIN repositories r ON pr.repo_id = r.id
        WHERE pr.id = ?
    """, (pr_id,))
    pr = cursor.fetchone()
    if not pr:
        return {"error": "Pull request not found"}

    contributor_id = pr["contributor_id"]
    repo_id = pr["repo_id"]

    # 2. Check cross-repository trust records
    cursor.execute("""
        SELECT tr.*, r.full_name as source_repo
        FROM trust_records tr
        LEFT JOIN repositories r ON tr.repo_id = r.id
        WHERE tr.contributor_id = ?
    """, (contributor_id,))
    trust_records = cursor.fetchall()

    vouches = [r for r in trust_records if r["type"] == "VOUCH"]
    denounces = [r for r in trust_records if r["type"] == "DENOUNCE"]

    # 3. Check for similar PR titles submitted by this contributor across other repos
    cursor.execute("""
        SELECT pr.id, pr.pr_number, pr.title, r.full_name as repo_name, pr.created_at
        FROM pull_requests pr
        JOIN repositories r ON pr.repo_id = r.id
        WHERE pr.contributor_id = ? AND pr.id != ?
    """, (contributor_id, pr_id))
    other_prs = cursor.fetchall()

    duplicate_titles = [
        o for o in other_prs 
        if o["title"].strip().lower() == pr["title"].strip().lower()
    ]

    # Evaluation Rules
    risk_level = "LOW"
    analysis_points = []
    generated_alerts = []
    findings = []

    # Rule A: Check Denouncements
    if len(denounces) > 0:
        risk_level = "HIGH"
        source_repos = ", ".join([d["source_repo"] or "independent maintainer" for d in denounces])
        msg = f"Evidence Alert: Contributor has {len(denounces)} active Denouncement(s) across network repos ({source_repos})."
        analysis_points.append(msg)
        evidence_str = "; ".join([f"{d['reason']} ({d['evidence_url']})" for d in denounces])

        findings.append({
            "title": "Cross-Repository Abuse History",
            "description": f"Contributor '{pr['username']}' has {len(denounces)} verified Denouncement(s) on record from maintainers of {source_repos}.",
            "evidence": evidence_str,
            "severity": "caution"
        })

        # Check if an alert already exists for this PR
        cursor.execute("""
            SELECT id FROM alerts WHERE pr_id = ? AND pattern_type = 'CROSS_REPO_SPAM_HISTORY'
        """, (pr_id,))
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO alerts (repo_id, pr_id, contributor_id, severity, pattern_type, message, evidence_details, is_resolved, created_at)
                VALUES (?, ?, ?, 'CRITICAL', 'CROSS_REPO_SPAM_HISTORY', ?, ?, 0, ?)
            """, (repo_id, pr_id, contributor_id, msg, evidence_str, now))
            generated_alerts.append(msg)

    # Rule B: Check for Cross-Repo Duplicate PR submissions
    elif len(duplicate_titles) >= 2:
        risk_level = "MEDIUM"
        msg = f"Pattern Notice: Contributor opened identical PR title across {len(duplicate_titles) + 1} connected repositories."
        analysis_points.append(msg)
        evidence_str = "Matches titles in: " + ", ".join([f"{d['repo_name']} #{d['pr_number']}" for d in duplicate_titles])

        findings.append({
            "title": "Multi-Repository Duplicate PR Pattern",
            "description": f"Identical PR title submitted across {len(duplicate_titles) + 1} separate repositories within recent time window.",
            "evidence": evidence_str,
            "severity": "warning"
        })

        cursor.execute("""
            SELECT id FROM alerts WHERE pr_id = ? AND pattern_type = 'CROSS_REPO_DUPLICATE_PR'
        """, (pr_id,))
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO alerts (repo_id, pr_id, contributor_id, severity, pattern_type, message, evidence_details, is_resolved, created_at)
                VALUES (?, ?, ?, 'WARNING', 'CROSS_REPO_DUPLICATE_PR', ?, ?, 0, ?)
            """, (repo_id, pr_id, contributor_id, msg, evidence_str, now))
            generated_alerts.append(msg)

    # Rule C: New Contributor (Strictly Fair Baseline)
    elif len(trust_records) == 0 and pr["total_prs"] <= 1:
        risk_level = "UNKNOWN"
        msg = "New Contributor: No previous trust records found in the network. Standard first-time code review recommended."
        analysis_points.append(msg)

        findings.append({
            "title": "New Contributor (Good Standing)",
            "description": "First contribution interaction with RAMPART network. Contributor has zero abuse reports and is treated with neutral good faith.",
            "evidence": "No prior cross-repository history. Standard code review advised.",
            "severity": "info"
        })

        cursor.execute("""
            SELECT id FROM alerts WHERE pr_id = ? AND pattern_type = 'NEW_CONTRIBUTOR'
        """, (pr_id,))
        if not cursor.fetchone():
            evidence = "First interaction with RAMPART network. Contributor is in good standing (neutral baseline)."
            cursor.execute("""
                INSERT INTO alerts (repo_id, pr_id, contributor_id, severity, pattern_type, message, evidence_details, is_resolved, created_at)
                VALUES (?, ?, ?, 'INFO', 'NEW_CONTRIBUTOR', ?, ?, 0, ?)
            """, (repo_id, pr_id, contributor_id, msg, evidence, now))
            generated_alerts.append(msg)

    # Rule D: Trusted Contributor
    elif len(vouches) > 0:
        risk_level = "LOW"
        vouch_sources = ", ".join([v["source_repo"] or "network maintainer" for v in vouches])
        msg = f"Verified Contributor: Backed by {len(vouches)} positive Vouch(es) from {vouch_sources}."
        analysis_points.append(msg)

        findings.append({
            "title": "Verified Peer Vouches",
            "description": f"Contributor '{pr['username']}' is endorsed by maintainers of {vouch_sources}.",
            "evidence": "; ".join([f"{v['reason']} ({v['evidence_url']})" for v in vouches]),
            "severity": "info"
        })

    else:
        risk_level = "LOW"
        analysis_points.append("Standard contribution. No network anomalies detected.")
        findings.append({
            "title": "Standard PR Submission",
            "description": "Code and contributor profile check out normally. No duplicate submissions or reports.",
            "evidence": None,
            "severity": "info"
        })

    summary = " | ".join(analysis_points)

    # Update PR in DB
    cursor.execute("""
        UPDATE pull_requests 
        SET risk_level = ?, analysis_summary = ?, updated_at = ?
        WHERE id = ?
    """, (risk_level, summary, now, pr_id))

    return {
        "pr_id": pr_id,
        "risk_level": risk_level,
        "analysis_summary": summary,
        "vouches_count": len(vouches),
        "denounces_count": len(denounces),
        "generated_alerts": generated_alerts,
        "findings": findings
    }
