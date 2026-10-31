/**
 * RAMPART — Contributors & Trust Management Page
 * Transparent contributor profiling, evidence-backed vouches & denouncements
 */

const CONTRIBUTORS = (() => {
  // State
  let allContributors = [];
  let filteredContributors = [];
  let connectedRepositories = [];
  let currentFilter = "all";
  let currentSearch = "";
  let activeProfileUsername = null;

  // DOM Elements
  const overviewContainer = document.getElementById("overview-container");
  const searchInput = document.getElementById("search-contributors");
  const filterBtns = document.querySelectorAll(".filter-btn");
  const contribTable = document.getElementById("contrib-table");
  const contribTbody = document.getElementById("contrib-tbody");
  const emptyState = document.getElementById("empty-state");

  // Profile Modal
  const profileModal = document.getElementById("profile-modal");
  const profCloseX = document.getElementById("prof-close-x");
  const profCloseBtn = document.getElementById("prof-close-btn");
  const profActionVouch = document.getElementById("prof-action-vouch");
  const profActionDenounce = document.getElementById("prof-action-denounce");

  // Vouch Modal & Form
  const vouchModal = document.getElementById("vouch-modal");
  const vouchForm = document.getElementById("vouch-form");
  const vouchUsernameInput = document.getElementById("vouch-username");
  const vouchRepoSelect = document.getElementById("vouch-repo-select");
  const vouchCategorySelect = document.getElementById("vouch-category");
  const vouchReasonInput = document.getElementById("vouch-reason");
  const vouchEvidenceInput = document.getElementById("vouch-evidence");
  const vouchError = document.getElementById("vouch-error");
  const vouchSubmitBtn = document.getElementById("vouch-submit-btn");
  const vouchCloseX = document.getElementById("vouch-close-x");
  const vouchCancelBtn = document.getElementById("vouch-cancel-btn");

  // Denounce Modal & Form
  const denounceModal = document.getElementById("denounce-modal");
  const denounceForm = document.getElementById("denounce-form");
  const denounceUsernameInput = document.getElementById("denounce-username");
  const denounceRepoSelect = document.getElementById("denounce-repo-select");
  const denounceCategorySelect = document.getElementById("denounce-category");
  const denounceReasonInput = document.getElementById("denounce-reason");
  const denounceEvidenceInput = document.getElementById("denounce-evidence");
  const denounceError = document.getElementById("denounce-error");
  const denounceSubmitBtn = document.getElementById("denounce-submit-btn");
  const denounceCloseX = document.getElementById("denounce-close-x");
  const denounceCancelBtn = document.getElementById("denounce-cancel-btn");

  // Header quick actions & overlay
  const btnQuickVouch = document.getElementById("btn-quick-vouch");
  const btnQuickDenounce = document.getElementById("btn-quick-denounce");
  const appOverlay = document.querySelector(".app-overlay");

  const init = async () => {
    attachEventListeners();
    await Promise.all([loadRepositories(), loadContributors()]);
  };

  const attachEventListeners = () => {
    // Search input
    searchInput.addEventListener("input", (e) => {
      currentSearch = e.target.value.toLowerCase().trim();
      applyFiltersAndSearch();
    });

    // Filter pills
    filterBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        filterBtns.forEach((b) => b.classList.remove("active"));
        e.target.classList.add("active");
        currentFilter = e.target.dataset.filter;
        applyFiltersAndSearch();
      });
    });

    // Quick action buttons in header
    btnQuickVouch.addEventListener("click", () => openVouchModal());
    btnQuickDenounce.addEventListener("click", () => openDenounceModal());

    // Profile modal buttons
    profCloseX.addEventListener("click", closeProfileModal);
    profCloseBtn.addEventListener("click", closeProfileModal);
    profActionVouch.addEventListener("click", () => {
      const username = activeProfileUsername;
      closeProfileModal();
      openVouchModal(username);
    });
    profActionDenounce.addEventListener("click", () => {
      const username = activeProfileUsername;
      closeProfileModal();
      openDenounceModal(username);
    });

    // Vouch modal close & submit
    vouchCloseX.addEventListener("click", closeVouchModal);
    vouchCancelBtn.addEventListener("click", closeVouchModal);
    vouchForm.addEventListener("submit", handleVouchSubmit);

    // Denounce modal close & submit
    denounceCloseX.addEventListener("click", closeDenounceModal);
    denounceCancelBtn.addEventListener("click", closeDenounceModal);
    denounceForm.addEventListener("submit", handleDenounceSubmit);

    // Overlay click closes open modal
    appOverlay.addEventListener("click", () => {
      closeProfileModal();
      closeVouchModal();
      closeDenounceModal();
    });
  };

  /**
   * Load repositories for select dropdowns
   */
  const loadRepositories = async () => {
    try {
      const repos = await APP.api.get("/repositories");
      connectedRepositories = Array.isArray(repos) ? repos : (repos.data || []);
      populateRepoSelects();
    } catch (err) {
      console.warn("Failed to load repositories list for selects:", err);
    }
  };

  const populateRepoSelects = () => {
    const optionsHtml = '<option value="">(Network-wide / General)</option>' +
      connectedRepositories.map(r => `<option value="${r.id}">${escapeHtml(r.full_name || `${r.owner}/${r.name}`)}</option>`).join("");
    vouchRepoSelect.innerHTML = optionsHtml;
    denounceRepoSelect.innerHTML = optionsHtml;
  };

  /**
   * Load contributors from backend
   */
  const loadContributors = async () => {
    try {
      contribTbody.innerHTML =
        '<tr><td colspan="7" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);"><div class="loading-spinner" style="display: inline-block;"></div> Loading contributor network data...</td></tr>';

      const response = await APP.api.get("/contributors");
      allContributors = Array.isArray(response) ? response : (response.data || []);

      applyFiltersAndSearch();
      renderOverview();
      renderTable();
    } catch (error) {
      console.error("Failed to load contributors:", error);
      showError("Failed to load contributors from backend. Please ensure http://127.0.0.1:8000 is running.");
      contribTbody.innerHTML =
        '<tr><td colspan="7" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">Unable to connect to backend. Please verify FastAPI server is running.</td></tr>';
    }
  };

  /**
   * Filter and search contributors
   */
  const applyFiltersAndSearch = () => {
    let filtered = allContributors;

    // Filter by status category
    if (currentFilter === "TRUSTED") {
      filtered = filtered.filter((c) => c.status === "TRUSTED");
    } else if (currentFilter === "NEW") {
      filtered = filtered.filter((c) => c.status === "NEW" || c.status === "NEUTRAL");
    } else if (currentFilter === "FLAGGED") {
      filtered = filtered.filter((c) => c.status === "FLAGGED" || c.status === "MIXED");
    }

    // Search by username
    if (currentSearch) {
      filtered = filtered.filter((c) =>
        c.username.toLowerCase().includes(currentSearch)
      );
    }

    filteredContributors = filtered;
    renderTable();
  };

  /**
   * Render overview statistics cards
   */
  const renderOverview = () => {
    const total = allContributors.length;
    const trusted = allContributors.filter((c) => c.status === "TRUSTED").length;
    const neutral = allContributors.filter((c) => c.status === "NEW" || c.status === "NEUTRAL").length;
    const flagged = allContributors.filter((c) => c.status === "FLAGGED" || c.status === "MIXED").length;

    overviewContainer.innerHTML = `
      <div class="contrib-stat-card">
        <div class="contrib-stat-card__label">Tracked Contributors</div>
        <div class="contrib-stat-card__value">${total}</div>
      </div>
      <div class="contrib-stat-card">
        <div class="contrib-stat-card__label">Verified Trusted</div>
        <div class="contrib-stat-card__value" style="color: var(--color-success);">${trusted}</div>
      </div>
      <div class="contrib-stat-card">
        <div class="contrib-stat-card__label">New / Good-Faith Baseline</div>
        <div class="contrib-stat-card__value" style="color: var(--color-info);">${neutral}</div>
      </div>
      <div class="contrib-stat-card">
        <div class="contrib-stat-card__label">Flagged With Evidence</div>
        <div class="contrib-stat-card__value" style="color: var(--color-danger);">${flagged}</div>
      </div>
    `;
  };

  /**
   * Render contributors table
   */
  const renderTable = () => {
    if (filteredContributors.length === 0 && allContributors.length === 0) {
      contribTable.style.display = "none";
      emptyState.style.display = "block";
      return;
    }

    contribTable.style.display = "table";
    emptyState.style.display = "none";

    if (filteredContributors.length === 0) {
      contribTbody.innerHTML =
        '<tr><td colspan="7" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">No contributors match your current search or filter.</td></tr>';
      return;
    }

    contribTbody.innerHTML = filteredContributors
      .map((c) => renderContributorRow(c))
      .join("");

    // Attach row action listeners
    document.querySelectorAll(".btn-view-profile").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openProfileModal(btn.dataset.username);
      });
    });

    document.querySelectorAll(".btn-row-vouch").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openVouchModal(btn.dataset.username);
      });
    });

    document.querySelectorAll(".btn-row-denounce").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openDenounceModal(btn.dataset.username);
      });
    });
  };

  /**
   * Render single contributor row
   */
  const renderContributorRow = (c) => {
    const avatarUrl = c.avatar_url || `https://github.com/${c.username}.png`;
    const score = Number(c.trust_score || 50).toFixed(1);
    
    // Determine trust score color class
    let scoreClass = "neutral";
    if (score >= 80) scoreClass = "high";
    else if (score < 40) scoreClass = "low";

    // Status badge representation
    let statusClass = "badge-neutral";
    let statusLabel = "Neutral";
    if (c.status === "TRUSTED") {
      statusClass = "badge-trusted";
      statusLabel = "Verified Trusted";
    } else if (c.status === "NEW") {
      statusClass = "badge-new";
      statusLabel = "New (Good Faith)";
    } else if (c.status === "FLAGGED") {
      statusClass = "badge-flagged";
      statusLabel = "Flagged Record";
    } else if (c.status === "MIXED") {
      statusClass = "badge-warning";
      statusLabel = "Mixed Record";
    }

    return `
      <tr>
        <td>
          <div class="contrib-cell">
            <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(c.username)}" class="contrib-avatar" onerror="this.src='https://github.com/ghost.png'" />
            <div class="contrib-info">
              <span class="contrib-name">${escapeHtml(c.username)}</span>
              <span class="contrib-meta"><a href="https://github.com/${escapeHtml(c.username)}" target="_blank" rel="noopener" style="color: inherit; text-decoration: none;">github.com/${escapeHtml(c.username)} ↗</a></span>
            </div>
          </div>
        </td>
        <td>
          <span class="trust-pill ${scoreClass}">
            <span>${score}</span> / 100
          </span>
        </td>
        <td>
          <span class="badge ${statusClass}">${statusLabel}</span>
        </td>
        <td><strong>${c.total_prs || 0}</strong> PR(s)</td>
        <td>
          <span style="font-weight: var(--font-weight-bold); color: var(--color-success);">
            ✓ ${c.vouches_count || 0}
          </span>
        </td>
        <td>
          <span style="font-weight: var(--font-weight-bold); color: ${(c.denounces_count || 0) > 0 ? 'var(--color-danger)' : 'var(--color-text-secondary)'};">
            ⚠️ ${c.denounces_count || 0}
          </span>
        </td>
        <td style="text-align: right;">
          <div class="action-btn-group" style="justify-content: flex-end;">
            <button class="action-btn btn-view-profile" data-username="${escapeHtml(c.username)}" title="View complete trust profile">
              👤 Profile
            </button>
            <button class="action-btn btn-vouch-action btn-row-vouch" data-username="${escapeHtml(c.username)}" title="Vouch for contributor">
              ✓ Vouch
            </button>
            <button class="action-btn btn-denounce-action btn-row-denounce" data-username="${escapeHtml(c.username)}" title="Report suspicious activity">
              ⚠️ Denounce
            </button>
          </div>
        </td>
      </tr>
    `;
  };

  /**
   * Profile Modal: Load & display detailed contributor record
   */
  const openProfileModal = async (username) => {
    activeProfileUsername = username;
    profileModal.classList.add("open");

    // Clear previous details
    document.getElementById("prof-username").textContent = `@${username}`;
    document.getElementById("prof-score").textContent = "…";
    document.getElementById("prof-records-container").innerHTML =
      '<div style="text-align: center; padding: var(--space-4);"><div class="loading-spinner" style="display: inline-block;"></div> Loading records...</div>';
    document.getElementById("prof-prs-container").innerHTML =
      '<div style="text-align: center; padding: var(--space-4);"><div class="loading-spinner" style="display: inline-block;"></div> Loading PRs...</div>';

    try {
      const data = await APP.api.get(`/contributors/${username}`);
      const contrib = data.data || data;

      document.getElementById("prof-username").textContent = `@${contrib.username}`;
      document.getElementById("prof-avatar").src = contrib.avatar_url || `https://github.com/${contrib.username}.png`;
      document.getElementById("prof-score").textContent = Number(contrib.trust_score || 50).toFixed(1);
      document.getElementById("prof-first-seen").textContent = contrib.first_seen_at ? new Date(contrib.first_seen_at).toLocaleDateString() : "Recent";
      document.getElementById("prof-total-prs").textContent = contrib.total_prs || 0;
      document.getElementById("prof-vouches").textContent = contrib.vouches_count || 0;
      document.getElementById("prof-denounces").textContent = contrib.denounces_count || 0;
      document.getElementById("prof-trust-index").textContent = `${Math.round(contrib.trust_score || 50)}%`;

      // Status badge
      const statusBadge = document.getElementById("prof-status-badge");
      statusBadge.textContent = contrib.status;
      statusBadge.className = `badge ${contrib.status === "TRUSTED" ? "badge-trusted" : (contrib.status === "FLAGGED" ? "badge-flagged" : "badge-new")}`;

      // Trust Records Render
      const records = contrib.trust_records || [];
      const recordsContainer = document.getElementById("prof-records-container");
      if (records.length === 0) {
        recordsContainer.innerHTML =
          '<div style="color: var(--color-text-secondary); font-size: var(--font-size-sm); padding: var(--space-3); text-align: center;">No Vouches or Denouncements recorded in network yet. Contributor is in standard good-faith standing.</div>';
      } else {
        recordsContainer.innerHTML = records.map(r => {
          const isVouch = r.type === "VOUCH";
          const repoLabel = r.repo_full_name || "General Network";
          const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString() : "Recent";
          return `
            <div class="record-card ${isVouch ? 'vouch' : 'denounce'}">
              <div class="record-header">
                <div>
                  <span class="badge ${isVouch ? 'badge-trusted' : 'badge-flagged'}" style="font-size: 10px;">${r.type}</span>
                  <strong style="margin-left: 6px; font-size: var(--font-size-xs);">${escapeHtml(r.category.replace(/_/g, ' '))}</strong>
                </div>
                <span style="font-size: 11px; color: var(--color-text-secondary);">${dateStr}</span>
              </div>
              <div class="record-reason">${escapeHtml(r.reason)}</div>
              <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 4px;">
                Recorded by <strong>@${escapeHtml(r.author_username || 'maintainer')}</strong> in <strong>${escapeHtml(repoLabel)}</strong>
              </div>
              ${r.evidence_url ? `
                <div class="record-evidence">
                  <strong>Evidence:</strong> <a href="${escapeHtml(r.evidence_url)}" target="_blank" rel="noopener" style="color: var(--color-primary); word-break: break-all;">${escapeHtml(r.evidence_url)} ↗</a>
                </div>
              ` : ''}
            </div>
          `;
        }).join("");
      }

      // Recent PRs Render
      const prs = contrib.recent_prs || [];
      const prsContainer = document.getElementById("prof-prs-container");
      if (prs.length === 0) {
        prsContainer.innerHTML =
          '<div style="color: var(--color-text-secondary); font-size: var(--font-size-sm); padding: var(--space-3); text-align: center;">No Pull Requests tracked for this contributor yet.</div>';
      } else {
        prsContainer.innerHTML = prs.map(pr => {
          const dateStr = pr.created_at ? new Date(pr.created_at).toLocaleDateString() : "Recent";
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--color-background); border-radius: var(--radius-md); font-size: var(--font-size-xs);">
              <div>
                <span style="font-weight: var(--font-weight-bold);">#${pr.pr_number}</span>
                <span style="margin: 0 4px; color: var(--color-text-secondary);">in</span>
                <span>${escapeHtml(pr.repo_full_name)}:</span>
                <span style="margin-left: 4px; color: var(--color-text-primary); font-weight: var(--font-weight-medium);">${escapeHtml(pr.title)}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="badge ${pr.state === 'merged' ? 'badge-trusted' : 'badge-new'}" style="font-size: 10px;">${pr.state}</span>
                <span style="color: var(--color-text-secondary);">${dateStr}</span>
              </div>
            </div>
          `;
        }).join("");
      }

    } catch (err) {
      console.error("Failed to fetch contributor details:", err);
      showError(`Failed to load profile for @${username}`);
      closeProfileModal();
    }
  };

  const closeProfileModal = () => {
    profileModal.classList.remove("open");
    activeProfileUsername = null;
  };

  /**
   * Vouch Modal Operations
   */
  const openVouchModal = (username = "") => {
    vouchForm.reset();
    vouchError.style.display = "none";
    vouchError.textContent = "";
    if (username) {
      vouchUsernameInput.value = username;
    }
    vouchModal.classList.add("open");
  };

  const closeVouchModal = () => {
    vouchModal.classList.remove("open");
  };

  const handleVouchSubmit = async (e) => {
    e.preventDefault();
    const username = vouchUsernameInput.value.trim();
    const repoId = vouchRepoSelect.value ? parseInt(vouchRepoSelect.value) : null;
    const category = vouchCategorySelect.value;
    const reason = vouchReasonInput.value.trim();
    const evidenceUrl = vouchEvidenceInput.value.trim();

    if (!username) {
      showVouchError("Please specify contributor username");
      return;
    }
    if (reason.length < 10) {
      showVouchError("Reason must be at least 10 characters detailing the positive experience");
      return;
    }
    if (!evidenceUrl || !evidenceUrl.startsWith("http")) {
      showVouchError("Please provide a valid evidence URL (e.g. GitHub PR or commit link)");
      return;
    }

    try {
      vouchSubmitBtn.disabled = true;
      vouchSubmitBtn.innerHTML = '<span class="loading-spinner" style="display: inline-block; margin-right: 6px;"></span>Recording Vouch...';

      await APP.api.post("/trust/vouch", {
        contributor_username: username,
        repo_id: repoId,
        category: category,
        reason: reason,
        evidence_url: evidenceUrl,
        author_username: "Rounak-2008",
      });

      closeVouchModal();
      showSuccess(`Evidence-backed Vouch successfully recorded for @${username}`);
      await loadContributors();
    } catch (err) {
      console.error("Failed to submit vouch:", err);
      showVouchError(err.message || "Failed to record vouch. Please verify input fields.");
    } finally {
      vouchSubmitBtn.disabled = false;
      vouchSubmitBtn.textContent = "Record Vouch (+18 Score)";
    }
  };

  const showVouchError = (msg) => {
    vouchError.textContent = msg;
    vouchError.style.display = "block";
  };

  /**
   * Denounce Modal Operations
   */
  const openDenounceModal = (username = "") => {
    denounceForm.reset();
    denounceError.style.display = "none";
    denounceError.textContent = "";
    if (username) {
      denounceUsernameInput.value = username;
    }
    denounceModal.classList.add("open");
  };

  const closeDenounceModal = () => {
    denounceModal.classList.remove("open");
  };

  const handleDenounceSubmit = async (e) => {
    e.preventDefault();
    const username = denounceUsernameInput.value.trim();
    const repoId = denounceRepoSelect.value ? parseInt(denounceRepoSelect.value) : null;
    const category = denounceCategorySelect.value;
    const reason = denounceReasonInput.value.trim();
    const evidenceUrl = denounceEvidenceInput.value.trim();

    if (!username) {
      showDenounceError("Please specify contributor username");
      return;
    }
    if (reason.length < 10) {
      showDenounceError("Reason must be at least 10 characters detailing the abusive pattern");
      return;
    }
    if (!evidenceUrl || !evidenceUrl.startsWith("http")) {
      showDenounceError("Please provide a valid evidence URL pointing to the spam PR or violation");
      return;
    }

    try {
      denounceSubmitBtn.disabled = true;
      denounceSubmitBtn.innerHTML = '<span class="loading-spinner" style="display: inline-block; margin-right: 6px;"></span>Submitting Denouncement...';

      const res = await APP.api.post("/trust/denounce", {
        contributor_username: username,
        repo_id: repoId,
        category: category,
        reason: reason,
        evidence_url: evidenceUrl,
        author_username: "Rounak-2008",
      });

      closeDenounceModal();
      showSuccess(`Denouncement recorded for @${username}. Network alerts active.`);
      await loadContributors();
    } catch (err) {
      console.error("Failed to submit denounce:", err);
      showDenounceError(err.message || "Failed to record denounce. Please verify input fields.");
    } finally {
      denounceSubmitBtn.disabled = false;
      denounceSubmitBtn.textContent = "Submit Denouncement (-32 Score)";
    }
  };

  const showDenounceError = (msg) => {
    denounceError.textContent = msg;
    denounceError.style.display = "block";
  };

  /**
   * Alert banners
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

// Initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", CONTRIBUTORS.init);
} else {
  CONTRIBUTORS.init();
}
