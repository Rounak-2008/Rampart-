from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import CORS_ORIGINS
from app.database import init_db
from app.models import APIResponse

# Routers
from app.routes.dashboard import router as dashboard_router
from app.routes.repositories import router as repositories_router
from app.routes.pull_requests import router as pull_requests_router
from app.routes.contributors import router as contributors_router
from app.routes.trust import router as trust_router
from app.routes.alerts import router as alerts_router
from app.routes.notifications import router as notifications_router
from app.routes.webhooks import router as webhooks_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables and realistic seed data
    init_db()
    yield

app = FastAPI(
    title="RAMPART Trust Network API",
    description="Decentralized Trust Network for Open Source GitHub Contributors",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local frontend development (Claude Code frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Permissive for easy multi-port development
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route modules
app.include_router(dashboard_router)
app.include_router(repositories_router)
app.include_router(pull_requests_router)
app.include_router(contributors_router)
app.include_router(trust_router)
app.include_router(alerts_router)
app.include_router(notifications_router)
app.include_router(webhooks_router)

@app.get("/", response_model=APIResponse)
def root():
    return APIResponse(
        success=True,
        data={
            "service": "RAMPART API",
            "version": "1.0.0",
            "status": "operational",
            "docs_url": "/docs"
        },
        message="Welcome to RAMPART — Shared Trust Network for GitHub Contributors"
    )

@app.get("/api/health", response_model=APIResponse)
def health_check():
    return APIResponse(
        success=True,
        data={
            "status": "healthy",
            "endpoints": [
                "/api/dashboard/stats",
                "/api/dashboard/activity",
                "/api/repositories",
                "/api/pull-requests",
                "/api/contributors",
                "/api/trust/vouch",
                "/api/trust/denounce",
                "/api/trust/network-graph",
                "/api/alerts",
                "/api/notifications",
                "/api/webhooks/github"
            ]
        },
        message="RAMPART Backend is fully operational."
    )
