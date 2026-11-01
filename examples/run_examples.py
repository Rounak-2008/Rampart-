#!/usr/bin/env python3
"""
RAMPART — Automated Example Suite Runner
================================================================================
This script executes all 4 realistic pull request examples through RAMPART's
actual analysis and classification pipeline:

  1. example_01_good_pr: Clean feature addition with unit tests.
  2. example_02_average_pr: Substantive code changes without test coverage.
  3. example_03_risky_pr: Verifiable SQL injection vulnerability.
  4. example_04_spam_pr: Trivial non-functional whitespace/churn PR.

Usage:
  PYTHONPATH=backend python3 examples/run_examples.py
"""

import sys
import os
import json
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

# Ensure backend modules are discoverable
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.database import get_db, init_db
from app.services.pattern_service import analyze_pull_request, calculate_pr_content_hash

EXAMPLES = [
    {
        "id": "example_01_good_pr",
        "title": "feat(auth): Add token bucket rate-limiting middleware with tests",
        "author": "charlie-sec",
        "author_trust": 75.0,
        "author_status": "ESTABLISHED",
        "expected_quality": "GOOD",
        "expected_risk": "LOW",
        "expected_recommendation": "APPROVE",
        "expected_priority": "PRIORITY REVIEW",
        "files": [
            {
                "filename": "backend/app/middleware/rate_limit.py",
                "status": "added",
                "additions": 48,
                "deletions": 0,
                "patch": """@@ -0,0 +1,48 @@
+import time
+from collections import defaultdict
+
+class TokenBucketRateLimiter:
+    \"\"\"Thread-safe token bucket rate limiter for FastAPI routes.\"\"\"
+    def __init__(self, rate_per_second: float = 10.0, burst_capacity: int = 20):
+        self.rate = rate_per_second
+        self.capacity = burst_capacity
+        self.tokens = defaultdict(lambda: burst_capacity)
+        self.last_check = defaultdict(time.time)
+
+    def is_allowed(self, client_ip: str) -> bool:
+        now = time.time()
+        elapsed = now - self.last_check[client_ip]
+        self.last_check[client_ip] = now
+        self.tokens[client_ip] = min(self.capacity, self.tokens[client_ip] + elapsed * self.rate)
+        if self.tokens[client_ip] >= 1.0:
+            self.tokens[client_ip] -= 1.0
+            return True
+        return False
+"""
            },
            {
                "filename": "backend/tests/test_rate_limit.py",
                "status": "added",
                "additions": 32,
                "deletions": 0,
                "patch": """@@ -0,0 +1,32 @@
+import unittest
+import time
+from app.middleware.rate_limit import TokenBucketRateLimiter
+
+class TestRateLimiter(unittest.TestCase):
+    def test_burst_allowance(self):
+        limiter = TokenBucketRateLimiter(rate_per_second=5.0, burst_capacity=5)
+        for _ in range(5):
+            self.assertTrue(limiter.is_allowed("127.0.0.1"))
+        self.assertFalse(limiter.is_allowed("127.0.0.1"))
+"""
            }
        ]
    },
    {
        "id": "example_02_average_pr",
        "title": "refactor(db): Reorganize connection pool queries",
        "author": "dev-contributor-2",
        "author_trust": 50.0,
        "author_status": "BEGINNER",
        "expected_quality": "AVERAGE",
        "expected_risk": "MEDIUM",
        "expected_recommendation": "NEEDS HUMAN REVIEW",
        "expected_priority": "NORMAL REVIEW",
        "files": [
            {
                "filename": "backend/app/database.py",
                "status": "modified",
                "additions": 35,
                "deletions": 12,
                "patch": """@@ -42,12 +42,35 @@ def get_db_pool():
-    return sqlite3.connect("rampart.db")
+    # Connect without timeout or retry handling
+    conn = sqlite3.connect("rampart.db", timeout=60.0)
+    conn.execute("PRAGMA journal_mode=WAL;")
+    return conn
+
+def execute_raw_batch(statements):
+    conn = get_db_pool()
+    cursor = conn.cursor()
+    for stmt in statements:
+        cursor.execute(stmt)
+    conn.commit()
"""
            }
        ]
    },
    {
        "id": "example_03_risky_pr",
        "title": "fix(query): Add dynamic user search filtering endpoint",
        "author": "guest-coder-99",
        "author_trust": 40.0,
        "author_status": "NEUTRAL",
        "expected_quality": "FLAGGED",
        "expected_risk": "HIGH",
        "expected_recommendation": "REQUEST CHANGES",
        "expected_priority": "HIGH-RISK FLAG",
        "files": [
            {
                "filename": "backend/app/routes/search.py",
                "status": "added",
                "additions": 22,
                "deletions": 0,
                "patch": """@@ -0,0 +1,22 @@
+from fastapi import APIRouter
+import sqlite3
+
+router = APIRouter()
+
+@router.get("/api/search")
+def search_users(term: str):
+    conn = sqlite3.connect("rampart.db")
+    cursor = conn.cursor()
+    # DANGEROUS: Unparameterized SQL format interpolation
+    query = f"SELECT id, username FROM contributors WHERE username = '{term}'"
+    cursor.execute(query)
+    return cursor.fetchall()
+"""
            }
        ]
    },
    {
        "id": "example_04_spam_pr",
        "title": "chore: formatting and trivial spacing",
        "author": "spam-bot-01",
        "author_trust": 20.0,
        "author_status": "FLAGGED",
        "expected_quality": "SPAM",
        "expected_risk": "LOW",
        "expected_recommendation": "REQUEST CHANGES",
        "expected_priority": "SPAM",
        "files": [
            {
                "filename": "README.md",
                "status": "modified",
                "additions": 2,
                "deletions": 1,
                "patch": """@@ -1,4 +1,5 @@
-# RAMPART
+# RAMPART  
+ 
 Security Platform
"""
            }
        ]
    }
]

