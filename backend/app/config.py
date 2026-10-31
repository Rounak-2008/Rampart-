import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Automatically load environment variables from backend/.env or root .env
for env_path in [BASE_DIR / ".env", BASE_DIR.parent / ".env"]:
    if env_path.is_file():
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'\"")
                        if k not in os.environ:
                            os.environ[k] = v
        except Exception:
            pass

DB_PATH = os.getenv("RAMPART_DB_PATH", str(BASE_DIR / "rampart.db"))
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", os.getenv("GH_TOKEN", ""))
WEBHOOK_SECRET = os.getenv("RAMPART_WEBHOOK_SECRET", "rampart-shared-secret-key")
LOCAL_LLM_URL = os.getenv("LOCAL_LLM_URL", "http://100.91.162.71:11434/v1")
LOCAL_LLM_MODEL = os.getenv("LOCAL_LLM_MODEL", "gemma4:26b-mlx")

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
