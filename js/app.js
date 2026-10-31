/**
 * RAMPART — Main Application Shell
 * Handles sidebar toggle, navigation, and common layout interactions.
 * Every page will include this script to enable shared functionality.
 */

const APP = (() => {
  // DOM Elements
  let appShell;
  let sidebar;
  let overlay;
  let menuToggle;
  let currentPage = "dashboard";

  const init = () => {
    appShell = document.querySelector(".app-shell");
    sidebar = document.querySelector(".app-sidebar");
    overlay = document.querySelector(".app-overlay");
    menuToggle = document.querySelector(".app-header__menu-toggle");

    // Attach event listeners
    if (menuToggle) {
      menuToggle.addEventListener("click", toggleMobileNav);
    }

    if (overlay) {
      overlay.addEventListener("click", closeMobileNav);
    }

    // Close sidebar on nav link click (mobile)
    const navLinks = document.querySelectorAll(".nav-link");
    navLinks.forEach((link) => {
      link.addEventListener("click", () => {
        if (isMediaMobile()) {
          closeMobileNav();
        }
      });
    });

    // Handle window resize
    window.addEventListener("resize", handleResize);

    // Initialize page-specific logic
    initPage();

    // Initialize notification header bell
    initHeaderNotificationBell();
  };

  const initHeaderNotificationBell = async () => {
    const notifButtons = document.querySelectorAll('button[title="Notifications"], #header-btn-notifications');
    if (!notifButtons || notifButtons.length === 0) return;

    notifButtons.forEach((btn) => {
      btn.style.position = "relative";
      btn.addEventListener("click", () => {
        const isPagesDir = window.location.pathname.includes("/pages/");
        window.location.href = isPagesDir ? "notifications.html" : "pages/notifications.html";
      });
    });

    try {
      const res = await api.get("/notifications");
      const notifs = Array.isArray(res) ? res : (res.data || []);
      const unreadCount = notifs.filter((n) => !n.is_read).length;

      if (unreadCount > 0) {
        notifButtons.forEach((btn) => {
          let badge = btn.querySelector(".app-notif-badge");
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "app-notif-badge";
            badge.style.position = "absolute";
            badge.style.top = "-5px";
            badge.style.right = "-5px";
            badge.style.background = "var(--color-danger)";
            badge.style.color = "white";
            badge.style.borderRadius = "10px";
            badge.style.fontSize = "10px";
            badge.style.fontWeight = "bold";
            badge.style.padding = "1px 5px";
            badge.style.lineHeight = "1.2";
            badge.style.border = "2px solid var(--color-surface)";
            btn.appendChild(badge);
          }
          badge.textContent = unreadCount;
        });
      }
    } catch (_) {}
  };

  const toggleMobileNav = () => {
    if (appShell.classList.contains("is-mobile-nav-open")) {
      closeMobileNav();
    } else {
      openMobileNav();
    }
  };

  const openMobileNav = () => {
    appShell.classList.add("is-mobile-nav-open");
    document.body.style.overflow = "hidden";
  };

  const closeMobileNav = () => {
    appShell.classList.remove("is-mobile-nav-open");
    document.body.style.overflow = "";
  };

  const handleResize = () => {
    // Close mobile nav if we've resized back to desktop
    if (!isMediaMobile()) {
      closeMobileNav();
    }
  };

  const isMediaMobile = () => {
    return window.matchMedia("(max-width: 767px)").matches;
  };

  /**
   * Mark current navigation item as active based on data-page attribute
   * Each page sets this in the app-shell element or nav links have data-page
   */
  const setActivePage = (pageKey) => {
    currentPage = pageKey;
    const navLinks = document.querySelectorAll(".nav-link");
    navLinks.forEach((link) => {
      if (link.dataset.page === pageKey) {
        link.classList.add("is-active");
      } else {
        link.classList.remove("is-active");
      }
    });
  };

  /**
   * initPage — Called on every page load. Each page HTML can override
   * or extend this via a script tag to run page-specific logic.
   */
  const initPage = () => {
    // Detect current page from data attribute
    const shell = document.querySelector(".app-shell");
    if (shell && shell.dataset.page) {
      setActivePage(shell.dataset.page);
    }
  };

  /**
   * API helper for backend integration.
   * Provides consistent communication with the FastAPI backend.
   */
  const api = {
    baseUrl: (typeof window !== "undefined" && window.API_BASE_URL) || "http://127.0.0.1:8000/api",

    async get(endpoint) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          let errDetail = `HTTP ${response.status}`;
          try {
            const errJson = await response.json();
            errDetail = errJson.detail || errJson.message || errDetail;
          } catch (_) {}
          throw new Error(errDetail);
        }
        const result = await response.json();
        if (result && typeof result === "object" && "data" in result && result.data !== undefined) {
          return result.data;
        }
        return result;
      } catch (error) {
        console.error(`GET ${endpoint} failed:`, error);
        throw error;
      }
    },

    async post(endpoint, data) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          let errDetail = `HTTP ${response.status}`;
          try {
            const errJson = await response.json();
            errDetail = errJson.detail || errJson.message || errDetail;
          } catch (_) {}
          throw new Error(errDetail);
        }
        const result = await response.json();
        if (result && typeof result === "object" && "data" in result && result.data !== undefined) {
          return result.data;
        }
        return result;
      } catch (error) {
        console.error(`POST ${endpoint} failed:`, error);
        throw error;
      }
    },

    async put(endpoint, data) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          let errDetail = `HTTP ${response.status}`;
          try {
            const errJson = await response.json();
            errDetail = errJson.detail || errJson.message || errDetail;
          } catch (_) {}
          throw new Error(errDetail);
        }
        const result = await response.json();
        if (result && typeof result === "object" && "data" in result && result.data !== undefined) {
          return result.data;
        }
        return result;
      } catch (error) {
        console.error(`PUT ${endpoint} failed:`, error);
        throw error;
      }
    },

    async patch(endpoint, data) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data || {}),
        });
        if (!response.ok) {
          let errDetail = `HTTP ${response.status}`;
          try {
            const errJson = await response.json();
            errDetail = errJson.detail || errJson.message || errDetail;
          } catch (_) {}
          throw new Error(errDetail);
        }
        const result = await response.json();
        if (result && typeof result === "object" && "data" in result && result.data !== undefined) {
          return result.data;
        }
        return result;
      } catch (error) {
        console.error(`PATCH ${endpoint} failed:`, error);
        throw error;
      }
    },

    async delete(endpoint) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          let errDetail = `HTTP ${response.status}`;
          try {
            const errJson = await response.json();
            errDetail = errJson.detail || errJson.message || errDetail;
          } catch (_) {}
          throw new Error(errDetail);
        }
        return true;
      } catch (error) {
        console.error(`DELETE ${endpoint} failed:`, error);
        throw error;
      }
    },
  };

  // Public API
  return {
    init,
    setActivePage,
    api,
    isMediaMobile,
  };
})();

// Initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", APP.init);
} else {
  APP.init();
}
