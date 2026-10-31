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
   * API helper — for future backend integration.
   * Provides a consistent way to call backend endpoints.
   */
  const api = {
    baseUrl: process.env.API_BASE_URL || "http://localhost:8000/api",

    async get(endpoint) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
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
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
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
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        console.error(`PUT ${endpoint} failed:`, error);
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
          throw new Error(`HTTP ${response.status}`);
        }
        return response.ok;
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