def run_suite():
    print("=" * 80)
    print("🛡️  RAMPART — Running PR Analysis Example Suite")
    print("=" * 80)

    # Initialize SQLite database
    init_db()

    results_summary = []

    # Ensure a clean test repository exists
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM repositories WHERE full_name = 'acme-org/rampart-core'")
        repo_row = cursor.fetchone()
        if not repo_row:
            cursor.execute("""
                INSERT INTO repositories (github_repo_id, owner, name, full_name, description, default_branch, created_at)
                VALUES (999001, 'acme-org', 'rampart-core', 'acme-org/rampart-core', 'Security evaluation fixture repo', 'main', ?)
            """, (now,))
            repo_id = cursor.lastrowid
        else:
            repo_id = repo_row["id"]

    for ex in EXAMPLES:
        print(f"\nEvaluating: [{ex['id']}] {ex['title']}")

        with get_db() as conn:
            cursor = conn.cursor()

            # 1. Upsert Contributor
            cursor.execute("SELECT id FROM contributors WHERE username = ?", (ex["author"],))
            c_row = cursor.fetchone()
            if not c_row:
                cursor.execute("""
                    INSERT INTO contributors (username, avatar_url, profile_url, trust_score, status, merged_prs, rejected_prs, first_seen_at, last_active_at)
                    VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
                """, (ex["author"], f"https://github.com/{ex['author']}.png", f"https://github.com/{ex['author']}", ex["author_trust"], ex["author_status"], now, now))
                contributor_id = cursor.lastrowid
            else:
                contributor_id = c_row["id"]
                cursor.execute("UPDATE contributors SET trust_score = ?, status = ? WHERE id = ?", (ex["author_trust"], ex["author_status"], contributor_id))

            # 2. Insert or replace PR record
            total_additions = sum(f.get("additions", 0) for f in ex["files"])
            total_deletions = sum(f.get("deletions", 0) for f in ex["files"])
            files_count = len(ex["files"])

            cursor.execute("SELECT id FROM pull_requests WHERE repo_id = ? AND title = ?", (repo_id, ex["title"]))
            pr_row = cursor.fetchone()
            if pr_row:
                pr_id = pr_row["id"]
                cursor.execute("""
                    UPDATE pull_requests 
                    SET contributor_id = ?, additions = ?, deletions = ?, files_changed = ?, state = 'open', updated_at = ?
                    WHERE id = ?
                """, (contributor_id, total_additions, total_deletions, files_count, now, pr_id))
            else:
                cursor.execute("""
                    INSERT INTO pull_requests (repo_id, contributor_id, pr_number, title, body, state, risk_level, files_changed, additions, deletions, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'open', 'UNKNOWN', ?, ?, ?, ?, ?)
                """, (repo_id, contributor_id, 100 + len(results_summary), ex["title"], f"PR description for {ex['id']}", files_count, total_additions, total_deletions, now, now))
                pr_id = cursor.lastrowid

            conn.commit()

            # Execute real RAMPART analysis with provided fixture files
            analysis = analyze_pull_request(conn, pr_id, force=True, files_override=ex["files"])

            actual_quality = analysis.get("quality_category")
            actual_risk = analysis.get("risk_level")
            actual_priority = analysis.get("priority_decision")
            ai_data = analysis.get("ai_analysis", {})
            actual_rec = ai_data.get("final_ai_recommendation")
            overall_assessment = ai_data.get("overall_assessment")

            quality_matches = (actual_quality == ex["expected_quality"])
            priority_matches = (actual_priority == ex["expected_priority"])

            print(f"  • Quality:      Actual={actual_quality:<8} Expected={ex['expected_quality']:<8} [{'PASS' if quality_matches else 'DIFF'}]")
            print(f"  • Risk Level:   Actual={actual_risk:<8} Expected={ex['expected_risk']:<8}")
            print(f"  • AI Rec:       {actual_rec}")
            print(f"  • Priority:     Actual={actual_priority:<20} Expected={ex['expected_priority']:<20} [{'PASS' if priority_matches else 'DIFF'}]")
            print(f"  • Assessment:   {overall_assessment[:100]}...")

            # Save detailed fixture output in the example directory
            ex_dir = REPO_ROOT / "examples" / ex["id"]
            ex_dir.mkdir(parents=True, exist_ok=True)

            with open(ex_dir / "actual_output.json", "w", encoding="utf-8") as f:
                json.dump(analysis, f, indent=2)

            results_summary.append({
                "example": ex["id"],
                "title": ex["title"],
                "expected_quality": ex["expected_quality"],
                "actual_quality": actual_quality,
                "expected_priority": ex["expected_priority"],
                "actual_priority": actual_priority,
                "ai_recommendation": actual_rec,
                "risk_level": actual_risk,
                "matches": quality_matches and priority_matches
            })

    print("\n" + "=" * 80)
    print("📊 EXAMPLE SUITE VERIFICATION SUMMARY")
    print("=" * 80)
    all_passed = True
    for r in results_summary:
        status_symbol = "✅ PASS" if r["matches"] else "⚠️ REVIEW"
        if not r["matches"]:
            all_passed = False
        print(f"{status_symbol} | {r['example']:<22} | Quality: {r['actual_quality']:<8} | Priority: {r['actual_priority']:<22} | AI Rec: {r['ai_recommendation']}")

    print("=" * 80)
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(run_suite())
