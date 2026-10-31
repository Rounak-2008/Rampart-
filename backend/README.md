# RAMPART — Backend API Documentation & Integration Guide

Welcome to the **RAMPART** Backend. This backend powers the decentralized trust network for open-source GitHub contributors, managing repositories, pull requests, cross-repository contributor profiles, Vouch & Denounce records, evidence-based alerts, and the interactive trust graph.

---

## 🚀 Quickstart: Starting the Backend

### 1. Requirements
- Python 3.10+
- Dependencies: `pip install -r backend/requirements.txt` (FastAPI, Uvicorn, Pydantic, Httpx)

### 2. Run the Server
From the project root:
```bash
python3 run_backend.py
```
Or from inside `backend/`:
```bash
python3 run.py
```

The server starts locally at:
- **Base URL**: `http://127.0.0.1:8000`
- **Interactive Swagger Docs**: `http://127.0.0.1:8000/docs`
- **Alternative ReDoc**: `http://127.0.0.1:8000/redoc`
- **Health Check**: `GET http://127.0.0.1:8000/api/health`

---

## 🌐 CORS Configuration
CORS is fully enabled with permissive origins for seamless frontend development. You can serve the frontend with:
- VS Code Live Server on `http://127.0.0.1:5500` or `http://localhost:5500`
- Node/Vite/React dev server on `http://localhost:3000` or `http://127.0.0.1:3000`

---

## 📦 Standard Response Envelope
All API endpoints return JSON in the standard envelope:
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional status message"
}
```

---

## 🛠️ Complete API Reference for Frontend (Claude Code)

### 1. Dashboard (`/api/dashboard`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/dashboard/stats` | Global stats: total repos, open PRs, analyzed contributors, active alerts, total vouches/denounces, network health score. |
| `GET` | `/api/dashboard/activity` | Unified recent activity feed (new PRs, vouch/denounce events, alerts). |

### 2. Repositories (`/api/repositories`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/repositories` | List all connected repositories with open PR count and active alert count. |
| `POST` | `/api/repositories` | Connect a new repository. Body: `{"full_name": "owner/repo", "description": "...", "webhook_secret": "..."}`. |
| `DELETE` | `/api/repositories/{id}` | Disconnect a repository. |
| `POST` | `/api/repositories/{id}/sync` | Trigger an on-demand sync from GitHub REST API. |

### 3. Pull Requests (`/api/pull-requests`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/pull-requests` | List PRs. Supports query params: `?repo_id=1&risk_level=HIGH&state=open`. |
| `GET` | `/api/pull-requests/{id}` | Detailed PR view including contributor trust summary and list of active alerts. |
| `POST` | `/api/pull-requests/{id}/analyze` | Trigger or re-run pattern analysis on a specific PR. |

### 4. Contributors (`/api/contributors`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/contributors` | List all contributors. Supports query param: `?status=TRUSTED` (`NEW`, `TRUSTED`, `FLAGGED`, `NEUTRAL`, `MIXED`). |
| `GET` | `/api/contributors/{username}` | Contributor detailed profile including trust score, recent PRs, and all trust records. |
| `GET` | `/api/contributors/{username}/history` | Chronological list of contributions across all connected repositories. |

### 5. Trust System: Vouch & Denounce (`/api/trust`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/trust/vouch` | Submit an evidence-backed vouch for a contributor. |
| `POST` | `/api/trust/denounce` | Submit an evidence-backed denouncement for abusive/spam activity. Automatically flags open PRs and lowers trust score. |
| `GET` | `/api/trust/records` | Query trust records. Supports `?contributor_username=alex-dev&type=VOUCH`. |
| `GET` | `/api/trust/network-graph` | Complete nodes and edges dataset formatted for rendering network graph visualizations (e.g., Vis.js, D3, Cytoscape). |

#### Vouch Request Body:
```json
{
  "contributor_username": "alex-dev",
  "repo_id": 1,
  "category": "QUALITY_CONTRIBUTION",
  "reason": "Outstanding test harness design and zero regressions during release audit.",
  "evidence_url": "https://github.com/Rounak-2008/Rampart-/commit/e728491",
  "author_username": "maintainer"
}
```

#### Denounce Request Body:
```json
{
  "contributor_username": "pr-spammer99",
  "repo_id": 1,
  "category": "CROSS_REPO_SPAM",
  "reason": "Submitted scripted non-functional white-space modifications across multiple forks simultaneously.",
  "evidence_url": "https://github.com/Rounak-2008/Rampart-/pull/15",
  "author_username": "maintainer"
}
```

### 6. Alerts (`/api/alerts`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/alerts` | List alerts. Filter with `?severity=CRITICAL&is_resolved=false`. |
| `PATCH` | `/api/alerts/{id}/resolve` | Mark an alert as resolved. Body (optional): `{"resolved_by": "username"}`. |

### 7. Notifications (`/api/notifications`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/notifications` | List unread and recent notifications. |
| `PATCH` | `/api/notifications/{id}/read` | Mark a specific notification as read. |
| `POST` | `/api/notifications/mark-all-read` | Mark all notifications as read. |

### 8. Webhooks (`/api/webhooks`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/webhooks/github` | Receives live GitHub webhook events (`pull_request`, `ping`) with optional HMAC SHA256 signature verification. |

---

## 🗄️ Database & Initial Seed Data
The backend uses SQLite (`backend/rampart.db`). On first startup, it automatically provisions tables and seeds realistic data:
- **3 Repositories**: `Rounak-2008/Rampart-`, `open-source-foundation/core-gateway`, `decentralized-id/auth-hub`.
- **5 Realistic Contributors**:
  - `alex-dev` (Trusted, score 94, vouched by multiple repos)
  - `sarah-codes` (Trusted, score 88)
  - `newbie-hacker` (New/Unknown, score 50, strictly neutral baseline)
  - `pr-spammer99` (Flagged, score 18, 2 denouncements with evidence)
  - `code-ninja42` (Neutral, score 50)
- **6 Pull Requests & Active Alerts** representing each scenario.

---

## 🧪 Testing All Endpoints
Run the automated test suite anytime:
```bash
python3 backend/test_api.py
```
Outputs status of all 24 endpoints.
