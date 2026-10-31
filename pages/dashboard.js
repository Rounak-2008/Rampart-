/**
 * RAMPART Dashboard
 * Renders dashboard sections from real FastAPI backend API
 */

const DASHBOARD = (() => {
  let data = {};

  const init = async () => {
    try {
      await loadData();
      renderMetrics();
      renderPRChart();
      renderTrustOverview();
      renderTrustedContributors();
      renderAlerts();
      renderRepositories();
      renderActivity();
    } catch (error) {
      console.error("Dashboard error:", error);
      showError("Failed to load dashboard data from backend. Please ensure http://127.0.0.1:8000 is running.");
    }
  };

  const loadData = async () => {
    try {
      // Connect to real FastAPI backend endpoints
      const [metrics, prActivity, trustOverview, alerts, repositories, activity, trustedContributors] =
        await Promise.all([
          APP.api.get("/dashboard/metrics"),
          APP.api.get("/dashboard/pr-activity"),
          APP.api.get("/dashboard/trust-overview"),
          APP.api.get("/dashboard/alerts"),
          APP.api.get("/repositories"),
          APP.api.get("/dashboard/activity"),
          APP.api.get("/dashboard/trusted-contributors"),
        ]);

      data.metrics = metrics || {};
      data.prActivity = Array.isArray(prActivity) ? prActivity : [];
      data.trustOverview = trustOverview || { trusted: 0, unknown: 0, flagged: 0 };
      data.alerts = Array.isArray(alerts) ? alerts : [];
      data.repositories = Array.isArray(repositories) ? repositories : [];
      data.activity = Array.isArray(activity) ? activity : [];
      data.trustedContributors = Array.isArray(trustedContributors) ? trustedContributors : [];
    } catch (apiError) {
      console.warn("Backend API unavailable, checking demo fallback:", apiError);
      if (typeof getDemoData === "function") {
        showWarning("Notice: Showing offline demo data. Start the backend with 'python3 run_backend.py' for live data.");
        data.metrics = await getDemoData("/dashboard/metrics");
        data.prActivity = await getDemoData("/dashboard/pr-activity");
        data.trustOverview = await getDemoData("/dashboard/trust-overview");
        data.alerts = await getDemoData("/dashboard/alerts");
        data.repositories = await getDemoData("/repositories");
        data.activity = await getDemoData("/dashboard/activity");
        data.trustedContributors = await getDemoData("/dashboard/trusted-contributors");
      } else {
        throw apiError;
      }
    }
  };

  /**
   * Render Metrics Overview Cards
   */
  const renderMetrics = () => {
    const container = document.getElementById("metrics-container");
    const metrics = data.metrics || {};

    const cards = [
      {
        label: "Connected Repositories",
        value: metrics.repositories ?? metrics.total_repositories ?? 0,
        change: "Active network repos",
      },
      {
        label: "Active Pull Requests",
        value: metrics.activePullRequests ?? metrics.active_pull_requests ?? 0,
        change: "Monitored across repos",
      },
      {
        label: "Contributors Tracked",
        value: metrics.contributorsTracked ?? metrics.analyzed_contributors ?? 0,
        change: "Profiles verified",
      },
      {
        label: "Open Alerts",
        value: metrics.openAlerts ?? metrics.active_alerts ?? 0,
        change: (metrics.openAlerts || metrics.active_alerts) ? "Requires review" : "All clean",
        negative: (metrics.openAlerts || metrics.active_alerts) > 0,
      },
      {
        label: "Total Vouches",
        value: metrics.totalVouches ?? metrics.total_vouches ?? 0,
        change: "Peer recommendations",
      },
      {
        label: "Flagged Activity",
        value: metrics.totalDenouncements ?? metrics.total_denouncements ?? 0,
        change: (metrics.totalDenouncements || metrics.total_denouncements) ? "Evidence recorded" : "No active flags",
        negative: (metrics.totalDenouncements || metrics.total_denouncements) > 0,
      },
    ];

    container.innerHTML = cards
      .map(
        (card) => `
      <div class="metric-card">
        <div class="metric-label">${card.label}</div>
        <div class="metric-value">${(card.value || 0).toLocaleString()}</div>
        <div class="metric-change ${card.negative ? "negative" : ""}">
          ${card.change}
        </div>
      </div>
    `
      )
      .join("");
  };

  /**
   * Render PR Activity Chart (SVG Bar Chart)
   */
  const renderPRChart = () => {
    const container = document.getElementById("pr-chart");
    const prActivity = data.prActivity || [];

    if (prActivity.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">No pull request activity recorded yet.</div>';
      return;
    }

    // Find max value for scaling
    const maxValue = Math.max(
      1,
      ...prActivity.map((d) => (d.open || 0) + (d.merged || 0) + (d.closed || 0))
    );
    const chartHeight = 220;
    const barWidth = 36;
    const groupGap = 20;
    const barGap = 6;
    const padding = 40;
    const width = prActivity.length * (groupGap + barWidth * 3 + barGap * 2) + padding * 2;

    let svg = `<svg viewBox="0 0 ${width} ${chartHeight + padding * 2}" class="bar-chart" style="width: 100%; height: auto;">`;

    // Y-axis labels
    svg += `<text x="${padding - 10}" y="${padding + 10}" text-anchor="end" class="bar-chart__label">
      ${maxValue}
    </text>`;
    svg += `<text x="${padding - 10}" y="${chartHeight + padding}" text-anchor="end" class="bar-chart__label">
      0
    </text>`;

    // Grid lines
    svg += `<line x1="${padding}" y1="${chartHeight / 2 + padding}" x2="${width - padding}" y2="${chartHeight / 2 + padding}" stroke="var(--color-border)" stroke-width="1"/>`;
    svg += `<line x1="${padding}" y1="${chartHeight + padding}" x2="${width - padding}" y2="${chartHeight + padding}" stroke="var(--color-border)" stroke-width="1"/>`;

    // Bars
    prActivity.forEach((item, idx) => {
      const x = padding + idx * (groupGap + barWidth * 3 + barGap * 2);

      // Open (Blue)
      const openHeight = ((item.open || 0) / maxValue) * chartHeight;
      svg += `<rect x="${x}" y="${chartHeight + padding - openHeight}" width="${barWidth}" height="${Math.max(2, openHeight)}" rx="3" fill="var(--color-info)" opacity="0.85" class="bar-chart__bar"><title>Open: ${item.open}</title></rect>`;

      // Merged (Green)
      const mergedHeight = ((item.merged || 0) / maxValue) * chartHeight;
      svg += `<rect x="${x + barWidth + barGap}" y="${chartHeight + padding - mergedHeight}" width="${barWidth}" height="${Math.max(2, mergedHeight)}" rx="3" fill="var(--color-success)" opacity="0.85" class="bar-chart__bar"><title>Merged: ${item.merged}</title></rect>`;

      // Closed (Red)
      const closedHeight = ((item.closed || 0) / maxValue) * chartHeight;
      svg += `<rect x="${x + (barWidth + barGap) * 2}" y="${chartHeight + padding - closedHeight}" width="${barWidth}" height="${Math.max(2, closedHeight)}" rx="3" fill="var(--color-danger)" opacity="0.85" class="bar-chart__bar"><title>Closed: ${item.closed}</title></rect>`;

      // X-axis label
      svg += `<text x="${x + barWidth * 1.5}" y="${chartHeight + padding + 22}" text-anchor="middle" class="bar-chart__label" fill="var(--color-text-secondary)" font-size="11">
        ${item.date}
      </text>`;
    });

    // Legend
    const legendY = chartHeight + padding + 45;
    svg += `<circle cx="${padding}" cy="${legendY}" r="4" fill="var(--color-info)"/>`;
    svg += `<text x="${padding + 10}" y="${legendY + 4}" font-size="12" fill="var(--color-text-secondary)">Open</text>`;

    svg += `<circle cx="${padding + 80}" cy="${legendY}" r="4" fill="var(--color-success)"/>`;
    svg += `<text x="${padding + 90}" y="${legendY + 4}" font-size="12" fill="var(--color-text-secondary)">Merged</text>`;

    svg += `<circle cx="${padding + 170}" cy="${legendY}" r="4" fill="var(--color-danger)"/>`;
    svg += `<text x="${padding + 180}" y="${legendY + 4}" font-size="12" fill="var(--color-text-secondary)">Closed</text>`;

    svg += `</svg>`;

    container.innerHTML = svg;
  };

  /**
   * Render Trust Overview Stats
   */
  const renderTrustOverview = () => {
    const container = document.getElementById("trust-container");
    const { trustOverview } = data;

    const stats = [
      { number: trustOverview.trusted || 0, label: "Trusted Contributors" },
      { number: trustOverview.unknown || 0, label: "New / Unknown" },
      { number: trustOverview.flagged || 0, label: "Flagged With Alerts" },
    ];

    container.innerHTML = stats
      .map(
        (stat) => `
      <div class="trust-stat">
        <div class="trust-stat__number">${stat.number}</div>
        <div class="trust-stat__label">${stat.label}</div>
      </div>
    `
      )
      .join("");
  };

  /**
   * Render Top Trusted Contributors
   */
  const renderTrustedContributors = () => {
    const tbody = document.getElementById("trusted-tbody");
    const { trustedContributors } = data;

    if (!trustedContributors || trustedContributors.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: var(--space-4); color: var(--color-text-secondary);">No vouched contributors yet</td></tr>';
      return;
    }

    tbody.innerHTML = trustedContributors
      .map(
        (contrib) => `
      <tr>
        <td>
          <span style="font-weight: var(--font-weight-medium); color: var(--color-primary);">
            ${escapeHtml(contrib.login)}
          </span>
        </td>
        <td>${contrib.repos}</td>
        <td>
          <span style="font-weight: var(--font-weight-semibold); color: var(--color-success);">
            ${contrib.vouches}
          </span>
        </td>
      </tr>
    `
      )
      .join("");
  };

  /**
   * Render Recent Alerts
   */
  const renderAlerts = () => {
    const tbody = document.getElementById("alerts-tbody");
    const { alerts } = data;

    if (!alerts || alerts.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">No active alerts at this time. All repositories clean!</td></tr>';
      return;
    }

    tbody.innerHTML = alerts
      .map(
        (alert) => `
      <tr>
        <td>
          <span class="alert-contributor">${escapeHtml(alert.contributor)}</span>
        </td>
        <td>${escapeHtml(alert.repository)}</td>
        <td>${escapeHtml(alert.type || alert.pattern_type || "Alert")}</td>
        <td>
          <span class="alert-severity ${escapeHtml(alert.severity || "info")}">
            ${escapeHtml((alert.severity || "info").toUpperCase())}
          </span>
        </td>
        <td>${escapeHtml(alert.date || "Recent")}</td>
        <td>
          <a href="pull-requests.html" class="alert-row-action" title="View in Pull Requests">→</a>
        </td>
      </tr>
    `
      )
      .join("");
  };

  /**
   * Render Connected Repositories
   */
  const renderRepositories = () => {
    const container = document.getElementById("repos-container");
    const { repositories } = data;

    if (!repositories || repositories.length === 0) {
      container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">No connected repositories. Click "Connect Repository" to add one!</div>';
      return;
    }

    container.innerHTML = repositories
      .map((repo) => {
        const prCount = repo.prs ?? repo.open_prs ?? repo.open_prs_count ?? 0;
        const contribCount = repo.contributors ?? repo.contributor_count ?? "—";
        const syncText = repo.lastSync ?? (repo.last_synced_at ? new Date(repo.last_synced_at).toLocaleDateString() : "Never");
        const statusText = repo.status || (repo.is_active ? "active" : "inactive");

        return `
      <div class="repo-card">
        <div class="repo-header">
          <div>
            <div class="repo-name">${escapeHtml(repo.name)}</div>
            <div class="repo-owner">${escapeHtml(repo.owner)}</div>
          </div>
          <div class="repo-status ${statusText === "active" ? "" : "inactive"}">${statusText.toUpperCase()}</div>
        </div>

        <div class="repo-stats">
          <div class="repo-stat">
            <div class="repo-stat-label">Open PRs</div>
            <div class="repo-stat-value">${prCount}</div>
          </div>
          <div class="repo-stat">
            <div class="repo-stat-label">Contributors</div>
            <div class="repo-stat-value">${contribCount}</div>
          </div>
        </div>

        <div class="repo-sync">Last sync: ${escapeHtml(syncText)}</div>
      </div>
    `;
      })
      .join("");
  };

  /**
   * Render Recent Activity Timeline
   */
  const renderActivity = () => {
    const container = document.getElementById("activity-container");
    const { activity } = data;

    if (!activity || activity.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: var(--space-4); color: var(--color-text-secondary);">No recent activity recorded.</div>';
      return;
    }

    const typeEmojis = {
      pr: "🔀",
      vouch: "✓",
      alert: "⚠️",
    };

    const typeColors = {
      pr: "pr",
      vouch: "vouch",
      alert: "alert",
    };

    container.innerHTML = activity
      .map(
        (item) => `
      <div class="activity-item">
        <div class="activity-icon ${typeColors[item.type] || "pr"}">
          ${typeEmojis[item.type] || "•"}
        </div>
        <div class="activity-content">
          <div class="activity-title">
            ${escapeHtml(item.title || "")}
          </div>
          <div class="activity-detail">
            ${escapeHtml(item.subtitle || item.message || item.repository || "")}
          </div>
          <div class="activity-time">${escapeHtml(item.time || item.timestamp || "Recent")}</div>
        </div>
      </div>
    `
      )
      .join("");
  };

  const showError = (message) => {
    const container = document.querySelector(".app-main__inner");
    if (!container) return;
    const errorAlert = document.createElement("div");
    errorAlert.className = "alert alert-danger";
    errorAlert.innerHTML = `
      <div class="alert__icon">✕</div>
      <div class="alert__content">
        <div class="alert__title">Backend Connection Error</div>
        <div class="alert__message">${escapeHtml(message)}</div>
      </div>
    `;
    container.insertBefore(errorAlert, container.firstChild);
  };

  const showWarning = (message) => {
    const container = document.querySelector(".app-main__inner");
    if (!container) return;
    const warnAlert = document.createElement("div");
    warnAlert.className = "alert alert-warning";
    warnAlert.innerHTML = `
      <div class="alert__icon">⚠️</div>
      <div class="alert__content">
        <div class="alert__message">${escapeHtml(message)}</div>
      </div>
    `;
    container.insertBefore(warnAlert, container.firstChild);
  };

  const escapeHtml = (text) => {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  };

  return {
    init,
  };
})();

// Initialize on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", DASHBOARD.init);
} else {
  DASHBOARD.init();
}
