/**
 * RAMPART — Repositories Management Page
 * Load, filter, search, and manage GitHub repositories
 * Real backend integration with error handling
 */

const REPOSITORIES = (() => {
  // State
  let allRepositories = [];
  let filteredRepositories = [];
  let currentFilter = "all";
  let currentSearch = "";
  let disconnectingRepoId = null;

  // DOM Elements
  const overviewContainer = document.getElementById("overview-container");
  const searchInput = document.getElementById("search-repos");
  const filterBtns = document.querySelectorAll(".filter-btn");
  const reposTable = document.getElementById("repos-table");
  const reposTbody = document.getElementById("repos-tbody");
  const emptyState = document.getElementById("empty-state");
  const connectBtn = document.getElementById("connect-repo-btn");
  const connectModal = document.getElementById("connect-modal");
  const repoUrlInput = document.getElementById("repo-url");
  const urlError = document.getElementById("url-error");
  const connectSubmitBtn = document.getElementById("connect-submit-btn");
  const closeModalBtn = document.getElementById("close-modal-btn");
  const confirmationModal = document.getElementById("confirmation-modal");
  const confirmDisconnectBtn = document.getElementById("confirm-disconnect-btn");
  const confirmCancelBtn = document.getElementById("confirm-cancel-btn");
  const appOverlay = document.querySelector(".app-overlay");

  const init = async () => {
    attachEventListeners();
    await loadRepositories();
  };

  const attachEventListeners = () => {
    connectBtn.addEventListener("click", openConnectModal);
    const emptyConnectBtn = document.getElementById("empty-state-connect-btn");
    if (emptyConnectBtn) {
      emptyConnectBtn.addEventListener("click", openConnectModal);
    }
    closeModalBtn.addEventListener("click", closeConnectModal);
    connectSubmitBtn.addEventListener("click", handleConnect);
    repoUrlInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleConnect();
    });

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

    appOverlay.addEventListener("click", () => {
      closeConnectModal();
      closeConfirmationModal();
    });

    confirmCancelBtn.addEventListener("click", closeConfirmationModal);
    confirmDisconnectBtn.addEventListener("click", handleDisconnect);
  };

  /**
   * Load repositories from API
   */
  const loadRepositories = async () => {
    try {
      overviewContainer.innerHTML =
        '<div style="grid-column: 1/-1; text-align: center; padding: var(--space-5);"><div class="loading-spinner" style="display: inline-block;"></div> Loading repositories...</div>';

      const response = await APP.api.get("/repositories");
      allRepositories = Array.isArray(response) ? response : (response.data || response.repositories || []);

      applyFiltersAndSearch();
      renderOverview();
      renderTable();
    } catch (error) {
      console.error("Failed to load repositories:", error);
      showError("Failed to load repositories from backend. Please check if http://127.0.0.1:8000 is running.");
      overviewContainer.innerHTML = "";
      reposTbody.innerHTML =
        '<tr><td colspan="7" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">Unable to connect to the backend. Please check if http://127.0.0.1:8000 is running.</td></tr>';
    }
  };

  /**
   * Apply filter and search
   */
  const applyFiltersAndSearch = () => {
    let filtered = allRepositories;

    // Apply status filter
    if (currentFilter === "active") {
      filtered = filtered.filter((r) => r.status === "active" || r.is_active);
    } else if (currentFilter === "inactive") {
      filtered = filtered.filter((r) => r.status === "inactive" || !r.is_active);
    }

    // Apply search
    if (currentSearch) {
      filtered = filtered.filter((r) =>
        (r.name + (r.owner || "") + (r.full_name || "")).toLowerCase().includes(currentSearch)
      );
    }

    filteredRepositories = filtered;
    renderTable();
  };

  /**
   * Render overview cards
   */
  const renderOverview = () => {
    const total = allRepositories.length;
    const active = allRepositories.filter((r) => r.status === "active" || r.is_active).length;
    const totalOpenPRs = allRepositories.reduce((sum, r) => sum + (r.open_prs || r.open_prs_count || 0), 0);
    const totalAlerts = allRepositories.reduce((sum, r) => sum + (r.alert_count || r.alerts_count || 0), 0);

    const stats = [
      { label: "Total Repositories", value: total },
      { label: "Active", value: active },
      { label: "Open PRs", value: totalOpenPRs },
      { label: "Active Alerts", value: totalAlerts },
    ];

    overviewContainer.innerHTML = stats
      .map(
        (stat) => `
      <div class="repo-stat-card">
        <div class="repo-stat-card__label">${stat.label}</div>
        <div class="repo-stat-card__value">${stat.value}</div>
      </div>
    `
      )
      .join("");
  };

  /**
   * Render repositories table
   */
  const renderTable = () => {
    if (filteredRepositories.length === 0 && allRepositories.length === 0) {
      reposTable.style.display = "none";
      emptyState.style.display = "block";
      return;
    }

    reposTable.style.display = "table";
    emptyState.style.display = "none";

    if (filteredRepositories.length === 0) {
      reposTbody.innerHTML =
        '<tr><td colspan="7" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">No repositories match your search.</td></tr>';
      return;
    }

    reposTbody.innerHTML = filteredRepositories
      .map((repo) => renderRepositoryRow(repo))
      .join("");

    // Attach action event listeners
    document.querySelectorAll(".btn-sync").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        handleSync(btn.dataset.repoId);
      });
    });

    document.querySelectorAll(".btn-disconnect").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openConfirmationModal(btn.dataset.repoId);
      });
    });
  };

  /**
   * Render single repository row
   */
  const renderRepositoryRow = (repo) => {
    const syncVal = repo.last_sync || repo.last_synced_at;
    const syncTime = syncVal ? new Date(syncVal).toLocaleString() : "Never";
    const isActive = repo.status === "active" || repo.is_active;
    const statusClass = isActive ? "" : "inactive";
    const statusText = isActive ? "Active" : "Inactive";
    const openPRs = repo.open_prs ?? repo.open_prs_count ?? 0;
    const alertsCount = repo.alert_count ?? repo.alerts_count ?? 0;
    const contribs = repo.contributor_count ?? "—";

    return `
      <tr>
        <td>
          <div class="repo-name-cell">
            <span class="repo-icon">📦</span>
            <div class="repo-info">
              <div class="repo-name">${escapeHtml(repo.name)}</div>
              <div class="repo-owner">${escapeHtml(repo.owner || "")}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </td>
        <td>${openPRs}</td>
        <td>${contribs}</td>
        <td>${alertsCount}</td>
        <td>
          <span class="sync-time">${syncTime}</span>
        </td>
        <td>
          <div class="repo-actions">
            <button class="action-btn btn-sync" data-repo-id="${repo.id}" title="Sync repository with GitHub">
              ⟳ Sync
            </button>
            <button class="action-btn danger btn-disconnect" data-repo-id="${repo.id}" title="Disconnect repository">
              ✕
            </button>
          </div>
        </td>
      </tr>
    `;
  };

  /**
   * Connect Repository Modal
   */
  const openConnectModal = async () => {
    connectModal.classList.add("open");
    repoUrlInput.focus();
    repoUrlInput.value = "";
    urlError.style.display = "none";
    urlError.textContent = "";

    const discoverGroup = document.getElementById("discover-repo-group");
    const discoverSelect = document.getElementById("discover-repo-select");

    if (discoverGroup && discoverSelect) {
      try {
        const res = await APP.api.get("/repositories/discover");
        const repos = Array.isArray(res) ? res : (res.data || []);
        const unconnected = repos.filter((r) => !r.is_connected);
        if (unconnected.length > 0) {
          discoverGroup.style.display = "block";
          discoverSelect.innerHTML =
            '<option value="">-- Choose an accessible repository --</option>' +
            unconnected
              .map(
                (r) =>
                  `<option value="${escapeHtml(r.full_name)}">${escapeHtml(r.full_name)}${
                    r.is_private ? " (Private)" : ""
                  }</option>`
              )
              .join("");
          discoverSelect.onchange = (e) => {
            if (e.target.value) {
              repoUrlInput.value = e.target.value;
            }
          };
        } else {
          discoverGroup.style.display = "none";
        }
      } catch (_) {
        discoverGroup.style.display = "none";
      }
    }
  };

  const closeConnectModal = () => {
    connectModal.classList.remove("open");
  };

  /**
   * Handle connect repository
   */
  const handleConnect = async () => {
    const url = repoUrlInput.value.trim();

    if (!url) {
      showUrlError("Please enter a repository URL or owner/repo");
      return;
    }

    // Parse input: accept both "owner/repo" and "github.com/owner/repo"
    let owner, repo;
    if (url.includes("github.com")) {
      const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        showUrlError("Invalid GitHub URL format");
        return;
      }
      owner = match[1];
      repo = match[2].replace(".git", "");
    } else if (url.includes("/")) {
      [owner, repo] = url.split("/");
    } else {
      showUrlError("Format: owner/repo or github.com/owner/repo");
      return;
    }

    try {
      connectSubmitBtn.disabled = true;
      connectSubmitBtn.innerHTML =
        '<span class="loading-spinner" style="display: inline-block; margin-right: var(--space-2);"></span>Connecting...';

      await APP.api.post("/repositories", {
        full_name: `${owner.trim()}/${repo.trim()}`,
        owner: owner.trim(),
        repo: repo.trim(),
      });

      closeConnectModal();
      showSuccess(`Repository ${owner.trim()}/${repo.trim()} connected successfully`);
      await loadRepositories();
    } catch (error) {
      console.error("Failed to connect repository:", error);
      showUrlError(
        error.message || "Failed to connect repository. Please check the details and try again."
      );
    } finally {
      connectSubmitBtn.disabled = false;
      connectSubmitBtn.innerHTML = "Connect";
    }
  };

  /**
   * Handle sync repository
   */
  const handleSync = async (repoId) => {
    const btn = document.querySelector(`[data-repo-id="${repoId}"].btn-sync`);
    const originalText = btn ? btn.innerHTML : "⟳ Sync";

    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML =
          '<span class="loading-spinner" style="display: inline-block; margin-right: var(--space-2);"></span>Syncing...';
      }

      await APP.api.post(`/repositories/${repoId}/sync`, {});

      showSuccess("Repository synced successfully with GitHub");
      await loadRepositories();
    } catch (error) {
      console.error("Failed to sync repository:", error);
      showError("Failed to sync repository: " + (error.message || "Network error"));
    } finally {
      if (btn) {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }
  };

  /**
   * Handle disconnect repository
   */
  const handleDisconnect = async () => {
    if (!disconnectingRepoId) return;

    const repoId = disconnectingRepoId;
    closeConfirmationModal();

    try {
      const btn = document.querySelector(`[data-repo-id="${repoId}"].btn-disconnect`);
      if (btn) {
        btn.disabled = true;
        btn.textContent = "…";
      }

      await APP.api.delete(`/repositories/${repoId}`);

      showSuccess("Repository disconnected from trust network");
      await loadRepositories();
    } catch (error) {
      console.error("Failed to disconnect repository:", error);
      showError("Failed to disconnect repository: " + (error.message || "Error"));
    }
  };

  /**
   * Confirmation Modal
   */
  const openConfirmationModal = (repoId) => {
    disconnectingRepoId = repoId;
    confirmationModal.classList.add("open");
  };

  const closeConfirmationModal = () => {
    confirmationModal.classList.remove("open");
    disconnectingRepoId = null;
  };

  /**
   * Error/Success Messages
   */
  const showUrlError = (message) => {
    urlError.textContent = message;
    urlError.style.display = "block";
  };

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
  document.addEventListener("DOMContentLoaded", REPOSITORIES.init);
} else {
  REPOSITORIES.init();
}
