import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator
from app.config import DB_PATH

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db() -> None:
    db_file = Path(DB_PATH)
    db_file.parent.mkdir(parents=True, exist_ok=True)

    with get_db() as conn:
        cursor = conn.cursor()

        # Repositories table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS repositories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                github_repo_id INTEGER,
                owner TEXT NOT NULL,
                name TEXT NOT NULL,
                full_name TEXT UNIQUE NOT NULL,
                description TEXT,
                html_url TEXT,
                default_branch TEXT DEFAULT 'main',
                is_active INTEGER DEFAULT 1,
                webhook_secret TEXT,
                last_synced_at TEXT,
                created_at TEXT NOT NULL
            )
        """)

        # Contributors table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS contributors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                github_id INTEGER,
                username TEXT UNIQUE NOT NULL,
                avatar_url TEXT,
                profile_url TEXT,
                trust_score REAL DEFAULT 50.0,
                status TEXT DEFAULT 'NEW',
                total_prs INTEGER DEFAULT 0,
                vouches_count INTEGER DEFAULT 0,
                denounces_count INTEGER DEFAULT 0,
                first_seen_at TEXT NOT NULL,
                last_active_at TEXT NOT NULL
            )
        """)

        # Pull Requests table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pull_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                github_pr_id INTEGER,
                repo_id INTEGER NOT NULL,
                contributor_id INTEGER NOT NULL,
                pr_number INTEGER NOT NULL,
                title TEXT NOT NULL,
                body TEXT,
                html_url TEXT,
                diff_url TEXT,
                state TEXT DEFAULT 'open',
                risk_level TEXT DEFAULT 'UNKNOWN',
                analysis_summary TEXT,
                files_changed INTEGER DEFAULT 0,
                additions INTEGER DEFAULT 0,
                deletions INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT,
                merged_at TEXT,
                closed_at TEXT,
                FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
                FOREIGN KEY (contributor_id) REFERENCES contributors(id) ON DELETE CASCADE,
                UNIQUE(repo_id, pr_number)
            )
        """)

        # Trust Records (Vouch / Denounce)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS trust_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contributor_id INTEGER NOT NULL,
                repo_id INTEGER,
                author_username TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('VOUCH', 'DENOUNCE')),
                category TEXT NOT NULL,
                reason TEXT NOT NULL,
                evidence_url TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (contributor_id) REFERENCES contributors(id) ON DELETE CASCADE,
                FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE SET NULL
            )
        """)

        # Alerts table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                repo_id INTEGER,
                pr_id INTEGER,
                contributor_id INTEGER NOT NULL,
                severity TEXT NOT NULL CHECK(severity IN ('INFO', 'WARNING', 'CRITICAL')),
                pattern_type TEXT NOT NULL,
                message TEXT NOT NULL,
                evidence_details TEXT,
                is_resolved INTEGER DEFAULT 0,
                resolved_by TEXT,
                resolved_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
                FOREIGN KEY (pr_id) REFERENCES pull_requests(id) ON DELETE SET NULL,
                FOREIGN KEY (contributor_id) REFERENCES contributors(id) ON DELETE CASCADE
            )
        """)

        # Notifications table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                link_url TEXT,
                is_read INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)

        # Seed data if empty
        cursor.execute("SELECT COUNT(*) as cnt FROM repositories")
        row = cursor.fetchone()
        if row and row["cnt"] == 0:
            seed_initial_data(cursor)

def seed_initial_data(cursor: sqlite3.Cursor) -> None:
    now = datetime.now(timezone.utc).isoformat()

    # 1. Repositories
    repos = [
        (
            None,
            "Rounak-2008",
            "Rampart-",
            "Rounak-2008/Rampart-",
            "Decentralized trust network for open source GitHub contributors",
            "https://github.com/Rounak-2008/Rampart-",
            "main",
            1,
            "secret_rampart_live",
            now,
            now,
        ),
        (
            None,
            "open-source-foundation",
            "core-gateway",
            "open-source-foundation/core-gateway",
            "High performance API gateway for distributed open source services",
            "https://github.com/open-source-foundation/core-gateway",
            "main",
            1,
            "secret_gateway",
            now,
            now,
        ),
        (
            None,
            "decentralized-id",
            "auth-hub",
            "decentralized-id/auth-hub",
            "Federated authentication and identity verification microservice",
            "https://github.com/decentralized-id/auth-hub",
            "main",
            1,
            "secret_auth",
            now,
            now,
        ),
    ]
    cursor.executemany(
        """
        INSERT INTO repositories (github_repo_id, owner, name, full_name, description, html_url, default_branch, is_active, webhook_secret, last_synced_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        repos,
    )

    # 2. Contributors
    contributors = [
        (
            101,
            "alex-dev",
            "https://avatars.githubusercontent.com/u/101?v=4",
            "https://github.com/alex-dev",
            94.0,
            "TRUSTED",
            14,
            2,
            0,
            now,
            now,
        ),
        (
            102,
            "sarah-codes",
            "https://avatars.githubusercontent.com/u/102?v=4",
            "https://github.com/sarah-codes",
            88.0,
            "TRUSTED",
            8,
            1,
            0,
            now,
            now,
        ),
        (
            103,
            "newbie-hacker",
            "https://avatars.githubusercontent.com/u/103?v=4",
            "https://github.com/newbie-hacker",
            50.0,
            "NEW",
            1,
            0,
            0,
            now,
            now,
        ),
        (
            104,
            "pr-spammer99",
            "https://avatars.githubusercontent.com/u/104?v=4",
            "https://github.com/pr-spammer99",
            18.0,
            "FLAGGED",
            9,
            0,
            2,
            now,
            now,
        ),
        (
            105,
            "code-ninja42",
            "https://avatars.githubusercontent.com/u/105?v=4",
            "https://github.com/code-ninja42",
            50.0,
            "NEUTRAL",
            2,
            0,
            0,
            now,
            now,
        ),
    ]
    cursor.executemany(
        """
        INSERT INTO contributors (github_id, username, avatar_url, profile_url, trust_score, status, total_prs, vouches_count, denounces_count, first_seen_at, last_active_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        contributors,
    )

    # 3. Pull Requests
    prs = [
        (
            1001,
            1, # Rampart-
            1, # alex-dev
            14,
            "feat(trust): add cryptographic signature verification for vouchers",
            "Implements ed25519 signature checks on incoming peer vouch claims with full test coverage.",
            "https://github.com/Rounak-2008/Rampart-/pull/14",
            "https://github.com/Rounak-2008/Rampart-/pull/14.diff",
            "open",
            "LOW",
            "Trusted Contributor (Score: 94). Verified 2 previous cross-repo Vouches. Clean diff.",
            6,
            240,
            35,
            now,
            now,
            None,
            None,
        ),
        (
            1002,
            1, # Rampart-
            4, # pr-spammer99
            15,
            "docs: fix typo in README and white space",
            "Fixed simple grammatical punctuation.",
            "https://github.com/Rounak-2008/Rampart-/pull/15",
            "https://github.com/Rounak-2008/Rampart-/pull/15.diff",
            "open",
            "HIGH",
            "Warning: Contributor has 2 active Denouncements across network for duplicate spam farming.",
            1,
            2,
            1,
            now,
            now,
            None,
            None,
        ),
        (
            1003,
            1, # Rampart-
            3, # newbie-hacker
            16,
            "fix(cli): add missing error message when port is occupied",
            "Adds user friendly logging when port 8000 is already in use by another instance.",
            "https://github.com/Rounak-2008/Rampart-/pull/16",
            "https://github.com/Rounak-2008/Rampart-/pull/16.diff",
            "open",
            "UNKNOWN",
            "New Contributor. No prior network records. Standard first-time review recommended.",
            2,
            18,
            4,
            now,
            now,
            None,
            None,
        ),
        (
            1004,
            2, # core-gateway
            2, # sarah-codes
            88,
            "refactor(proxy): optimize connection pool reuse",
            "Reduces connection handshake latency by caching upstream keep-alive sessions.",
            "https://github.com/open-source-foundation/core-gateway/pull/88",
            "https://github.com/open-source-foundation/core-gateway/pull/88.diff",
            "merged",
            "LOW",
            "Verified maintainer vouch on record. All tests passed.",
            4,
            115,
            42,
            now,
            now,
            now,
            None,
        ),
        (
            1005,
            3, # auth-hub
            4, # pr-spammer99
            42,
            "Update README.md typo",
            "Small typo correction.",
            "https://github.com/decentralized-id/auth-hub/pull/42",
            "https://github.com/decentralized-id/auth-hub/pull/42.diff",
            "closed",
            "HIGH",
            "Closed as spam. Denounced by auth-hub maintainer with evidence link.",
            1,
            1,
            1,
            now,
            now,
            None,
            now,
        ),
        (
            1006,
            2, # core-gateway
            5, # code-ninja42
            91,
            "docs: clarify environment variable overrides",
            "Adds detailed markdown table for Docker and Kubernetes env overrides.",
            "https://github.com/open-source-foundation/core-gateway/pull/91",
            "https://github.com/open-source-foundation/core-gateway/pull/91.diff",
            "merged",
            "LOW",
            "Clean docs contribution. No issues detected.",
            1,
            45,
            3,
            now,
            now,
            now,
            None,
        ),
    ]
    cursor.executemany(
        """
        INSERT INTO pull_requests (github_pr_id, repo_id, contributor_id, pr_number, title, body, html_url, diff_url, state, risk_level, analysis_summary, files_changed, additions, deletions, created_at, updated_at, merged_at, closed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        prs,
    )

    # 4. Trust Records (Vouches & Denouncements)
    records = [
        (
            1, # alex-dev
            2, # core-gateway
            "gateway-maintainer",
            "VOUCH",
            "QUALITY_CONTRIBUTION",
            "Alex demonstrated exceptional architectural care on connection pooling. Promptly addressed review notes.",
            "https://github.com/open-source-foundation/core-gateway/pull/88",
            now,
        ),
        (
            1, # alex-dev
            3, # auth-hub
            "auth-sec-lead",
            "VOUCH",
            "SECURITY_RESEARCH",
            "Responsibly reported and patched a token replay edge case under our disclosure guidelines.",
            "https://github.com/decentralized-id/auth-hub/pull/29",
            now,
        ),
        (
            2, # sarah-codes
            2, # core-gateway
            "gateway-maintainer",
            "VOUCH",
            "RELIABILITY",
            "High quality contributor, reliable test suite additions, great collaborator in discussions.",
            "https://github.com/open-source-foundation/core-gateway/pull/85",
            now,
        ),
        (
            4, # pr-spammer99
            3, # auth-hub
            "auth-sec-lead",
            "DENOUNCE",
            "CROSS_REPO_SPAM",
            "Automated trivial spam: opened identical 1-character markdown space adjustments across 6 unrelated repos in 10 minutes.",
            "https://github.com/decentralized-id/auth-hub/pull/42",
            now,
        ),
        (
            4, # pr-spammer99
            2, # core-gateway
            "gateway-maintainer",
            "DENOUNCE",
            "FARMING_PRS",
            "Opened PR #73 with copy-pasted ChatGPT explanation that broke unit test harness, ignored feedback.",
            "https://github.com/open-source-foundation/core-gateway/pull/73",
            now,
        ),
    ]
    cursor.executemany(
        """
        INSERT INTO trust_records (contributor_id, repo_id, author_username, type, category, reason, evidence_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        records,
    )

    # 5. Alerts
    alerts = [
        (
            1, # Rampart-
            2, # PR #15
            4, # pr-spammer99
            "CRITICAL",
            "CROSS_REPO_SPAM_HISTORY",
            "Contributor 'pr-spammer99' has 2 active Denouncements across network repos for automated spam farming.",
            "Denounced by auth-hub (#42) and core-gateway (#73). Maintainer review advised.",
            0,
            None,
            None,
            now,
        ),
        (
            1, # Rampart-
            3, # PR #16
            3, # newbie-hacker
            "INFO",
            "NEW_CONTRIBUTOR",
            "First contribution from 'newbie-hacker'. No prior trust records found in the network.",
            "Classified as New/Unknown. Standard code review recommended without bias.",
            0,
            None,
            None,
            now,
        ),
        (
            3, # auth-hub
            5, # PR #42
            4, # pr-spammer99
            "WARNING",
            "SPAM_PR_DETECTED",
            "Closed spam PR from 'pr-spammer99' marked with official maintainer denouncement.",
            "Evidence confirmed by repository maintainer on October 2026.",
            1,
            "auth-sec-lead",
            now,
            now,
        ),
    ]
    cursor.executemany(
        """
        INSERT INTO alerts (repo_id, pr_id, contributor_id, severity, pattern_type, message, evidence_details, is_resolved, resolved_by, resolved_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        alerts,
    )

    # 6. Notifications
    notifications = [
        (
            "ALERT",
            "Suspicious Contributor Flagged on PR #15",
            "RAMPART detected that contributor 'pr-spammer99' was previously denounced in auth-hub and core-gateway.",
            "/pull-requests/2",
            0,
            now,
        ),
        (
            "VOUCH",
            "New Vouch Recorded for alex-dev",
            "Repository 'auth-hub' vouched for alex-dev for responsible security patch.",
            "/contributors/alex-dev",
            0,
            now,
        ),
        (
            "PR",
            "New PR #14 from Trusted Contributor",
            "alex-dev (Trust Score: 94) submitted PR #14: feat(trust): add cryptographic signature verification.",
            "/pull-requests/1",
            1,
            now,
        ),
        (
            "REPO",
            "Repository Synchronized",
            "Rounak-2008/Rampart- successfully synchronized with GitHub.",
            "/repositories",
            1,
            now,
        ),
    ]
    cursor.executemany(
        """
        INSERT INTO notifications (type, title, message, link_url, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        notifications,
    )
