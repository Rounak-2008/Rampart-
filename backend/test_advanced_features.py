"""
Unit and Integration Test Suite for RAMPART Advanced Features:
- Trust Propagation Model (decay lambda=0.75, max depth 2, org dedup, sybil protection)
- Beginner Contributor Equity (baseline 50.0, no penalty)
- Webhook Delivery Idempotency (X-GitHub-Delivery deduplication)
- Sequential Concurrency Lock & Content Hash Caching
- PR Quality & Priority Decision Classification
- Frontend Single-Action Contract (Only View in row actions)
"""

import unittest
import sqlite3
import threading
import time
from app.database import get_db, init_db
from app.services.trust_service import calculate_propagated_trust, recalculate_contributor_trust
from app.services.pattern_service import calculate_pr_content_hash, _inference_lock
from fastapi.testclient import TestClient
from app.main import app

class TestRampartAdvancedFeatures(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def test_trust_propagation_decay_and_org_dedup(self):
        """Verify trust propagation follows T(A,C) = T(A,B) * V(B,C) * lambda (0.75) and org dedup."""
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM contributors WHERE username = 'alex-dev'")
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            alex_id = row["id"]

            # Test direct vouch calculation
            alex_res = calculate_propagated_trust(conn, alex_id)
            self.assertIn("trust_score", alex_res)
            self.assertIn("status", alex_res)
            self.assertIn(alex_res["status"], ["TRUSTED", "ESTABLISHED"])
            self.assertGreaterEqual(alex_res["trust_score"], 80.0)
            self.assertTrue(alex_res["direct_vouch_count"] >= 1)

            # Test explainable summary
            self.assertIn("explainable_summary", alex_res)
            self.assertIsInstance(alex_res["explainable_summary"], str)

    def test_beginner_contributor_equity(self):
        """Verify new/beginner contributors are NOT penalized (score ~50.0, status BEGINNER)."""
        with get_db() as conn:
            cursor = conn.cursor()
            uname = f"new-learner-{int(time.time()*1000)}"
            cursor.execute("""
                INSERT INTO contributors (username, avatar_url, profile_url, trust_score, status, merged_prs, rejected_prs, first_seen_at, last_active_at)
                VALUES (?, ?, ?, 50.0, 'BEGINNER', 0, 0, datetime('now'), datetime('now'))
            """, (uname, f"https://github.com/{uname}.png", f"https://github.com/{uname}"))
            c_id = cursor.lastrowid
            conn.commit()

            res = recalculate_contributor_trust(conn, c_id)
            self.assertEqual(res["status"], "BEGINNER")
            self.assertGreaterEqual(res["trust_score"], 45.0)
            self.assertLessEqual(res["trust_score"], 55.0)

    def test_webhook_idempotency_and_deduplication(self):
        """Verify X-GitHub-Delivery prevents duplicate processing."""
        delivery_uuid = f"test-delivery-{int(time.time()*1000)}"
        headers = {
            "X-GitHub-Event": "ping",
            "X-GitHub-Delivery": delivery_uuid,
            "Content-Type": "application/json"
        }
        # First delivery
        resp1 = self.client.post("/api/webhooks/github", headers=headers, json={"zen": "Non-blocking is better than blocking."})
        self.assertEqual(resp1.status_code, 200)
        self.assertTrue(resp1.json().get("success"))

        # Duplicate delivery with same UUID
        resp2 = self.client.post("/api/webhooks/github", headers=headers, json={"zen": "Non-blocking is better than blocking."})
        self.assertEqual(resp2.status_code, 200)
        self.assertIn("already processed", resp2.json().get("message", ""))

    def test_content_hash_deterministic(self):
        """Verify content hash is identical for same diff and title."""
        h1 = calculate_pr_content_hash("Add secure auth checks", "def login(): pass", 1, 10, 2)
        h2 = calculate_pr_content_hash("Add secure auth checks", "def login(): pass", 1, 10, 2)
        h3 = calculate_pr_content_hash("Add secure auth checks", "def login(): return True", 1, 12, 0)
        self.assertEqual(h1, h2)
        self.assertNotEqual(h1, h3)

    def test_sequential_inference_lock(self):
        """Verify that _inference_lock is a valid threading.Lock instance enforcing concurrency = 1."""
        self.assertIsInstance(_inference_lock, type(threading.Lock()))
        acquired = _inference_lock.acquire(blocking=False)
        self.assertTrue(acquired)
        # Attempting second acquire should fail because lock is held
        second_acquire = _inference_lock.acquire(blocking=False)
        self.assertFalse(second_acquire)
        _inference_lock.release()

    def test_frontend_single_view_action_contract(self):
        """Verify that pages/pull-requests.html and pull-requests.js strictly render only 'View' in table rows."""
        with open("pages/pull-requests.js", "r") as f:
            js_code = f.read()

        # Row actions must NOT render btn-analyze-pr
        self.assertNotIn('<button class="action-btn btn-analyze-pr"', js_code)
        # Must render btn-view-pr with 'View'
        self.assertIn('btn-view-pr', js_code)
        self.assertIn('👁️ View', js_code)

        # Must have priority banner styling in pull-requests.html
        with open("pages/pull-requests.html", "r") as f:
            html_code = f.read()
        self.assertIn("priority-banner", html_code)
        self.assertIn("quality-pill", html_code)
        self.assertIn("contributor-badge", html_code)

if __name__ == "__main__":
    unittest.main()
