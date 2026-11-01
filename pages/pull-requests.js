/**
 * RAMPART — Pull Requests Management Page
 * Real backend integration, repository filtering, live diff fetching,
 * and local PR analysis agent separating Observed Evidence from AI Conclusions.
 */

const PULL_REQUESTS = (() => {
  // State
  let allPullRequests = [];
  let allRepositories = [];
  let filteredPullRequests = [];
  let currentFilter = "all";
  let currentRepoId = "";
  let currentSearch = "";
  let selectedPRId = null;

  // DOM Elements
  const overviewContainer = document.getElementById("overview-container");
  const repoSelect = document.getElementById("repo-filter");
  const searchInput = document.getElementById("search-prs");
  const filterBtns = document.querySelectorAll(".filter-btn");
  const prTable = document.getElementById("pr-table");
  const prTbody = document.getElementById("pr-tbody");
  const emptyState = document.getElementById("empty-state");
  const detailsModal = document.getElementById("pr-details-modal");
  const modalBody = document.getElementById("modal-body");
  const closeModalBtn = document.getElementById("close-modal-btn");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const modalAnalyzeBtn = document.getElementById("modal-analyze-btn");
  const appOverlay = document.querySelector(".app-overlay");

  const init = async () => {
    attachEventListeners();
    await Promise.all([loadRepositories(), loadPullRequests()]);
  };

  const attachEventListeners = () => {
    if (closeModalBtn) closeModalBtn.addEventListener("click", closeDetailsModal);
    if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeDetailsModal);
    if (appOverlay) appOverlay.addEventListener("click", closeDetailsModal);

    if (modalAnalyzeBtn) {
      modalAnalyzeBtn.addEventListener("click", () => {
        if (selectedPRId) {
          handleAnalyze(selectedPRId);
        }
      });
    }

    if (repoSelect) {
      repoSelect.addEventListener("change", (e) => {
        currentRepoId = e.target.value;
        applyFiltersAndSearch();
      });
    }

    filterBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        filterBtns.forEach((b) => b.classList.remove("active"));
        e.target.classList.add("active");
        currentFilter = e.target.dataset.filter;
        applyFiltersAndSearch();
      });
    });

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        currentSearch = e.target.value.toLowerCase();
        applyFiltersAndSearch();
      });
    }
  };

  /**
   * Load repositories from API for selector dropdown
   */
  const loadRepositories = async () => {
    if (!repoSelect) return;
    try {
      const response = await APP.api.get("/repositories");
      allRepositories = Array.isArray(response) ? response : (response.data || []);
      
      let optionsHTML = '<option value="">All Repositories</option>';
      allRepositories.forEach((repo) => {
        const repoName = repo.full_name || `${repo.owner}/${repo.name}`;
        optionsHTML += `<option value="${repo.id}">${escapeHtml(repoName)}</option>`;
      });
      repoSelect.innerHTML = optionsHTML;
    } catch (error) {
      console.warn("Failed to load repositories for selector:", error);
    }
  };

  /**
   * Load pull requests from API
   */
  const loadPullRequests = async () => {
    try {
      if (overviewContainer) {
        overviewContainer.innerHTML =
          '<div style="grid-column: 1/-1; text-align: center; padding: var(--space-5);"><div class="loading-spinner" style="display: inline-block;"></div> Loading pull requests from RAMPART backend...</div>';
      }

      const response = await APP.api.get("/pull-requests");
      allPullRequests = Array.isArray(response) ? response : (response.data || response.pull_requests || []);

      applyFiltersAndSearch();
      renderOverview();
      renderTable();
    } catch (error) {
      console.error("Failed to load pull requests:", error);
      showError("Failed to load pull requests from backend. Please verify http://127.0.0.1:8000 is running.");
      if (overviewContainer) overviewContainer.innerHTML = "";
      if (prTbody) {
        prTbody.innerHTML =
          '<tr><td colspan="7" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">Unable to connect to backend. Please verify http://127.0.0.1:8000 is running.</td></tr>';
      }
    }
  };

  /**
   * Apply repository filter, status filter, and text search
   */
  const applyFiltersAndSearch = () => {
    let filtered = allPullRequests;

    // Apply repository filter
    if (currentRepoId) {
      filtered = filtered.filter((pr) => String(pr.repo_id) === String(currentRepoId));
    }

    // Apply status filter
    if (currentFilter !== "all") {
      filtered = filtered.filter((pr) => {
        const state = (pr.status || pr.state || "").toLowerCase();
        return state === currentFilter.toLowerCase();
      });
    }

    // Apply text search
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
   * Render overview summary cards
   */
  const renderOverview = () => {
    if (!overviewContainer) return;
    const total = allPullRequests.length;
    const open = allPullRequests.filter((pr) => (pr.status || pr.state) === "open").length;
    const merged = allPullRequests.filter((pr) => (pr.status || pr.state) === "merged").length;
    const flagged = allPullRequests.filter(
      (pr) => pr.risk_level === "HIGH" || pr.risk_level === "MEDIUM"
    ).length;

    const stats = [
      { label: "Total Pull Requests", value: total },
      { label: "Open", value: open },
      { label: "Merged", value: merged },
      { label: "Flagged / Elevated Risk", value: flagged },
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
    if (!prTable || !prTbody || !emptyState) return;

    if (filteredPullRequests.length === 0 && allPullRequests.length === 0) {
      prTable.style.display = "none";
      emptyState.style.display = "block";
      return;
    }

    prTable.style.display = "table";
    emptyState.style.display = "none";

    if (filteredPullRequests.length === 0) {
      prTbody.innerHTML =
        '<tr><td colspan="8" style="text-align: center; padding: var(--space-5); color: var(--color-text-secondary);">No pull requests match the selected filters.</td></tr>';
      return;
    }

    prTbody.innerHTML = filteredPullRequests
      .map((pr) => renderPRRow(pr))
      .join("");

    // Attach event listeners for row actions (Only View action is present)
    document.querySelectorAll(".btn-view-pr").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openDetailsModal(btn.dataset.prId);
      });
    });
  };

  /**
   * Render a single PR table row
   */
  const renderPRRow = (pr) => {
    const createdDate = pr.created_at
      ? new Date(pr.created_at).toLocaleDateString()
      : "Unknown";
    const statusVal = (pr.status || pr.state || "open").toLowerCase();
    const reviewStatus = pr.review_status || (pr.risk_level === "HIGH" ? "changes_requested" : (statusVal === "merged" ? "approved" : "pending"));
    const prNumber = pr.number ?? pr.pr_number ?? "?";
    const authorName = pr.author || pr.contributor_username || "—";
    const repoName = pr.repository || pr.repo_full_name || "—";

    let riskBadge = "";
    if (pr.risk_level === "HIGH") {
      riskBadge = '<span class="status-badge closed" style="margin-left: 6px; font-size: 10px;">HIGH RISK</span>';
    } else if (pr.risk_level === "MEDIUM") {
      riskBadge = '<span class="status-badge open" style="margin-left: 6px; font-size: 10px; background: #fef3c7; color: #b45309; border-color: #fde68a;">MEDIUM RISK</span>';
    } else if (pr.risk_level === "LOW") {
      riskBadge = '<span class="status-badge merged" style="margin-left: 6px; font-size: 10px;">LOW RISK</span>';
    }

    // PR Quality Pill
    const quality = (pr.quality_category || (pr.risk_level === "HIGH" ? "FLAGGED" : (pr.risk_level === "MEDIUM" ? "AVERAGE" : "GOOD"))).toUpperCase();
    let qualityClass = "good";
    if (quality === "FLAGGED") qualityClass = "flagged";
    else if (quality === "SPAM") qualityClass = "spam";
    else if (quality === "AVERAGE") qualityClass = "average";
    const qualityPill = `<span class="quality-pill ${qualityClass}">${escapeHtml(quality)}</span>`;

    // Contributor status badge without exposing raw numeric score
    const contribStatus = (pr.contributor_status || "BEGINNER").toLowerCase();
    const contribBadge = `<span class="contributor-badge ${contribStatus}">${escapeHtml(pr.contributor_status || "BEGINNER")}</span>`;

    return `
      <tr>
        <td>
          <div class="pr-title-cell">
            <span class="pr-icon">🔀</span>
            <div class="pr-info">
              <div class="pr-title" data-pr-id="${pr.id}">${escapeHtml(pr.title)}</div>
              <div class="pr-number">#${prNumber} ${riskBadge}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="pr-repo">${escapeHtml(repoName)}</div>
        </td>
        <td>
          <div style="display: flex; align-items: center; flex-wrap: wrap;">
            <span style="font-weight: var(--font-weight-medium);">${escapeHtml(authorName)}</span>
            ${contribBadge}
          </div>
        </td>
        <td>
          <span class="status-badge ${statusVal}">${statusVal.charAt(0).toUpperCase() + statusVal.slice(1)}</span>
        </td>
        <td>
          ${qualityPill}
        </td>
        <td>
          <span class="review-badge ${reviewStatus}">${
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
            <button class="action-btn btn-view-pr" data-pr-id="${pr.id}" title="View details and evidence">
              👁️ View
            </button>
          </div>
        </td>
      </tr>
    `;
  };

  /**
   * Open PR details modal with complete evidence and AI analysis
   */
  const openDetailsModal = async (prId) => {
    selectedPRId = prId;
    let pr = allPullRequests.find((p) => String(p.id) === String(prId));

    if (!detailsModal || !modalBody) return;

    // Fetch full PR details from backend to ensure active alerts and full analysis data are present
    try {
      const resp = await APP.api.get(`/pull-requests/${prId}`);
      if (resp) {
        pr = resp.data || resp;
      }
    } catch (e) {
      console.warn("Could not fetch PR detail, using cached:", e);
    }

    if (!pr) {
      showError("Pull request not found");
      return;
    }

    const prNumber = pr.number ?? pr.pr_number ?? "?";
    const repoName = pr.repository || pr.repo_full_name || "—";
    const authorName = pr.author || pr.contributor_username || "Unknown";
    const statusVal = (pr.status || pr.state || "open").toLowerCase();
    const reviewStatus = pr.review_status || (pr.risk_level === "HIGH" ? "changes_requested" : (statusVal === "merged" ? "approved" : "pending"));
    const contributorStatus = pr.contributor_status || "BEGINNER";

    document.getElementById("modal-pr-title").textContent = pr.title;
    document.getElementById("modal-pr-number").textContent = `#${prNumber} in ${repoName}`;

    // Priority Decision Banner Calculation
    const priority = pr.priority_decision || (
      pr.risk_level === "HIGH" ? "HIGH-RISK FLAG" :
      (pr.quality_category === "GOOD" && (contributorStatus === "BEGINNER" || contributorStatus === "NEW") ? "REVIEW — PROMISING CONTRIBUTION" :
      (pr.quality_category === "GOOD" ? "PRIORITY REVIEW" :
      (pr.quality_category === "SPAM" ? "SPAM" : "NORMAL REVIEW")))
    );

    let bannerClass = "normal";
    let bannerIcon = "📋";
    if (priority.includes("PRIORITY")) {
      bannerClass = "priority-review";
      bannerIcon = "⭐";
    } else if (priority.includes("PROMISING")) {
      bannerClass = "promising";
      bannerIcon = "🌱";
    } else if (priority.includes("FLAG")) {
      bannerClass = "flagged";
      bannerIcon = "⚠️";
    } else if (priority.includes("SPAM")) {
      bannerClass = "spam";
      bannerIcon = "🚫";
    }

    const priorityBannerHTML = `
      <div class="priority-banner ${bannerClass}">
        <span>${bannerIcon} ${escapeHtml(priority)}</span>
        <span style="font-size: 11px; font-weight: normal; text-transform: uppercase;">Decision Recommendation</span>
      </div>
    `;

    // Render basic overview
    let detailsHTML = `
      ${priorityBannerHTML}
      <div class="pr-section-card" style="margin-bottom: var(--space-4);">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-3);">
          <div>
            <div class="pr-details-label">Author</div>
            <div style="font-weight: var(--font-weight-semibold);">${escapeHtml(authorName)}</div>
            <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">
              Status: <span class="contributor-badge ${contributorStatus.toLowerCase()}">${escapeHtml(contributorStatus)}</span>
            </div>
          </div>
          <div>
            <div class="pr-details-label">Status</div>
            <span class="status-badge ${statusVal}">${statusVal.toUpperCase()}</span>
          </div>
          <div>
            <div class="pr-details-label">Review Status</div>
            <span class="review-badge ${reviewStatus}">${
              reviewStatus === "approved" ? "Approved" : (reviewStatus === "changes_requested" ? "Changes Requested" : "Pending Review")
            }</span>
          </div>
          <div>
            <div class="pr-details-label">Quality Category</div>
            <span class="quality-pill ${(pr.quality_category || 'good').toLowerCase()}">
              ${escapeHtml(pr.quality_category || "GOOD")}
            </span>
          </div>
        </div>
      </div>
    `;

    // PR description
    const desc = pr.description || pr.body;
    if (desc) {
      detailsHTML += `
        <div class="pr-details-section">
          <div class="pr-details-label">PR Description</div>
          <div class="pr-details-description">${escapeHtml(desc)}</div>
        </div>
      `;
    }

    // Render existing structured analysis if available
    let analysisData = pr.analysis_data;
    if (typeof analysisData === "string") {
      try {
        analysisData = JSON.parse(analysisData);
      } catch (_) {}
    }
    if (analysisData && typeof analysisData === "object") {
      detailsHTML += renderStructuredReportHTML(analysisData);
    } else {
      detailsHTML += `
        <div class="pr-analysis-section" id="modal-analysis-container" style="text-align: center; padding: var(--space-4);">
          <div style="color: var(--color-text-secondary); margin-bottom: var(--space-3); font-size: var(--font-size-sm);">
            No deep pattern analysis on record for this pull request.
          </div>
          <button class="btn btn-primary" onclick="PULL_REQUESTS.runModalAnalysis()">
            ✨ Run Local Agent Analysis
          </button>
        </div>
      `;
    }

    modalBody.innerHTML = detailsHTML;
    detailsModal.classList.add("open");
  };

  /**
   * Render HTML for Observed Evidence and AI Conclusions
   * Implements the 9-part structured report:
   * 1. Overall Assessment
   * 2. What Changed
   * 3. Technical Findings
   * 4. Potential Bugs and Risks
   * 5. Security and Reliability
   * 6. Test Evidence
   * 7. Recommended Improvements
   * 8. Final AI Recommendation
   * 9. Evidence References
   */
  const renderStructuredReportHTML = (analysis) => {
    const evidence = analysis.observed_evidence || {};
    const ai = analysis.ai_analysis || {};
    const modelRuntime = analysis.model_runtime || ai.model_runtime || {};
    const findings = analysis.findings || [];

    const isAiOnline = modelRuntime.status === "online" && ai.is_ai_generated;
    const runtimeBadgeText = isAiOnline
      ? "🤖 Gemma 4 E4B — Local Ollama"
      : "⚠️ Rule-Based Fallback (Ollama Offline)";

    // 1. Overall Assessment
    const overallAssessment = ai.overall_assessment || ai.technical_summary || analysis.analysis_summary || "Standard technical contribution.";

    // 2. What Changed
    const whatChanged = ai.what_changed || ai.technical_summary || `Modified ${evidence.files_changed_count ?? 1} file(s) (+${evidence.additions ?? 0} / -${evidence.deletions ?? 0}).`;

    // 3. Technical Findings
    const techFindings = ai.technical_findings || [];

    // 4. Potential Bugs & Risks
    const bugsAndRisks = ai.potential_bugs_and_risks || ai.architectural_concerns || [];

    // 5. Security & Reliability
    const secInfo = ai.security_and_reliability || {
      has_security_concerns: analysis.risk_level === "HIGH",
      summary: analysis.risk_level === "HIGH" ? "Elevated security risks detected." : "No critical security risks identified.",
      concerns: []
    };
    const secConcerns = secInfo.concerns || [];

    // 6. Test Evidence
    const testEv = ai.test_evidence || {};
    const executionStatus = testEv.execution_status || evidence.test_execution_status || "NOT_EXECUTED";
    const testAssessment = testEv.assessment || ai.test_assessment || `Automated tests were ${executionStatus}.`;
    const missingTests = testEv.missing_tests || [];
    const testFiles = evidence.test_files || [];
    const isTestPass = evidence.has_test_evidence;

    // 7. Recommended Improvements
    const recommendations = ai.recommended_improvements || ai.recommendations || [];

    // 8. Final AI Recommendation
    const finalRec = ai.final_ai_recommendation || (analysis.risk_level === "HIGH" ? "REQUEST CHANGES" : (analysis.risk_level === "MEDIUM" ? "NEEDS HUMAN REVIEW" : "APPROVE"));
    const recReason = ai.recommendation_reason || overallAssessment;
    let recBadgeClass = "approve";
    let recIcon = "✓";
    if (finalRec === "REQUEST CHANGES") {
      recBadgeClass = "request-changes";
      recIcon = "✕";
    } else if (finalRec === "NEEDS HUMAN REVIEW") {
      recBadgeClass = "human-review";
      recIcon = "⚠️";
    }

    // 9. Evidence References
    const references = ai.evidence_references || evidence.files_list || [];

    let html = `
      <!-- 1. OVERALL ASSESSMENT -->
      <div class="pr-section-card" style="border-left: 4px solid var(--color-primary);">
        <div class="pr-section-card__header">
          <span class="pr-section-card__title">
            <span>🎯 1. Overall Assessment</span>
          </span>
          <span class="model-runtime-badge ${isAiOnline ? '' : 'offline'}">
            ${escapeHtml(runtimeBadgeText)}
          </span>
        </div>
        ${
          modelRuntime.blocker
            ? `<div style="background: #f8fafc; border: 1px solid var(--color-border); border-radius: 4px; padding: 6px 10px; font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--space-3);">
                <strong>Runtime Note:</strong> ${escapeHtml(modelRuntime.blocker)}
              </div>`
            : ""
        }
        <div style="font-size: var(--font-size-sm); line-height: 1.5; color: var(--color-text-primary);">
          ${escapeHtml(overallAssessment)}
        </div>
      </div>

      <!-- 2. WHAT CHANGED -->
      <div class="pr-section-card">
        <div class="pr-section-card__header">
          <span class="pr-section-card__title">
            <span>📝 2. What Changed</span>
          </span>
          <span style="font-size: 11px; color: var(--color-text-secondary);">
            +${evidence.additions ?? 0} / -${evidence.deletions ?? 0} in ${evidence.files_changed_count ?? 1} file(s)
          </span>
        </div>
        <div style="font-size: var(--font-size-sm); line-height: 1.5; color: var(--color-text-primary); margin-bottom: var(--space-2);">
          ${escapeHtml(whatChanged)}
        </div>
        ${
          (evidence.files_list || []).length > 0
            ? `<div style="margin-top: 6px;">
                ${(evidence.files_list || []).map(f => `<span class="pr-file-tag">${escapeHtml(f)}</span>`).join("")}
              </div>`
            : ""
        }
      </div>

      <!-- 3. TECHNICAL FINDINGS -->
      <div class="pr-section-card">
        <div class="pr-section-card__header">
          <span class="pr-section-card__title">
            <span>🔍 3. Technical Findings (${techFindings.length})</span>
          </span>
        </div>
        ${
          techFindings.length > 0
            ? techFindings.map(tf => `
                <div class="finding-card">
                  <div class="finding-card__header">
                    <span class="finding-card__file">${escapeHtml(tf.file || "unknown")}</span>
                    <span class="finding-card__loc">${escapeHtml(tf.location || "NOT VERIFIED")}</span>
                  </div>
                  <div style="font-weight: var(--font-weight-medium); margin-bottom: 4px;">
                    ${escapeHtml(tf.issue || "")}
                  </div>
                  <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: 6px;">
                    <strong>Why it matters:</strong> ${escapeHtml(tf.why_it_matters || "")}
                  </div>
                  <div style="font-size: 12px; color: #166534; background: #f0fdf4; padding: 4px 8px; border-radius: 4px;">
                    💡 <strong>Suggested Improvement:</strong> ${escapeHtml(tf.suggested_improvement || "")}
                  </div>
                </div>
              `).join("")
            : `<div style="font-size: 12px; color: var(--color-text-secondary); font-style: italic;">
                No specific code defects or technical issues identified in the reviewed changes.
              </div>`
        }
      </div>

      <!-- 4. POTENTIAL BUGS AND RISKS -->
      <div class="pr-section-card">
        <div class="pr-section-card__header">
          <span class="pr-section-card__title">
            <span>🐛 4. Potential Bugs and Risks</span>
          </span>
        </div>
        ${
          bugsAndRisks.length > 0
            ? `<ul style="margin: 0 0 0 16px; padding: 0; font-size: 12px; line-height: 1.5;">
                ${bugsAndRisks.map(b => `<li>${escapeHtml(typeof b === 'string' ? b : JSON.stringify(b))}</li>`).join("")}
              </ul>`
            : `<div style="font-size: 12px; color: var(--color-text-secondary);">
                Zero runtime bugs or behavioral risk conditions observed in this diff.
              </div>`
        }
      </div>

      <!-- 5. SECURITY AND RELIABILITY -->
      <div class="pr-section-card" style="border-left: 4px solid ${secInfo.has_security_concerns ? '#dc2626' : '#16a34a'};">
        <div class="pr-section-card__header">
          <span class="pr-section-card__title">
            <span>🛡️ 5. Security & Reliability</span>
          </span>
          <span class="review-badge ${secInfo.has_security_concerns ? 'changes_requested' : 'approved'}">
            ${secInfo.has_security_concerns ? '⚠️ Concerns Identified' : '✓ Verified Secure'}
          </span>
        </div>
        <div style="font-size: var(--font-size-sm); margin-bottom: var(--space-2);">
          ${escapeHtml(secInfo.summary || "Static security inspection completed.")}
        </div>
        ${
          secConcerns.length > 0
            ? `<ul style="margin: 4px 0 0 16px; padding: 0; font-size: 12px; color: #dc2626;">
                ${secConcerns.map(c => `<li>${escapeHtml(c)}</li>`).join("")}
              </ul>`
            : ""
        }
      </div>

      <!-- 6. TEST EVIDENCE -->
      <div class="pr-section-card">
        <div class="pr-section-card__header">
          <span class="pr-section-card__title">
            <span>🧪 6. Test Evidence</span>
          </span>
          <span class="review-badge ${isTestPass ? 'approved' : 'pending'}" style="font-size: 10px;">
            Execution: ${escapeHtml(executionStatus)}
          </span>
        </div>
        <div style="font-size: var(--font-size-sm); margin-bottom: var(--space-2);">
          ${escapeHtml(testAssessment)}
        </div>
        ${
          testFiles.length > 0
            ? `<div style="font-size: 12px; margin-bottom: 6px;">
                <strong>Identified Test Suites:</strong> 
                ${testFiles.map(f => `<span class="pr-file-tag" style="background: rgba(34,197,94,0.1); border-color: #86efac; color: #166534;">${escapeHtml(f)}</span>`).join("")}
                <span style="font-size: 11px; color: var(--color-text-muted);">[Status: ${escapeHtml(executionStatus)}]</span>
              </div>`
            : ""
        }
        ${
          missingTests.length > 0
            ? `<div style="font-size: 12px; color: #b45309; background: #fffbeb; padding: 6px 10px; border-radius: 4px; border: 1px solid #fef3c7; margin-top: 6px;">
                <strong>Recommended Test Additions:</strong>
                ${missingTests.map(t => `<span class="pr-file-tag" style="background: white; border-color: #fde68a;">${escapeHtml(t)}</span>`).join("")}
              </div>`
            : ""
        }
      </div>

      <!-- 7. RECOMMENDED IMPROVEMENTS -->
      <div class="pr-section-card">
        <div class="pr-section-card__header">
          <span class="pr-section-card__title">
            <span>💡 7. Recommended Improvements</span>
          </span>
        </div>
        ${
          recommendations.length > 0
            ? `<ul style="margin: 0 0 0 16px; padding: 0; font-size: 12px; line-height: 1.5; color: var(--color-text-primary);">
                ${recommendations.map(r => `<li>${escapeHtml(typeof r === 'string' ? r : JSON.stringify(r))}</li>`).join("")}
              </ul>`
            : `<div style="font-size: 12px; color: var(--color-text-secondary);">
                No further technical improvements required. PR is clean and ready.
              </div>`
        }
      </div>

      <!-- 8. FINAL AI RECOMMENDATION -->
      <div class="pr-section-card" style="border-left: 4px solid ${finalRec === 'APPROVE' ? '#16a34a' : (finalRec === 'REQUEST CHANGES' ? '#dc2626' : '#f59e0b')};">
        <div class="pr-section-card__header">
          <span class="pr-section-card__title">
            <span>⚖️ 8. Final AI Recommendation</span>
          </span>
          <span class="ai-rec-badge ${recBadgeClass}">
            ${recIcon} ${escapeHtml(finalRec)}
          </span>
        </div>
        <div style="font-size: var(--font-size-sm); margin-bottom: var(--space-3); line-height: 1.5;">
          <strong>Reasoning:</strong> ${escapeHtml(recReason)}
        </div>
        <div style="font-size: 11px; color: var(--color-text-secondary); background: var(--color-bg); padding: 8px 12px; border-radius: 4px; border: 1px dashed var(--color-border);">
          <strong>Maintainer Sovereignty:</strong> RAMPART AI analysis is strictly advisory. The repository maintainer retains ultimate authority over review, approval, and merging.
        </div>
      </div>

      <!-- 9. EVIDENCE REFERENCES -->
      <div class="pr-section-card">
        <div class="pr-section-card__header">
          <span class="pr-section-card__title">
            <span>📌 9. Evidence References</span>
          </span>
          <span style="font-size: 11px; color: var(--color-text-secondary);">
            Risk Score: ${analysis.risk_score ?? 10}/100 • ${analysis.risk_level || "LOW"}
          </span>
        </div>
        <div style="font-size: 12px;">
          ${
            references.length > 0
              ? references.map(ref => `<code style="background: var(--color-bg); padding: 3px 8px; border-radius: 4px; margin-right: 6px; margin-bottom: 4px; display: inline-block; border: 1px solid var(--color-border);">${escapeHtml(typeof ref === 'string' ? ref : JSON.stringify(ref))}</code>`).join("")
              : '<span style="color: var(--color-text-secondary);">No external evidence references recorded.</span>'
          }
        </div>
      </div>

      <!-- 10. EVALUATED SIGNALS & NETWORK FINDINGS -->
      ${
        findings.length > 0
          ? `<div class="pr-section-card">
              <div class="pr-section-card__header">
                <span class="pr-section-card__title">
                  <span>📋 Evaluated Signals & Trust Network Findings (${findings.length})</span>
                </span>
              </div>
              <div class="pr-analysis-findings">
                ${findings.map(finding => {
                  const sev = (finding.severity || "info").toLowerCase();
                  const alertClass = sev === "caution" ? "danger" : (sev === "warning" ? "warning" : "info");
                  return `
                    <div class="alert alert-${alertClass}" style="margin-bottom: var(--space-2); padding: var(--space-3);">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="font-size: 13px;">${escapeHtml(finding.title)}</strong>
                        <span style="font-size: 10px; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.06);">
                          ${escapeHtml(finding.category || "Signal")}
                        </span>
                      </div>
                      <div style="font-size: 12px; margin-top: 4px; color: var(--color-text-secondary);">
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
                }).join("")}
              </div>
            </div>`
          : ""
      }
    `;

    return html;
  };

  /**
   * Close details modal
   */
  const closeDetailsModal = () => {
    if (detailsModal) detailsModal.classList.remove("open");
    selectedPRId = null;
  };

  /**
   * Analyze PR with backend pattern engine and local agent
   */
  const handleAnalyze = async (prId) => {
    const pr = allPullRequests.find((p) => String(p.id) === String(prId));

    if (!pr) {
      showError("Pull request not found");
      return;
    }

    try {
      if (!detailsModal.classList.contains("open")) {
        await openDetailsModal(prId);
      }

      // Show animated loading state inside modal
      let analysisContainer = document.getElementById("modal-analysis-container");
      if (!analysisContainer) {
        analysisContainer = document.createElement("div");
        analysisContainer.id = "modal-analysis-container";
        analysisContainer.className = "pr-details-section";
        modalBody.appendChild(analysisContainer);
      }

      analysisContainer.innerHTML = `
        <div style="text-align: center; padding: var(--space-5); background: var(--color-bg); border-radius: var(--radius-md); border: 1px dashed var(--color-border);">
          <div class="loading-spinner" style="margin-bottom: var(--space-2);"></div>
          <div style="font-weight: var(--font-weight-semibold); color: var(--color-text-primary);">
            Executing RAMPART PR Analysis Agent...
          </div>
          <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">
            Fetching GitHub diff • Checking test evidence • Verifying Trust Network
          </div>
        </div>
      `;

      // Call backend analysis endpoint
      const analysisResult = await APP.api.post(`/pull-requests/${prId}/analyze`, {});
      const resultData = analysisResult.data || analysisResult;

      // Update PR details in place
      pr.risk_level = resultData.risk_level;
      pr.analysis_summary = resultData.analysis_summary;
      pr.analysis_data = resultData;

      // Render updated structured report
      await openDetailsModal(prId);

      // Refresh PR list to reflect updated risk level in table
      const updatedList = await APP.api.get("/pull-requests");
      allPullRequests = Array.isArray(updatedList) ? updatedList : (updatedList.data || allPullRequests);
      applyFiltersAndSearch();
      renderOverview();
      showSuccess(`PR #${pr.number ?? pr.pr_number} analyzed successfully (Risk: ${resultData.risk_level})`);
    } catch (error) {
      console.error("Failed to analyze PR:", error);
      showError("Failed to analyze pull request: " + (error.message || "Network error"));
    }
  };

  const runModalAnalysis = () => {
    if (selectedPRId) {
      handleAnalyze(selectedPRId);
    }
  };

  /**
   * Alert Messages
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
      setTimeout(() => alert.remove(), 6000);
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
   * Utility: Escape HTML
   */
  const escapeHtml = (text) => {
    if (text === null || text === undefined) return "";
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  };

  return {
    init,
    runModalAnalysis,
  };
})();

// Initialize on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", PULL_REQUESTS.init);
} else {
  PULL_REQUESTS.init();
}