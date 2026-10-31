import sys
from pathlib import Path

# Add backend directory to path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from fastapi.testclient import TestClient
from app.main import app
from app.database import init_db

def test_all_endpoints():
    print("🧪 Initializing Database and Seed Data...")
    init_db()

    client = TestClient(app)
    passed = 0
    total = 0

    def check(name, resp, expected_status=200):
        nonlocal passed, total
        total += 1
        if resp.status_code == expected_status:
            print(f"  ✅ [PASS] {name} ({resp.status_code})")
            passed += 1
            return True
        else:
            print(f"  ❌ [FAIL] {name} (Expected {expected_status}, got {resp.status_code}): {resp.text}")
            return False

    print("\n--- 1. Health & Root ---")
    r = client.get("/")
    check("GET /", r)
    r = client.get("/api/health")
    check("GET /api/health", r)

    print("\n--- 2. Dashboard ---")
    r = client.get("/api/dashboard/stats")
    check("GET /api/dashboard/stats", r)
    stats = r.json().get("data", {})
    print(f"     Stats: Repos={stats.get('total_repositories')}, PRs={stats.get('active_pull_requests')}, Contributors={stats.get('analyzed_contributors')}, Alerts={stats.get('active_alerts')}")
    
    r = client.get("/api/dashboard/activity")
    check("GET /api/dashboard/activity", r)

    print("\n--- 3. Repositories ---")
    r = client.get("/api/repositories")
    check("GET /api/repositories", r)
    repos = r.json().get("data", [])
    print(f"     Found {len(repos)} connected repositories")

    # Connect a test repo
    test_repo = {
        "full_name": "sample-org/demo-security-suite",
        "description": "Zero trust policy management demo",
        "webhook_secret": "sample_secret_key"
    }
    r = client.post("/api/repositories", json=test_repo)
    check("POST /api/repositories", r)
    new_repo_id = r.json().get("data", {}).get("id")

    # Sync repo
    r = client.post(f"/api/repositories/{new_repo_id}/sync")
    check(f"POST /api/repositories/{new_repo_id}/sync", r)

    print("\n--- 4. Pull Requests ---")
    r = client.get("/api/pull-requests")
    check("GET /api/pull-requests", r)
    prs = r.json().get("data", [])
    print(f"     Found {len(prs)} pull requests")

    first_pr_id = prs[0]["id"] if prs else 1
    r = client.get(f"/api/pull-requests/{first_pr_id}")
    check(f"GET /api/pull-requests/{first_pr_id}", r)

    r = client.post(f"/api/pull-requests/{first_pr_id}/analyze")
    check(f"POST /api/pull-requests/{first_pr_id}/analyze", r)
    print(f"     Analysis Result: Risk={r.json().get('data', {}).get('risk_level')}")

    print("\n--- 5. Contributors ---")
    r = client.get("/api/contributors")
    check("GET /api/contributors", r)
    contribs = r.json().get("data", [])
    print(f"     Found {len(contribs)} contributors")

    r = client.get("/api/contributors/alex-dev")
    check("GET /api/contributors/alex-dev", r)

    r = client.get("/api/contributors/alex-dev/history")
    check("GET /api/contributors/alex-dev/history", r)

    print("\n--- 6. Trust System (Vouch & Denounce) ---")
    vouch_payload = {
        "contributor_username": "alex-dev",
        "repo_id": 1,
        "category": "ARCHITECTURE",
        "reason": "Outstanding test harness design and zero regressions during release audit.",
        "evidence_url": "https://github.com/Rounak-2008/Rampart-/commit/e728491",
        "author_username": "Rounak-2008"
    }
    r = client.post("/api/trust/vouch", json=vouch_payload)
    check("POST /api/trust/vouch", r)

    denounce_payload = {
        "contributor_username": "pr-spammer99",
        "repo_id": 1,
        "category": "ABUSIVE_AUTOMATION",
        "reason": "Submitted scripted non-functional white-space modifications across multiple forks simultaneously.",
        "evidence_url": "https://github.com/Rounak-2008/Rampart-/pull/15",
        "author_username": "Rounak-2008"
    }
    r = client.post("/api/trust/denounce", json=denounce_payload)
    check("POST /api/trust/denounce", r)

    r = client.get("/api/trust/records")
    check("GET /api/trust/records", r)

    print("\n--- 7. Trust Network Graph ---")
    r = client.get("/api/trust/network-graph")
    check("GET /api/trust/network-graph", r)
    graph = r.json().get("data", {})
    print(f"     Network Graph: Nodes={len(graph.get('nodes', []))}, Edges={len(graph.get('edges', []))}")

    print("\n--- 8. Alerts ---")
    r = client.get("/api/alerts")
    check("GET /api/alerts", r)
    alerts = r.json().get("data", [])
    print(f"     Found {len(alerts)} alerts")

    if alerts:
        first_alert_id = alerts[0]["id"]
        r = client.patch(f"/api/alerts/{first_alert_id}/resolve", json={"resolved_by": "Rounak-2008"})
        check(f"PATCH /api/alerts/{first_alert_id}/resolve", r)

    print("\n--- 9. Notifications ---")
    r = client.get("/api/notifications")
    check("GET /api/notifications", r)
    notifs = r.json().get("data", [])
    print(f"     Found {len(notifs)} notifications")

    if notifs:
        first_notif_id = notifs[0]["id"]
        r = client.patch(f"/api/notifications/{first_notif_id}/read")
        check(f"PATCH /api/notifications/{first_notif_id}/read", r)

    r = client.post("/api/notifications/mark-all-read")
    check("POST /api/notifications/mark-all-read", r)

    print("\n--- 10. Webhooks ---")
    # Ping
    r = client.post("/api/webhooks/github", headers={"X-GitHub-Event": "ping"}, json={"zen": "Non-blocking is better than blocking."})
    check("POST /api/webhooks/github (ping)", r)

    # PR Event
    pr_payload = {
        "action": "opened",
        "repository": {
            "id": 9999,
            "full_name": "Rounak-2008/Rampart-",
            "name": "Rampart-",
            "owner": {"login": "Rounak-2008"}
        },
        "pull_request": {
            "id": 88881,
            "number": 99,
            "title": "feat(api): optimize response payload formatting",
            "body": "Streamlines JSON serialization for all endpoints.",
            "html_url": "https://github.com/Rounak-2008/Rampart-/pull/99",
            "diff_url": "https://github.com/Rounak-2008/Rampart-/pull/99.diff",
            "state": "open",
            "changed_files": 2,
            "additions": 40,
            "deletions": 5,
            "user": {
                "id": 77771,
                "login": "newbie-hacker",
                "avatar_url": "https://github.com/newbie-hacker.png",
                "html_url": "https://github.com/newbie-hacker"
            }
        }
    }
    r = client.post(
        "/api/webhooks/github",
        headers={"X-GitHub-Event": "pull_request", "X-Hub-Signature-256": ""},
        json=pr_payload
    )
    check("POST /api/webhooks/github (pull_request opened)", r)

    print(f"\n==========================================")
    print(f"🎯 Test Results: {passed}/{total} endpoints passed!")
    print(f"==========================================")

    if passed == total:
        print("🚀 All endpoints operational and verified successfully!")
        return 0
    else:
        print("⚠️ Some endpoints failed.")
        return 1

if __name__ == "__main__":
    sys.exit(test_all_endpoints())
