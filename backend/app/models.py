from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, List, Any, Dict
from datetime import datetime

class APIResponse(BaseModel):
    success: bool = True
    data: Optional[Any] = None
    message: Optional[str] = None

# Repositories
class RepositoryCreate(BaseModel):
    full_name: Optional[str] = None
    owner: Optional[str] = None
    repo: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    webhook_secret: Optional[str] = None

class RepositoryResponse(BaseModel):
    id: int
    github_repo_id: Optional[int] = None
    owner: str
    name: str
    full_name: str
    description: Optional[str] = None
    html_url: Optional[str] = None
    default_branch: str = "main"
    is_active: bool = True
    status: str = "active" # Frontend compatibility
    last_synced_at: Optional[str] = None
    last_sync: Optional[str] = None # Frontend alias
    created_at: str
    open_prs: Optional[int] = 0 # Frontend alias
    open_prs_count: Optional[int] = 0
    alerts_count: Optional[int] = 0
    alert_count: Optional[int] = 0 # Frontend alias
    contributor_count: Optional[int] = 0 # Frontend compatibility
    prs: Optional[int] = 0 # Frontend alias

# Contributors
class ContributorResponse(BaseModel):
    id: int
    github_id: Optional[int] = None
    username: str
    avatar_url: Optional[str] = None
    profile_url: Optional[str] = None
    trust_score: float
    status: str # NEW, TRUSTED, FLAGGED, NEUTRAL, MIXED
    total_prs: int
    vouches_count: int
    denounces_count: int
    first_seen_at: str
    last_active_at: str

class ContributorHistoryItem(BaseModel):
    pr_id: int
    repo_full_name: str
    pr_number: int
    title: str
    state: str
    risk_level: str
    created_at: str

class ContributorDetailResponse(ContributorResponse):
    recent_prs: List[ContributorHistoryItem] = []
    trust_records: List[Dict[str, Any]] = []

# Pull Requests
class PullRequestResponse(BaseModel):
    id: int
    github_pr_id: Optional[int] = None
    repo_id: int
    repo_full_name: str
    repository: Optional[str] = None # Frontend alias
    contributor_id: int
    contributor_username: str
    author: Optional[str] = None # Frontend alias
    contributor_avatar_url: Optional[str] = None
    contributor_trust_score: float
    contributor_status: str
    pr_number: int
    number: Optional[int] = None # Frontend alias
    title: str
    body: Optional[str] = None
    description: Optional[str] = None # Frontend alias
    html_url: Optional[str] = None
    diff_url: Optional[str] = None
    state: str
    status: Optional[str] = None # Frontend alias ("open", "merged", "closed")
    risk_level: str
    review_status: Optional[str] = "pending" # Frontend compatibility ("pending", "approved", "changes_requested")
    analysis_summary: Optional[str] = None
    files_changed: int = 1
    additions: int = 0
    deletions: int = 0
    commits: Optional[int] = 1 # Frontend compatibility
    created_at: str
    updated_at: Optional[str] = None

class PullRequestDetailResponse(PullRequestResponse):
    contributor_vouches: int = 0
    contributor_denounces: int = 0
    active_alerts: List[Dict[str, Any]] = []
    reviews: List[Dict[str, Any]] = []

# PR Analysis findings
class AnalysisFinding(BaseModel):
    title: str
    description: str
    evidence: Optional[str] = None
    severity: str # "warning", "caution", "info"

class PullRequestAnalysisResult(BaseModel):
    pr_id: int
    risk_level: str
    analysis_summary: str
    vouches_count: int = 0
    denounces_count: int = 0
    generated_alerts: List[str] = []
    findings: List[AnalysisFinding] = []

# Trust Records (Vouch / Denounce)
class VouchCreate(BaseModel):
    contributor_username: str
    repo_id: Optional[int] = None
    category: str = Field(..., example="QUALITY_CONTRIBUTION")
    reason: str = Field(..., min_length=10, description="Detailed explanation of positive experience")
    evidence_url: str = Field(..., description="Link to commit, PR, or discussion evidence")
    author_username: Optional[str] = "maintainer"

class DenounceCreate(BaseModel):
    contributor_username: str
    repo_id: Optional[int] = None
    category: str = Field(..., example="CROSS_REPO_SPAM")
    reason: str = Field(..., min_length=10, description="Detailed evidence-backed explanation")
    evidence_url: str = Field(..., description="Link to spam PRs or abusive evidence")
    author_username: Optional[str] = "maintainer"

class TrustRecordResponse(BaseModel):
    id: int
    contributor_id: int
    contributor_username: str
    repo_id: Optional[int] = None
    repo_full_name: Optional[str] = None
    author_username: str
    type: str # VOUCH or DENOUNCE
    category: str
    reason: str
    evidence_url: str
    created_at: str

# Trust Network Graph
class NetworkGraphNode(BaseModel):
    id: str
    label: str
    type: str # repository, contributor, maintainer
    trust_score: Optional[float] = None
    status: Optional[str] = None
    avatar_url: Optional[str] = None

class NetworkGraphEdge(BaseModel):
    source: str
    target: str
    type: str # VOUCH, DENOUNCE, CONTRIBUTED_TO
    weight: float
    category: Optional[str] = None
    reason: Optional[str] = None

class NetworkGraphResponse(BaseModel):
    nodes: List[NetworkGraphNode]
    edges: List[NetworkGraphEdge]

# Alerts
class AlertResponse(BaseModel):
    id: int
    repo_id: Optional[int] = None
    repo_full_name: Optional[str] = None
    repository: Optional[str] = None # Frontend alias
    pr_id: Optional[int] = None
    pr_number: Optional[int] = None
    pr_title: Optional[str] = None
    contributor_id: int
    contributor_username: str
    contributor: Optional[str] = None # Frontend alias (@username)
    type: Optional[str] = None # Frontend alias
    severity: str # INFO, WARNING, CRITICAL
    pattern_type: str
    message: str
    evidence_details: Optional[str] = None
    is_resolved: bool
    resolved_by: Optional[str] = None
    resolved_at: Optional[str] = None
    created_at: str
    date: Optional[str] = None # Frontend alias

class AlertResolveRequest(BaseModel):
    resolved_by: Optional[str] = "maintainer"

# Notifications
class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    message: str
    link_url: Optional[str] = None
    is_read: bool
    created_at: str

# Dashboard
class DashboardStatsResponse(BaseModel):
    total_repositories: int
    repositories: Optional[int] = None # Frontend alias
    active_pull_requests: int
    activePullRequests: Optional[int] = None # Frontend alias
    analyzed_contributors: int
    contributorsTracked: Optional[int] = None # Frontend alias
    active_alerts: int
    openAlerts: Optional[int] = None # Frontend alias
    total_vouches: int
    totalVouches: Optional[int] = None # Frontend alias
    total_denouncements: int
    totalDenouncements: Optional[int] = None # Frontend alias
    network_health_score: float

class ActivityItem(BaseModel):
    id: int
    type: str # PR, VOUCH, DENOUNCE, ALERT
    action: Optional[str] = None # Frontend alias
    title: str
    subtitle: Optional[str] = None
    message: Optional[str] = None # Frontend alias
    timestamp: str
    time: Optional[str] = None # Frontend alias
    severity: Optional[str] = None
    link: Optional[str] = None
    contributor: Optional[str] = None # Frontend alias
    repository: Optional[str] = None # Frontend alias

class DashboardActivityResponse(BaseModel):
    activities: List[ActivityItem]
