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
      allPullRequests = Array.isArray(response) ? response : response.pull_requests || [];

      applyFiltersAndSearch();
      renderOverview();
      renderTable();
    } catch (error) {
      console.error("Failed to load pull requests:", error);
      showError("Failed to load pull requests. Check if the backend is running.");
      overviewContainer.innerHTML = "";
      prTbody.innerHTML =
        '<tr><td colspan="7" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">Unable to connect to the backend. Please check if http://127.0.0.1:8000 is running.</td></tr>';
    }
  };

  /**
   * Apply filter and search
   */
  const applyFiltersAndSearch = () => {
    let filtered = allPullRequests;

    // Apply status filter
    if (currentFilter !== "all") {
      filtered = filtered.filter((pr) => pr.status === currentFilter);
    }

    // Apply search
    if (currentSearch) {
      filtered = filtered.filter((pr) =>
        (pr.title + (pr.author || "") + (pr.repository || ""))
          .toLowerCase()
          .includes(currentSearch)
      );
    }

    filteredPullRequests = filtered;
    renderTable();
  };

  /**
   * Render overview cards
   */
  const renderOverview = () => {
    const total = allPullRequests.length;
    const open = allPullRequests.filter((pr) => pr.status === "open").length;
    const merged = allPullRequests.filter((pr) => pr.status === "merged").length;
    const needsReview = allPullRequests.filter(
      (pr) => pr.review_status === "pending" && pr.status === "open"
    ).length;

    const stats = [
      { label: "Total Pull Requests", value: total },
      { label: "Open", value: open },
      { label: "Merged", value: merged },
      { label: "Needs Review", value: needsReview },
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
    const statusClass = pr.status.toLowerCase();
    const reviewClass = (pr.review_status || "pending").toLowerCase();

    return `
      <tr>
        <td>
          <div class="pr-title-cell">
            <span class="pr-icon">🔀</span>
            <div class="pr-info">
              <div class="pr-title" data-pr-id="${pr.id}">${escapeHtml(pr.title)}</div>
              <div class="pr-number">#${pr.number || "?"}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="pr-repo">${escapeHtml(pr.repository || "—")}</div>
        </td>
        <td>${escapeHtml(pr.author || "—")}</td>
        <td>
          <span class="status-badge ${statusClass}">${
      pr.status.charAt(0).toUpperCase() + pr.status.slice(1)
    }</span>
        </td>
        <td>
          <span class="review-badge ${reviewClass}">${
      pr.review_status === "approved"
        ? "Approved"
        : pr.review_status === "changes_requested"
          ? "Changes"
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
            <button class="action-btn btn-analyze-pr" data-pr-id="${pr.id}" title="Analyze with AI">
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

    // Set header info
    document.getElementById("modal-pr-title").textContent = pr.title;
    document.getElementById("modal-pr-number").textContent = `#${
      pr.number || "?"
    } in ${pr.repository}`;

    // Build details HTML
    let detailsHTML = `
      <div class="pr-details-section">
        <div class="pr-details-label">Author</div>
        <div class="pr-details-value">${escapeHtml(pr.author || "Unknown")}</div>
      </div>

      <div class="pr-details-section">
        <div class="pr-details-label">Repository</div>
        <div class="pr-details-value">${escapeHtml(pr.repository || "—")}</div>
      </div>

      <div class="pr-details-section">
        <div class="pr-details-label">Status</div>
        <div class="pr-details-value">
          <span class="status-badge ${pr.status}">${
      pr.status.charAt(0).toUpperCase() + pr.status.slice(1)
    }</span>
        </div>
      </div>

      <div class="pr-details-section">
        <div class="pr-details-label">Review Status</div>
        <div class="pr-details-value">
          <span class="review-badge ${pr.review_status || "pending"}">${
      pr.review_status === "approved"
        ? "Approved"
        : pr.review_status === "changes_requested"
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
    if (pr.description) {
      detailsHTML += `
        <div class="pr-details-section">
          <div class="pr-details-label">Description</div>
          <div class="pr-details-description">${escapeHtml(pr.description)}</div>
        </div>
      `;
    }

    // Add file changes if available
    if (pr.files_changed) {
      detailsHTML += `
        <div class="pr-details-section">
          <div class="pr-details-label">Files Changed</div>
          <div class="pr-details-value">${pr.files_changed} files</div>
        </div>
      `;
    }

    // Add commits info if available
    if (pr.commits) {
      detailsHTML += `
        <div class="pr-details-section">
          <div class="pr-details-label">Commits</div>
          <div class="pr-details-value">${pr.commits} commits</div>
        </div>
      `;
    }

    // Add reviews if available
    if (pr.reviews && Array.isArray(pr.reviews) && pr.reviews.length > 0) {
      detailsHTML += `
        <div class="pr-details-section">
          <div class="pr-details-label">Reviews</div>
          <div class="pr-details-value">
            ${pr.reviews.map((r) => `${escapeHtml(r.reviewer)}: ${r.status}`).join(", ")}
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
   * Analyze PR with backend AI
   */
  const handleAnalyze = async (prId) => {
    const pr = allPullRequests.find((p) => p.id === prId || p.id === parseInt(prId));

    if (!pr) {
      showError("Pull request not found");
      return;
    }

    try {
      // First open the details modal if not already open
      if (!detailsModal.classList.contains("open")) {
        await openDetailsModal(prId);
      }

      // Show loading state
      const analysisSection =
        modalBody.querySelector(".pr-analysis-section") || document.createElement("div");
      analysisSection.innerHTML =
        '<div class="pr-analysis-title"><div class="loading-spinner" style="display: inline-block; margin-right: var(--space-2);"></div>Analyzing PR...</div>';
      if (!modalBody.querySelector(".pr-analysis-section")) {
        modalBody.appendChild(analysisSection);
      }

      // Call backend analysis endpoint
      const analysisResult = await APP.api.post(`/pull-requests/${prId}/analyze`, {});

      // Render analysis results
      renderAnalysisResults(analysisSection, analysisResult, pr);
    } catch (error) {
      console.error("Failed to analyze PR:", error);
      showError("Failed to analyze pull request. Please try again.");
    }
  };

  /**
   * Render PR analysis results
   */
  const renderAnalysisResults = (container, analysis, pr) => {
    let html = '<div class="pr-analysis-title">Analysis Results</div>';

    if (analysis.findings && Array.isArray(analysis.findings) && analysis.findings.length > 0) {
      html += '<div class="pr-analysis-findings">';

      analysis.findings.forEach((finding) => {
        const findingClass = finding.severity === "warning" ? "warning" : "caution";
        html += `
          <div class="pr-analysis-finding ${findingClass}">
            <div class="pr-analysis-finding-title">${escapeHtml(finding.title)}</div>
            <div style="font-size: var(--font-size-xs); color: var(--color-text-secondary);">
              ${escapeHtml(finding.description || "")}
            </div>
            ${
              finding.evidence
                ? `<div class="pr-analysis-finding-evidence">
                  <strong>Evidence:</strong> ${escapeHtml(finding.evidence)}
                </div>`
                : ""
            }
          </div>
        `;
      });

      html += "</div>";
    } else {
      html += `
        <div style="color: var(--color-text-secondary); font-size: var(--font-size-sm);">
          No significant findings. PR appears healthy.
        </div>
      `;
    }

    // Add important note about AI analysis
    html += `
      <div class="pr-analysis-note">
        <strong>Note:</strong> This AI analysis is informational only. The final decision to approve or request changes always rests with the maintainer. Verify findings independently before taking action.
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
        <div class="alert__message">${message}</div>
      </div>
    `;
    document.querySelector(".app-main__inner").insertBefore(alert, document.querySelector(".page-header").nextSibling);
    setTimeout(() => alert.remove(), 5000);
  };

  const showSuccess = (message) => {
    const alert = document.createElement("div");
    alert.className = "alert alert-success";
    alert.innerHTML = `
      <div class="alert__icon">✓</div>
      <div class="alert__content">
        <div class="alert__message">${message}</div>
      </div>
    `;
    document.querySelector(".app-main__inner").insertBefore(alert, document.querySelector(".page-header").nextSibling);
    setTimeout(() => alert.remove(), 5000);
  };

  /**
   * Utility: Escape HTML to prevent XSS
   */
  const escapeHtml = (text) => {
    const div = document.createElement("div");
    div.textContent = text;
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
