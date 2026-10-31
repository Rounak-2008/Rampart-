/**
 * RAMPART — Pull Requests Management Page
 * Load, filter, search, and analyze GitHub pull requests
 * Real backend integration with analysis capabilities
 */

const PULL_REQUESTS = (() => {
  // State
  let allPullRequests = [];
  let filteredPullRequests = [];
  let currentFilter = "all";
  let currentSearch = "";
  let selectedPRId = null;

  // DOM Elements
  const overviewContainer = document.getElementById("overview-container");
  const searchInput = document.getElementById("search-prs");
  const filterBtns = document.querySelectorAll(".filter-btn");
  const prTable = document.getElementById("pr-table");
  const prTbody = document.getElementById("pr-tbody");
  const emptyState = document.getElementById("empty-state");
  const detailsModal = document.getElementById("pr-details-modal");
  const modalBody = document.getElementById("modal-body");
  const closeModalBtn = document.getElementById("close-modal-btn");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const appOverlay = document.querySelector(".app-overlay");

  const init = async () => {
    attachEventListeners();
    await loadPullRequests();
  };

  const attachEventListeners = () => {
    closeModalBtn.addEventListener("click", closeDetailsModal);
    modalCloseBtn.addEventListener("click", closeDetailsModal);
    appOverlay.addEventListener("click", closeDetailsModal);

    filterBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        filterBtns.forEach((b) => b.classList.remove("active"));
        e.target.classList.add("active");
        currentFilter = e.target.dataset.filter;
        applyFiltersAndSearch();
      });
    });

    searchInput.addEventListener("input", (e) => {
      currentSearch = e.target.value.toLowerCase();
      applyFiltersAndSearch();
    });
  };

  /**
   * Load pull requests from API
   */
  const loadPullRequests = async () => {
    try {
      overviewContainer.innerHTML =
        '<div style="grid-column: 1/-1; text-align: center; padding: var(--space-5);"><div class="loading-spinner" style="display: inline-block;"></div> Loading pull requests...</div>';

      const response = await APP.api.get("/pull-requests");
      allPullRequests = Array.isArray(response) ? response : (response.data || response.pull_requests || []);

      applyFiltersAndSearch();
      renderOverview();
      renderTable();
    } catch (error) {
      console.error("Failed to load pull requests:", error);
      showError("Failed to load pull requests from backend. Please check if http://127.0.0.1:8000 is running.");
      overviewContainer.innerHTML = "";
      prTbody.innerHTML =
        '<tr><td colspan="7" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">Unable to connect to backend. Please check if http://127.0.0.1:8000 is running.</td></tr>';
    }
  };

  /**
   * Apply filter and search
   */
  const applyFiltersAndSearch = () => {
    let filtered = allPullRequests;

    // Apply status filter
    if (currentFilter !== "all") {
      filtered = filtered.filter((pr) => {
        const state = (pr.status || pr.state || "").toLowerCase();
        return state === currentFilter.toLowerCase();
      });
    }

    // Apply search
    if (currentSearch) {
      filtered = filtered.filter((pr) => {
        const combined = `${pr.title} ${pr.author || pr.contributor_username || ""} ${pr.repository || pr.repo_full_name || ""}`.toLowerCase();
        return combined.includes(currentSearch);
      });
    }

    filteredPullRequests = filtered;
    renderTable();
  };

  /**
   * Render overview cards
   */
  const renderOverview = () => {
    const total = allPullRequests.length;
    const open = allPullRequests.filter((pr) => (pr.status || pr.state) === "open").length;
    const merged = allPullRequests.filter((pr) => (pr.status || pr.state) === "merged").length;
    const needsReview = allPullRequests.filter(
      (pr) => (pr.review_status === "pending" || pr.risk_level === "HIGH") && (pr.status || pr.state) === "open"
    ).length;

    const stats = [
      { label: "Total Pull Requests", value: total },
      { label: "Open", value: open },
      { label: "Merged", value: merged },
      { label: "Pending Review / Flagged", value: needsReview },
    ];

    overviewContainer.innerHTML = stats
      .map(
        (stat) => `
      <div class="pr-stat-card">
        <div class="pr-stat-card__label">${stat.label}</div>
        <div class="pr-stat-card__value">${stat.value}</div>
      </div>
    `
      )
      .join("");
  };

  /**
   * Render pull requests table
   */
  const renderTable = () => {
    if (filteredPullRequests.length === 0 && allPullRequests.length === 0) {
      prTable.style.display = "none";
      emptyState.style.display = "block";
      return;
    }

    prTable.style.display = "table";
    emptyState.style.display = "none";

    if (filteredPullRequests.length === 0) {
      prTbody.innerHTML =
        '<tr><td colspan="7" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">No pull requests match your search.</td></tr>';
      return;
    }

    prTbody.innerHTML = filteredPullRequests
      .map((pr) => renderPRRow(pr))
      .join("");

    // Attach action event listeners
    document.querySelectorAll(".btn-view-pr").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openDetailsModal(btn.dataset.prId);
      });
    });

    document.querySelectorAll(".btn-analyze-pr").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        handleAnalyze(btn.dataset.prId);
      });
    });
  };

  /**
   * Render single PR row
   */
  const renderPRRow = (pr) => {
    const createdDate = pr.created_at
      ? new Date(pr.created_at).toLocaleDateString()
      : "Unknown";
    const statusVal = (pr.status || pr.state || "open").toLowerCase();
    const statusClass = statusVal;
    const reviewStatus = pr.review_status || (pr.risk_level === "HIGH" ? "changes_requested" : (statusVal === "merged" ? "approved" : "pending"));
    const reviewClass = reviewStatus.toLowerCase();
    const prNumber = pr.number ?? pr.pr_number ?? "?";
    const authorName = pr.author || pr.contributor_username || "—";
    const repoName = pr.repository || pr.repo_full_name || "—";

    return `
      <tr>
        <td>
          <div class="pr-title-cell">
            <span class="pr-icon">🔀</span>
            <div class="pr-info">
              <div class="pr-title" data-pr-id="${pr.id}">${escapeHtml(pr.title)}</div>
              <div class="pr-number">#${prNumber}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="pr-repo">${escapeHtml(repoName)}</div>
        </td>
        <td>
          <span style="font-weight: var(--font-weight-medium);">${escapeHtml(authorName)}</span>
          ${pr.contributor_trust_score ? `<span style="font-size: 11px; color: var(--color-text-secondary); margin-left: 4px;">(${pr.contributor_trust_score})</span>` : ""}
        </td>
        <td>
          <span class="status-badge ${statusClass}">${statusVal.charAt(0).toUpperCase() + statusVal.slice(1)}</span>
        </td>
        <td>
          <span class="review-badge ${reviewClass}">${
      reviewStatus === "approved"
        ? "Approved"
        : reviewStatus === "changes_requested"
          ? "Changes Requested"
          : "Pending"
    }</span>
        </td>
        <td>
          <span class="pr-date">${createdDate}</span>
        </td>
        <td>
          <div class="pr-actions">
            <button class="action-btn btn-view-pr" data-pr-id="${pr.id}" title="View details">
              👁️ View
            </button>
            <button class="action-btn btn-analyze-pr" data-pr-id="${pr.id}" title="Run pattern analysis">
              ✨ Analyze
            </button>
          </div>
        </td>
      </tr>
    `;
  };

  /**
   * Open PR details modal
   */
  const openDetailsModal = async (prId) => {
    selectedPRId = prId;
    const pr = allPullRequests.find((p) => p.id === prId || p.id === parseInt(prId));

    if (!pr) {
      console.error("PR not found");
      showError("Pull request not found");
      return;
    }

    const prNumber = pr.number ?? pr.pr_number ?? "?";
    const repoName = pr.repository || pr.repo_full_name || "—";
    const authorName = pr.author || pr.contributor_username || "Unknown";
    const statusVal = pr.status || pr.state || "open";
    const reviewStatus = pr.review_status || (pr.risk_level === "HIGH" ? "changes_requested" : (statusVal === "merged" ? "approved" : "pending"));

    // Set header info
    document.getElementById("modal-pr-title").textContent = pr.title;
    document.getElementById("modal-pr-number").textContent = `#${prNumber} in ${repoName}`;

    // Build details HTML
    let detailsHTML = `
      <div class="pr-details-section">
        <div class="pr-details-label">Author</div>
        <div class="pr-details-value">
          <strong>${escapeHtml(authorName)}</strong>
          ${pr.contributor_trust_score !== undefined ? ` • Trust Score: ${pr.contributor_trust_score}/100 (${pr.contributor_status || 'NEW'})` : ""}
        </div>
      </div>

      <div class="pr-details-section">
        <div class="pr-details-label">Repository</div>
        <div class="pr-details-value">${escapeHtml(repoName)}</div>
      </div>

      <div class="pr-details-section">
        <div class="pr-details-label">Status</div>
        <div class="pr-details-value">
          <span class="status-badge ${statusVal}">${statusVal.charAt(0).toUpperCase() + statusVal.slice(1)}</span>
          ${pr.risk_level ? `<span class="review-badge ${pr.risk_level === 'HIGH' ? 'changes_requested' : 'approved'}" style="margin-left: 8px;">Risk: ${pr.risk_level}</span>` : ""}
        </div>
      </div>

      <div class="pr-details-section">
        <div class="pr-details-label">Review Status</div>
        <div class="pr-details-value">
          <span class="review-badge ${reviewStatus}">${
      reviewStatus === "approved"
        ? "Approved"
        : reviewStatus === "changes_requested"
          ? "Changes Requested"
          : "Pending Review"
    }</span>
        </div>
      </div>

      <div class="pr-details-section">
        <div class="pr-details-label">Created</div>
        <div class="pr-details-value">${
          pr.created_at ? new Date(pr.created_at).toLocaleString() : "Unknown"
        }</div>
      </div>
    `;

    // Add description if available
    const desc = pr.description || pr.body;
    if (desc) {
      detailsHTML += `
        <div class="pr-details-section">
          <div class="pr-details-label">Description</div>
          <div class="pr-details-description">${escapeHtml(desc)}</div>
        </div>
      `;
    }

    // Add file changes
    if (pr.files_changed !== undefined) {
      detailsHTML += `
        <div class="pr-details-section">
          <div class="pr-details-label">Code Changes</div>
          <div class="pr-details-value">
            ${pr.files_changed} file(s) changed
            ${(pr.additions || pr.deletions) ? ` (+${pr.additions || 0} / -${pr.deletions || 0})` : ""}
          </div>
        </div>
      `;
    }

    // Add analysis summary if available
    if (pr.analysis_summary) {
      detailsHTML += `
        <div class="pr-details-section">
          <div class="pr-details-label">Analysis Summary</div>
          <div class="pr-details-description" style="background: var(--color-surface); padding: var(--space-3); border-radius: var(--radius-md); border-left: 3px solid var(--color-primary);">
            ${escapeHtml(pr.analysis_summary)}
          </div>
        </div>
      `;
    }

    modalBody.innerHTML = detailsHTML;
    detailsModal.classList.add("open");
  };

  /**
   * Close PR details modal
   */
  const closeDetailsModal = () => {
    detailsModal.classList.remove("open");
    selectedPRId = null;
  };

  /**
   * Analyze PR with backend pattern engine
   */
  const handleAnalyze = async (prId) => {
    const pr = allPullRequests.find((p) => p.id === prId || p.id === parseInt(prId));

    if (!pr) {
      showError("Pull request not found");
      return;
    }

    try {
      if (!detailsModal.classList.contains("open")) {
        await openDetailsModal(prId);
      }

      // Show loading state
      let analysisSection = modalBody.querySelector(".pr-analysis-section");
      if (!analysisSection) {
        analysisSection = document.createElement("div");
        analysisSection.className = "pr-details-section pr-analysis-section";
        modalBody.appendChild(analysisSection);
      }

      analysisSection.innerHTML =
        '<div class="pr-analysis-title"><div class="loading-spinner" style="display: inline-block; margin-right: var(--space-2);"></div>Analyzing PR across RAMPART Trust Network...</div>';

      // Call backend analysis endpoint
      const analysisResult = await APP.api.post(`/pull-requests/${prId}/analyze`, {});

      // Render analysis results
      renderAnalysisResults(analysisSection, analysisResult, pr);

      // Refresh list in background to reflect updated risk level
      const updatedList = await APP.api.get("/pull-requests");
      allPullRequests = Array.isArray(updatedList) ? updatedList : (updatedList.data || allPullRequests);
      applyFiltersAndSearch();
    } catch (error) {
      console.error("Failed to analyze PR:", error);
      showError("Failed to analyze pull request: " + (error.message || "Network error"));
    }
  };

  /**
   * Render PR analysis results
   */
  const renderAnalysisResults = (container, analysis, pr) => {
    let html = `
      <div class="pr-analysis-title" style="display: flex; align-items: center; justify-content: space-between;">
        <span>RAMPART Trust Engine Analysis</span>
        <span class="review-badge ${analysis.risk_level === 'HIGH' ? 'changes_requested' : 'approved'}">Risk: ${analysis.risk_level}</span>
      </div>
    `;

    const findings = analysis.findings || [];

    if (findings.length > 0) {
      html += '<div class="pr-analysis-findings" style="margin-top: var(--space-3);">';

      findings.forEach((finding) => {
        const severity = (finding.severity || "info").toLowerCase();
        const findingClass = severity === "caution" ? "danger" : (severity === "warning" ? "warning" : "info");
        html += `
          <div class="alert alert-${findingClass}" style="margin-bottom: var(--space-3); padding: var(--space-3);">
            <div style="font-weight: var(--font-weight-semibold);">${escapeHtml(finding.title)}</div>
            <div style="font-size: var(--font-size-xs); color: var(--color-text-secondary); margin-top: 4px;">
              ${escapeHtml(finding.description || "")}
            </div>
            ${
              finding.evidence
                ? `<div style="font-size: 11px; margin-top: 6px; padding: 4px 8px; background: rgba(0,0,0,0.04); border-radius: 4px;">
                  <strong>Evidence:</strong> ${escapeHtml(finding.evidence)}
                </div>`
                : ""
            }
          </div>
        `;
      });

      html += "</div>";
    } else if (analysis.analysis_summary) {
      html += `
        <div style="color: var(--color-text-primary); font-size: var(--font-size-sm); margin-top: var(--space-2);">
          ${escapeHtml(analysis.analysis_summary)}
        </div>
      `;
    } else {
      html += `
        <div style="color: var(--color-text-secondary); font-size: var(--font-size-sm); margin-top: var(--space-2);">
          No suspicious signals detected. PR appears healthy.
        </div>
      `;
    }

    // Maintainer sovereignty note
    html += `
      <div class="pr-analysis-note" style="margin-top: var(--space-3); font-size: 11px; color: var(--color-text-secondary); border-top: 1px solid var(--color-border); padding-top: var(--space-2);">
        <strong>Note:</strong> RAMPART analysis is informational and evidence-backed. Maintainers retain complete authority for merge, review, and contributor actions.
      </div>
    `;

    container.innerHTML = html;
  };

  /**
   * Error/Success Messages
   */
  const showError = (message) => {
    const alert = document.createElement("div");
    alert.className = "alert alert-danger";
    alert.innerHTML = `
      <div class="alert__icon">✕</div>
      <div class="alert__content">
        <div class="alert__message">${escapeHtml(message)}</div>
      </div>
    `;
    const target = document.querySelector(".page-header");
    if (target && target.parentNode) {
      target.parentNode.insertBefore(alert, target.nextSibling);
      setTimeout(() => alert.remove(), 5000);
    }
  };

  const showSuccess = (message) => {
    const alert = document.createElement("div");
    alert.className = "alert alert-success";
    alert.innerHTML = `
      <div class="alert__icon">✓</div>
      <div class="alert__content">
        <div class="alert__message">${escapeHtml(message)}</div>
      </div>
    `;
    const target = document.querySelector(".page-header");
    if (target && target.parentNode) {
      target.parentNode.insertBefore(alert, target.nextSibling);
      setTimeout(() => alert.remove(), 5000);
    }
  };

  /**
   * Utility: Escape HTML to prevent XSS
   */
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
  document.addEventListener("DOMContentLoaded", PULL_REQUESTS.init);
} else {
  PULL_REQUESTS.init();
}
