/**
 * RAMPART — Notifications Interface
 * Live activity alerts, event log inspection, and read-state management
 */

const NOTIFICATIONS = (() => {
  let allNotifications = [];
  let currentFilter = "all";

  // DOM Elements
  const notifList = document.getElementById("notif-list");
  const notifEmpty = document.getElementById("notif-empty");
  const filterBtns = document.querySelectorAll(".filter-btn");
  const btnMarkAll = document.getElementById("btn-mark-all-read");
  const btnHeaderReadAll = document.getElementById("btn-header-read-all");

  const init = async () => {
    attachEventListeners();
    await loadNotifications();
  };

  const attachEventListeners = () => {
    filterBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        filterBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.dataset.filter;
        renderNotifications();
      });
    });

    if (btnMarkAll) {
      btnMarkAll.addEventListener("click", handleMarkAllRead);
    }
    if (btnHeaderReadAll) {
      btnHeaderReadAll.addEventListener("click", handleMarkAllRead);
    }
  };

  const loadNotifications = async () => {
    try {
      notifList.innerHTML =
        '<div style="text-align: center; padding: var(--space-6); color: var(--color-text-secondary);"><div class="loading-spinner" style="display: inline-block;"></div> Loading notifications...</div>';

      const res = await APP.api.get("/notifications");
      allNotifications = Array.isArray(res) ? res : (res.data || []);
      renderNotifications();
    } catch (err) {
      console.error("Failed to load notifications:", err);
      notifList.innerHTML =
        '<div style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">Unable to connect to notifications service. Please verify backend is running.</div>';
    }
  };

  const renderNotifications = () => {
    let filtered = allNotifications;
    if (currentFilter === "unread") {
      filtered = filtered.filter((n) => !n.is_read);
    } else if (currentFilter === "read") {
      filtered = filtered.filter((n) => n.is_read);
    }

    if (filtered.length === 0) {
      notifList.style.display = "none";
      notifEmpty.style.display = "block";
      return;
    }

    notifList.style.display = "flex";
    notifEmpty.style.display = "none";

    notifList.innerHTML = filtered.map((n) => renderNotifCard(n)).join("");

    // Attach mark-read button handlers
    document.querySelectorAll(".btn-single-read").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleMarkSingleRead(btn.dataset.notifId);
      });
    });
  };

  const renderNotifCard = (n) => {
    const isUnread = !n.is_read;
    const type = (n.type || "info").toLowerCase();
    const dateStr = n.created_at ? new Date(n.created_at).toLocaleString() : "Recent";

    let iconSymbol = "🔔";
    let iconClass = "alert";
    if (type === "pr") {
      iconSymbol = "🔀";
      iconClass = "pr";
    } else if (type === "vouch") {
      iconSymbol = "✓";
      iconClass = "vouch";
    } else if (type === "repo") {
      iconSymbol = "📦";
      iconClass = "repo";
    } else {
      iconSymbol = "⚠️";
      iconClass = "alert";
    }

    // Determine target link
    let targetHref = "#";
    if (n.link_url) {
      if (n.link_url.startsWith("/")) {
        targetHref = n.link_url.substring(1) + ".html";
      } else {
        targetHref = n.link_url;
      }
    }

    return `
      <div class="notif-card ${isUnread ? 'unread' : 'read'}" data-id="${n.id}">
        <div class="notif-icon ${iconClass}">
          ${iconSymbol}
        </div>
        <div class="notif-content">
          <div class="notif-title">
            ${escapeHtml(n.title)}
            ${isUnread ? '<span class="badge badge-flagged" style="font-size: 10px; margin-left: 6px;">New</span>' : ''}
          </div>
          <div class="notif-message">${escapeHtml(n.message)}</div>
          <div class="notif-meta">
            <span>${escapeHtml(dateStr)}</span>
            ${n.link_url ? `• <a href="${escapeHtml(targetHref)}" style="color: var(--color-primary); font-weight: 500; text-decoration: none;">View Details →</a>` : ''}
          </div>
        </div>
        <div class="notif-actions">
          ${isUnread ? `
            <button class="action-btn btn-single-read" data-notif-id="${n.id}" title="Mark as read">
              ✓ Read
            </button>
          ` : `
            <span style="font-size: 12px; color: var(--color-text-secondary);">✓ Read</span>
          `}
        </div>
      </div>
    `;
  };

  const handleMarkSingleRead = async (id) => {
    try {
      await APP.api.patch(`/notifications/${id}/read`);
      const item = allNotifications.find((n) => String(n.id) === String(id));
      if (item) item.is_read = true;
      renderNotifications();
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      if (btnHeaderReadAll) btnHeaderReadAll.disabled = true;
      await APP.api.post("/notifications/mark-all-read");
      allNotifications.forEach((n) => (n.is_read = true));
      renderNotifications();
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    } finally {
      if (btnHeaderReadAll) btnHeaderReadAll.disabled = false;
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
  document.addEventListener("DOMContentLoaded", NOTIFICATIONS.init);
} else {
  NOTIFICATIONS.init();
}
