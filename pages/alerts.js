/**
 * RAMPART — Alerts & Threat Intelligence Interface
 * Live alert monitoring, evidence inspection, and resolution workflow
 */

const ALERTS = (() => {
  // State
  let allAlerts = [];
  let filteredAlerts = [];
  let connectedRepositories = [];
  let currentSeverityFilter = "all";
  let currentStatusFilter = "active";
  let currentRepoFilter = "";
  let currentSearch = "";
  let activeAlertId = null;

  // DOM Elements
  const searchInput = document.getElementById("search-alerts");
  const filterBtns = document.querySelectorAll(".filter-btn");
  const repoFilterSelect = document.getElementById("repo-filter-select");
  const alertsTable = document.getElementById("alerts-table");
  const alertsTbody = document.getElementById("alerts-tbody");
  const emptyState = document.getElementById("empty-state");

  // Overview Stats
  const statActive = document.getElementById("stat-active");
  const statCritical = document.getElementById("stat-critical");
  const statWarning = document.getElementById("stat-warning");
  const statResolved = document.getElementById("stat-resolved");

  // Alert Details Modal
  const alertModal = document.getElementById("alert-modal");
  const modalCloseX = document.getElementById("modal-close-x");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const modalResolveBtn = document.getElementById("modal-resolve-btn");
  const modalSeverityBadge = document.getElementById("modal-severity-badge");
  const modalTitle = document.getElementById("modal-title");
  const modalPatternType = document.getElementById("modal-pattern-type");
  const modalMessage = document.getElementById("modal-message");
  const modalRepo = document.getElementById("modal-repo");
  const modalContributor = document.getElementById("modal-contributor");
  const modalPr = document.getElementById("modal-pr");
  const modalPrRow = document.getElementById("modal-pr-row");
  const modalEvidence = document.getElementById("modal-evidence");
  const modalResolutionInfo = document.getElementById("modal-resolution-info");

  const appOverlay = document.querySelector(".app-overlay");
  const headerBtnNotif = document.getElementById("header-btn-notifications");
  const headerNotifBadge = document.getElementById("header-notif-badge");

  const init = async () => {
    attachEventListeners();
    await Promise.all([loadRepositories(), loadAlerts(), updateNotificationCount()]);
  };

  const attachEventListeners = () => {
    // Search input
    searchInput.addEventListener("input", (e) => {
      currentSearch = e.target.value.toLowerCase().trim();
      applyFiltersAndSearch();
    });

    // Filter buttons (both severity and status)
    filterBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const type = btn.dataset.filterType;
        const val = btn.dataset.value;

        // Reset active style for buttons in same group
        document.querySelectorAll(`.filter-btn[data-filter-type="${type}"]`).forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        if (type === "severity") {
          currentSeverityFilter = val;
        } else if (type === "status") {
          currentStatusFilter = val;
        }

        applyFiltersAndSearch();
      });
    });

    // Repository select dropdown
    repoFilterSelect.addEventListener("change", (e) => {
      currentRepoFilter = e.target.value;
      applyFiltersAndSearch();
    });

    // Modal close handlers
    modalCloseX.addEventListener("click", closeAlertModal);
    modalCloseBtn.addEventListener("click", closeAlertModal);
    appOverlay.addEventListener("click", closeAlertModal);

    // Modal resolve handler
    modalResolveBtn.addEventListener("click", () => {
      if (activeAlertId) {
        handleResolve(activeAlertId);
      }
    });

    // Header notification button
    if (headerBtnNotif) {
      headerBtnNotif.addEventListener("click", () => {
        window.location.href = "notifications.html";
      });
    }
  };

  /**
   * Load repositories for filter dropdown
   */
  const loadRepositories = async () => {
    try {
      const res = await APP.api.get("/repositories");
      connectedRepositories = Array.isArray(res) ? res : (res.data || []);
      const optionsHtml = '<option value="">All Repositories</option>' +
        connectedRepositories.map((r) => `<option value="${r.id}">${escapeHtml(r.full_name || `${r.owner}/${r.name}`)}</option>`).join("");
      repoFilterSelect.innerHTML = optionsHtml;
    } catch (err) {
      console.warn("Failed to load repositories:", err);
    }
  };

  /**
   * Load alerts from backend API
   */
  const loadAlerts = async () => {
    try {
      alertsTbody.innerHTML =
        '<tr><td colspan="7" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);"><div class="loading-spinner" style="display: inline-block;"></div> Loading alerts from RAMPART intelligence engine...</td></tr>';

      const res = await APP.api.get("/alerts");
      allAlerts = Array.isArray(res) ? res : (res.data || []);

      renderStats();
      applyFiltersAndSearch();
    } catch (err) {
      console.error("Failed to load alerts:", err);
      showError("Failed to fetch alerts from backend. Please ensure http://127.0.0.1:8000 is operational.");
      alertsTbody.innerHTML =
        '<tr><td colspan="7" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">Unable to load alerts. Check FastAPI backend connection.</td></tr>';
    }
  };

  /**
   * Render top stats cards
   */
  const renderStats = () => {
    const active = allAlerts.filter((a) => !a.is_resolved).length;
    const critical = allAlerts.filter((a) => !a.is_resolved && (a.severity === "critical" || a.severity === "high")).length;
    const warning = allAlerts.filter((a) => !a.is_resolved && (a.severity === "warning" || a.severity === "medium")).length;
    const resolved = allAlerts.filter((a) => a.is_resolved).length;

    statActive.textContent = active;
    statCritical.textContent = critical;
    statWarning.textContent = warning;
    statResolved.textContent = resolved;
  };

  /**
   * Filter and search alerts
   */
  const applyFiltersAndSearch = () => {
    let filtered = allAlerts;

    // Severity filter
    if (currentSeverityFilter !== "all") {
      filtered = filtered.filter((a) => {
        const sev = (a.severity || "").toLowerCase();
        if (currentSeverityFilter === "critical") return sev === "critical" || sev === "high";
        if (currentSeverityFilter === "warning") return sev === "warning" || sev === "medium";
        if (currentSeverityFilter === "info") return sev === "info" || sev === "low";
        return sev === currentSeverityFilter;
      });
    }

    // Status filter
    if (currentStatusFilter === "active") {
      filtered = filtered.filter((a) => !a.is_resolved);
    } else if (currentStatusFilter === "resolved") {
      filtered = filtered.filter((a) => a.is_resolved);
    }

    // Repository filter
    if (currentRepoFilter) {
      filtered = filtered.filter((a) => String(a.repo_id) === String(currentRepoFilter));
    }

    // Text search query
    if (currentSearch) {
      filtered = filtered.filter((a) => {
        const target = `${a.message} ${a.pattern_type} ${a.contributor_username || a.contributor || ''} ${a.repo_full_name || a.repository || ''} ${a.evidence_details || ''}`.toLowerCase();
        return target.includes(currentSearch);
      });
    }

    filteredAlerts = filtered;
    renderTable();
  };

  /**
   * Render alerts table
   */
  const renderTable = () => {
    if (filteredAlerts.length === 0 && allAlerts.length === 0) {
      alertsTable.style.display = "none";
      emptyState.style.display = "block";
      return;
    }

    alertsTable.style.display = "table";
    emptyState.style.display = "none";

    if (filteredAlerts.length === 0) {
      alertsTbody.innerHTML =
        '<tr><td colspan="7" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">No alerts match the active filter combination.</td></tr>';
      return;
    }

    alertsTbody.innerHTML = filteredAlerts.map((a) => renderAlertRow(a)).join("");

    // Attach row button events
    document.querySelectorAll(".btn-view-alert").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openAlertModal(btn.dataset.alertId);
      });
    });

    document.querySelectorAll(".btn-row-resolve").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        handleResolve(btn.dataset.alertId);
      });
    });
  };

  /**
   * Render individual table row
   */
  const renderAlertRow = (a) => {
    const sev = (a.severity || "info").toLowerCase();
    const isResolved = Boolean(a.is_resolved);
    const dateStr = a.created_at ? new Date(a.created_at).toLocaleDateString() : (a.date || "Recent");
    const repoText = a.repository || a.repo_full_name || "Network-wide";
    const contributorText = a.contributor_username ? `@${a.contributor_username}` : (a.contributor || "—");

    let sevIcon = "ℹ️";
    if (sev === "critical" || sev === "high") sevIcon = "⚠️";
    else if (sev === "warning" || sev === "medium") sevIcon = "⚡";

    return `
      <tr style="${isResolved ? 'opacity: 0.75;' : ''}">
        <td>
          <span class="severity-badge severity-${sev}">
            <span>${sevIcon}</span>
            <span>${sev.toUpperCase()}</span>
          </span>
        </td>
        <td>
          <strong>${escapeHtml(a.type || a.pattern_type.replace(/_/g, ' '))}</strong>
        </td>
        <td>
          <div class="alert-msg-cell">
            <div class="alert-msg-title">${escapeHtml(a.message)}</div>
            ${a.evidence_details ? `<div class="alert-msg-desc" title="${escapeHtml(a.evidence_details)}">${escapeHtml(a.evidence_details)}</div>` : ''}
          </div>
        </td>
        <td>
          <div>
            <span style="font-weight: var(--font-weight-medium);">${escapeHtml(repoText)}</span>
            <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">
              User: <span style="color: var(--color-primary);">${escapeHtml(contributorText)}</span>
              ${a.pr_number ? ` • PR #${a.pr_number}` : ''}
            </div>
          </div>
        </td>
        <td>
          <span class="badge ${isResolved ? 'badge-trusted' : 'badge-flagged'}" style="font-size: 11px;">
            ${isResolved ? '✓ Resolved' : 'Active'}
          </span>
        </td>
        <td style="font-size: 12px; color: var(--color-text-secondary); white-space: nowrap;">
          ${escapeHtml(dateStr)}
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="action-btn btn-view-alert" data-alert-id="${a.id}" title="Inspect full alert evidence">
            👁️ Details
          </button>
          ${!isResolved ? `
            <button class="action-btn btn-row-resolve" data-alert-id="${a.id}" style="color: var(--color-success); border-color: rgba(22, 163, 74, 0.3); margin-left: 4px;" title="Acknowledge & resolve alert">
              ✓ Resolve
            </button>
          ` : `
            <span style="font-size: 11px; color: var(--color-success); margin-left: 6px;">Handled</span>
          `}
        </td>
      </tr>
    `;
  };

  /**
   * Open Alert Details Modal
   */
  const openAlertModal = async (alertId) => {
    activeAlertId = alertId;
    alertModal.classList.add("open");

    // Clear previous
    modalTitle.textContent = `Alert #${alertId}`;
    modalPatternType.textContent = "…";
    modalMessage.textContent = "Loading alert details...";
    modalRepo.textContent = "…";
    modalContributor.textContent = "…";
    modalPr.textContent = "…";
    modalEvidence.textContent = "…";
    modalResolutionInfo.textContent = "…";

    try {
      const res = await APP.api.get(`/alerts/${alertId}`);
      const a = res.data || res;

      const sev = (a.severity || "info").toLowerCase();
      modalSeverityBadge.className = `severity-badge severity-${sev}`;
      modalSeverityBadge.textContent = sev.toUpperCase();

      modalTitle.textContent = `Alert #${a.id} — ${a.type || a.pattern_type.replace(/_/g, ' ')}`;
      modalPatternType.textContent = a.pattern_type || a.type;
      modalMessage.textContent = a.message;
      modalRepo.textContent = a.repository || a.repo_full_name || "Network-wide";
      modalContributor.innerHTML = `<a href="contributors.html" style="color: var(--color-primary); font-weight: bold; text-decoration: none;">${escapeHtml(a.contributor || `@${a.contributor_username}`)} ↗</a>`;

      if (a.pr_number || a.pr_id) {
        modalPrRow.style.display = "block";
        modalPr.innerHTML = `<a href="pull-requests.html" style="color: var(--color-primary); font-weight: bold; text-decoration: none;">PR #${a.pr_number || a.pr_id}: ${escapeHtml(a.pr_title || 'View in Pull Requests')} ↗</a>`;
      } else {
        modalPrRow.style.display = "none";
      }

      modalEvidence.textContent = a.evidence_details || "No explicit URL evidence attached. Flagged based on network pattern rules.";

      if (a.is_resolved) {
        modalResolutionInfo.innerHTML = `<span class="badge badge-trusted" style="font-size: 11px;">✓ Resolved</span> <span style="font-size: 12px; color: var(--color-text-secondary); margin-left: 6px;">by @${escapeHtml(a.resolved_by || 'maintainer')} on ${a.resolved_at ? new Date(a.resolved_at).toLocaleString() : 'Recently'}</span>`;
        modalResolveBtn.style.display = "none";
      } else {
        modalResolutionInfo.innerHTML = `<span class="badge badge-flagged" style="font-size: 11px;">Active Threat / Anomaly</span> <span style="font-size: 12px; color: var(--color-text-secondary); margin-left: 6px;">Awaiting maintainer acknowledgment</span>`;
        modalResolveBtn.style.display = "inline-flex";
      }
    } catch (err) {
      console.error("Failed to load alert details:", err);
      showError(`Failed to load details for Alert #${alertId}`);
      closeAlertModal();
    }
  };

  const closeAlertModal = () => {
    alertModal.classList.remove("open");
    activeAlertId = null;
  };

  /**
   * Mark alert as resolved
   */
  const handleResolve = async (alertId) => {
    try {
      modalResolveBtn.disabled = true;
      modalResolveBtn.innerHTML = '<span class="loading-spinner" style="display: inline-block; margin-right: 6px;"></span>Resolving...';

      await APP.api.patch(`/alerts/${alertId}/resolve`, {
        resolved_by: "Rounak-2008",
      });

      closeAlertModal();
      showSuccess(`Alert #${alertId} successfully marked as resolved`);
      await loadAlerts();
      await updateNotificationCount();
    } catch (err) {
      console.error("Failed to resolve alert:", err);
      showError(`Failed to resolve alert #${alertId}: ` + (err.message || "Error"));
    } finally {
      modalResolveBtn.disabled = false;
      modalResolveBtn.textContent = "✓ Mark as Resolved";
    }
  };

  /**
   * Update header notification badge counter
   */
  const updateNotificationCount = async () => {
    try {
      const res = await APP.api.get("/notifications");
      const notifs = Array.isArray(res) ? res : (res.data || []);
      const unreadCount = notifs.filter((n) => !n.is_read).length;
      if (headerNotifBadge) {
        if (unreadCount > 0) {
          headerNotifBadge.textContent = unreadCount;
          headerNotifBadge.style.display = "inline-block";
        } else {
          headerNotifBadge.style.display = "none";
        }
      }
    } catch (_) {}
  };

  /**
   * Toast alerts
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
  document.addEventListener("DOMContentLoaded", ALERTS.init);
} else {
  ALERTS.init();
}
