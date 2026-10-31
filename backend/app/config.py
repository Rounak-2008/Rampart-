import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DB_PATH = os.getenv("RAMPART_DB_PATH", str(BASE_DIR / "rampart.db"))
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", os.getenv("GH_TOKEN", ""))
WEBHOOK_SECRET = os.getenv("RAMPART_WEBHOOK_SECRET", "rampart-shared-secret-key")

CORS_ORIGINS = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]
