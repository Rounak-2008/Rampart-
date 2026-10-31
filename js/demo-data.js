/**
 * RAMPART — Demo Data
 * Mock data for dashboard development. Clearly separated from API layer.
 * When backend is ready, replace APP.api calls with real endpoints.
 */

const DEMO_DATA = {
  metrics: {
    repositories: 8,
    activePullRequests: 24,
    contributorsTracked: 156,
    openAlerts: 5,
    totalVouches: 892,
    totalDenouncements: 12,
  },

  prActivity: [
    { date: "Nov 1", open: 8, merged: 16, closed: 2 },
    { date: "Oct 29", open: 6, merged: 12, closed: 3 },
    { date: "Oct 27", open: 7, merged: 19, closed: 1 },
    { date: "Oct 25", open: 5, merged: 14, closed: 2 },
    { date: "Oct 23", open: 9, merged: 18, closed: 4 },
    { date: "Oct 21", open: 7, merged: 11, closed: 2 },
    { date: "Oct 19", open: 6, merged: 15, closed: 3 },
  ],

  trustOverview: {
    trusted: 142,
    unknown: 12,
    flagged: 2,
    vouchRate: 87,
    flagRate: 2,
  },

  alerts: [
    {
      id: "alert-001",
      contributor: "@spam-bot-v2",
      repository: "react-utils",
      type: "Suspicious Pattern",
      severity: "high",
      date: "2 hours ago",
      message: "Multiple duplicate PRs in short time window",
    },
    {
      id: "alert-002",
      contributor: "@unknown-contributor",
      repository: "node-helpers",
      type: "No History",
      severity: "low",
      date: "5 hours ago",
      message: "First-time contributor, no cross-repo history",
    },
    {
      id: "alert-003",
      contributor: "@mass-merger",
      repository: "web-framework",
      type: "Bulk Merge Activity",
      severity: "medium",
      date: "12 hours ago",
      message: "Merged 8 PRs in 30 minutes by same user",
    },
    {
      id: "alert-004",
      contributor: "@test-account",
      repository: "utils-lib",
      type: "Generic Comments",
      severity: "low",
      date: "1 day ago",
      message: "Repetitive, minimal PR descriptions",
    },
    {
      id: "alert-005",
      contributor: "@malicious-pr",
      repository: "security-lib",
      type: "Suspicious Code Pattern",
      severity: "critical",
      date: "2 days ago",
      message: "Potential malware pattern detected by 3 other repos",
    },
  ],

  repositories: [
    {
      id: "repo-001",
      name: "react-utils",
      owner: "open-source-org",
      prs: 142,
      status: "active",
      lastSync: "5 min ago",
      contributors: 34,
    },
    {
      id: "repo-002",
      name: "node-helpers",
      owner: "community-dev",
      prs: 89,
      status: "active",
      lastSync: "12 min ago",
      contributors: 28,
    },
    {
      id: "repo-003",
      name: "web-framework",
      owner: "tech-collective",
      prs: 267,
      status: "active",
      lastSync: "2 min ago",
      contributors: 67,
    },
    {
      id: "repo-004",
      name: "utils-lib",
      owner: "helper-tools",
      prs: 45,
      status: "active",
      lastSync: "18 min ago",
      contributors: 15,
    },
    {
      id: "repo-005",
      name: "security-lib",
      owner: "secure-foundation",
      prs: 98,
      status: "active",
      lastSync: "3 min ago",
      contributors: 42,
    },
    {
      id: "repo-006",
      name: "data-pipeline",
      owner: "analytics-team",
      prs: 156,
      status: "active",
      lastSync: "8 min ago",
      contributors: 38,
    },
    {
      id: "repo-007",
      name: "api-gateway",
      owner: "microservices-org",
      prs: 203,
      status: "active",
      lastSync: "1 min ago",
      contributors: 51,
    },
    {
      id: "repo-008",
      name: "cli-tools",
      owner: "devops-squad",
      prs: 67,
      status: "active",
      lastSync: "25 min ago",
      contributors: 22,
    },
  ],

  recentActivity: [
    {
      type: "pr",
      action: "merged",
      contributor: "@alice-dev",
      repository: "react-utils",
      title: "Add useAsync hook improvements",
      time: "1 hour ago",
    },
    {
      type: "vouch",
      action: "vouched",
      contributor: "@bob-coder",
      repository: "node-helpers",
      message: "Excellent contributions, high code quality",
      time: "3 hours ago",
    },
    {
      type: "pr",
      action: "opened",
      contributor: "@carlos-dev",
      repository: "web-framework",
      title: "Fix memory leak in component lifecycle",
      time: "4 hours ago",
    },
    {
      type: "alert",
      action: "flagged",
      contributor: "@spam-bot-v2",
      repository: "react-utils",
      message: "Duplicate PR pattern detected",
      time: "5 hours ago",
    },
    {
      type: "pr",
      action: "merged",
      contributor: "@diana-frontend",
      repository: "web-framework",
      title: "Implement dark mode support",
      time: "6 hours ago",
    },
    {
      type: "vouch",
      action: "vouched",
      contributor: "@alice-dev",
      repository: "react-utils",
      message: "Consistent, reliable contributor",
      time: "8 hours ago",
    },
  ],

  trustedContributors: [
    { login: "@alice-dev", repos: 12, vouches: 45, avg: 4.8 },
    { login: "@bob-coder", repos: 8, vouches: 32, avg: 4.7 },
    { login: "@diana-frontend", repos: 15, vouches: 58, avg: 4.9 },
    { login: "@evan-backend", repos: 10, vouches: 38, avg: 4.6 },
  ],
};

/**
 * Utility: Get demo data as if it came from the API
 * When backend is ready, replace this with actual APP.api.get() calls
 */
const getDemoData = async (endpoint) => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  switch (endpoint) {
    case "/dashboard/metrics":
      return DEMO_DATA.metrics;
    case "/dashboard/pr-activity":
      return DEMO_DATA.prActivity;
    case "/dashboard/trust-overview":
      return DEMO_DATA.trustOverview;
    case "/dashboard/alerts":
      return DEMO_DATA.alerts;
    case "/repositories":
      return DEMO_DATA.repositories;
    case "/dashboard/activity":
      return DEMO_DATA.recentActivity;
    case "/dashboard/trusted-contributors":
      return DEMO_DATA.trustedContributors;
    default:
      throw new Error(`Unknown endpoint: ${endpoint}`);
  }
};
