import sys
from pathlib import Path

# Set backend directory
BACKEND_DIR = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import uvicorn

if __name__ == "__main__":
    print("🛡️ Starting RAMPART Backend Server on http://127.0.0.1:8000 ...")
    print("📖 API Documentation: http://127.0.0.1:8000/docs")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
