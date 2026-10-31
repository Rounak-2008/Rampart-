/**
 * RAMPART Dashboard
 * Renders dashboard sections from demo data or API calls
 */

const DASHBOARD = (() => {
  let data = {};

  const init = async () => {
    try {
      // Load data (demo for now, replace with API calls later)
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
      showError("Failed to load dashboard");
    }
  };

  const loadData = async () => {
    // Use demo data for now
    // Later: Replace with APP.api.get() calls
    data.metrics = await getDemoData("/dashboard/metrics");
    data.prActivity = await getDemoData("/dashboard/pr-activity");
    data.trustOverview = await getDemoData("/dashboard/trust-overview");
    data.alerts = await getDemoData("/dashboard/alerts");
    data.repositories = await getDemoData("/repositories");
    data.activity = await getDemoData("/dashboard/activity");
    data.trustedContributors = await getDemoData(
      "/dashboard/trusted-contributors"
    );
  };

  /**
   * Render Metrics Overview Cards
   */
  const renderMetrics = () => {
    const container = document.getElementById("metrics-container");
    const { metrics } = data;

    const cards = [
      {
        label: "Connected Repositories",
        value: metrics.repositories,
        change: "+2 this month",
      },
      {
        label: "Active Pull Requests",
        value: metrics.activePullRequests,
        change: "+5 today",
      },
      {
        label: "Contributors Tracked",
        value: metrics.contributorsTracked,
        change: "+12 this week",
      },
      {
        label: "Open Alerts",
        value: metrics.openAlerts,
        change: "-1 resolved",
        negative: true,
      },
      {
        label: "Total Vouches",
        value: metrics.totalVouches,
        change: "+24 this month",
      },
      {
        label: "Flagged Activity",
        value: metrics.totalDenouncements,
        change: "+2 this month",
        negative: true,
      },
    ];

    container.innerHTML = cards
      .map(
        (card) => `
      <div class="metric-card">
        <div class="metric-label">${card.label}</div>
        <div class="metric-value">${card.value.toLocaleString()}</div>
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
    const { prActivity } = data;

    // Find max value for scaling
    const maxValue = Math.max(
      ...prActivity.map((d) => d.open + d.merged + d.closed)
    );
    const chartHeight = 250;
    const barWidth = 40;
    const groupGap = 20;
    const barGap = 8;
    const padding = 40;
    const width = prActivity.length * (groupGap + barWidth * 3 + barGap * 2) + padding * 2;

    let svg = `<svg viewBox="0 0 ${width} ${chartHeight + padding * 2}" class="bar-chart">`;

    // Y-axis labels
    svg += `<text x="${padding - 10}" y="${padding}" text-anchor="end" class="bar-chart__label">
      ${(maxValue / 2).toFixed(0)}
    </text>`;
    svg += `<text x="${padding - 10}" y="${chartHeight + padding}" text-anchor="end" class="bar-chart__label">
      0
    </text>`;

    // Grid lines
    svg += `<line x1="${padding}" y1="${chartHeight / 2 + padding}" x2="${width - padding}" y2="${chartHeight / 2 + padding}" stroke="var(--color-border)" stroke-width="1"/>`;

    // Bars
    prActivity.forEach((item, idx) => {
      const x = padding + idx * (groupGap + barWidth * 3 + barGap * 2);

      // Open (Blue)
      const openHeight = (item.open / maxValue) * chartHeight;
      svg += `<rect x="${x}" y="${chartHeight + padding - openHeight}" width="${barWidth}" height="${openHeight}" fill="var(--color-info)" opacity="0.8" class="bar-chart__bar"/>`;

      // Merged (Green)
      const mergedHeight = (item.merged / maxValue) * chartHeight;
      svg += `<rect x="${x + barWidth + barGap}" y="${chartHeight + padding - mergedHeight}" width="${barWidth}" height="${mergedHeight}" fill="var(--color-success)" opacity="0.8" class="bar-chart__bar"/>`;

      // Closed (Red)
      const closedHeight = (item.closed / maxValue) * chartHeight;
      svg += `<rect x="${x + (barWidth + barGap) * 2}" y="${chartHeight + padding - closedHeight}" width="${barWidth}" height="${closedHeight}" fill="var(--color-danger)" opacity="0.8" class="bar-chart__bar"/>`;

      // X-axis label
      svg += `<text x="${x + barWidth}" y="${chartHeight + padding + 20}" text-anchor="middle" class="bar-chart__label">
        ${item.date}
      </text>`;
    });

    // Legend
    const legendY = chartHeight + padding + 45;
    svg += `<circle cx="${padding}" cy="${legendY}" r="3" fill="var(--color-info)"/>`;
    svg += `<text x="${padding + 12}" y="${legendY + 3}" font-size="12" fill="var(--color-text-secondary)">Open</text>`;

    svg += `<circle cx="${padding + 120}" cy="${legendY}" r="3" fill="var(--color-success)"/>`;
    svg += `<text x="${padding + 132}" y="${legendY + 3}" font-size="12" fill="var(--color-text-secondary)">Merged</text>`;

    svg += `<circle cx="${padding + 260}" cy="${legendY}" r="3" fill="var(--color-danger)"/>`;
    svg += `<text x="${padding + 272}" y="${legendY + 3}" font-size="12" fill="var(--color-text-secondary)">Closed</text>`;

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
      { number: trustOverview.trusted, label: "Trusted Contributors" },
      { number: trustOverview.unknown, label: "New/Unknown" },
      { number: trustOverview.flagged, label: "With Alerts" },
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

    tbody.innerHTML = trustedContributors
      .map(
        (contrib) => `
      <tr>
        <td>
          <span style="font-weight: var(--font-weight-medium); color: var(--color-primary);">
            ${contrib.login}
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

    if (alerts.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">No alerts at this time</td></tr>';
      return;
    }

    tbody.innerHTML = alerts
      .map(
        (alert) => `
      <tr>
        <td>
          <span class="alert-contributor">${alert.contributor}</span>
        </td>
        <td>${alert.repository}</td>
        <td>${alert.type}</td>
        <td>
          <span class="alert-severity ${alert.severity}">
            ${alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)}
          </span>
        </td>
        <td>${alert.date}</td>
        <td>
          <a href="#" class="alert-row-action" title="View details">→</a>
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

    container.innerHTML = repositories
      .map(
        (repo) => `
      <div class="repo-card">
        <div class="repo-header">
          <div>
            <div class="repo-name">${repo.name}</div>
            <div class="repo-owner">${repo.owner}</div>
          </div>
          <div class="repo-status">${repo.status}</div>
        </div>

        <div class="repo-stats">
          <div class="repo-stat">
            <div class="repo-stat-label">Pull Requests</div>
            <div class="repo-stat-value">${repo.prs}</div>
          </div>
          <div class="repo-stat">
            <div class="repo-stat-label">Contributors</div>
            <div class="repo-stat-value">${repo.contributors}</div>
          </div>
        </div>

        <div class="repo-sync">Last sync: ${repo.lastSync}</div>
      </div>
    `
      )
      .join("");
  };

  /**
   * Render Recent Activity Timeline
   */
  const renderActivity = () => {
    const container = document.getElementById("activity-container");
    const { activity } = data;

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
        <div class="activity-icon ${typeColors[item.type]}">
          ${typeEmojis[item.type]}
        </div>
        <div class="activity-content">
          <div class="activity-title">
            ${
              item.type === "pr"
                ? `PR ${item.action}: "${item.title}"`
                : item.type === "vouch"
                  ? `${item.contributor} vouched for contribution`
                  : `${item.contributor} flagged in ${item.repository}`
            }
          </div>
          <div class="activity-detail">
            ${item.repository || item.message}
          </div>
          <div class="activity-time">${item.time}</div>
        </div>
      </div>
    `
      )
      .join("");
  };

  const showError = (message) => {
    const container = document.querySelector(".app-main__inner");
    const errorAlert = document.createElement("div");
    errorAlert.className = "alert alert-danger";
    errorAlert.innerHTML = `
      <div class="alert__icon">✕</div>
      <div class="alert__content">
        <div class="alert__title">Error</div>
        <div class="alert__message">${message}</div>
      </div>
    `;
    container.insertBefore(errorAlert, container.firstChild);
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
