/**
 * RAMPART — Trust Network Visual Graph
 * Interactive Force-Directed Canvas Network Graph with Evidence Inspector
 */

(function () {
  'use strict';

  const API_BASE = 'http://127.0.0.1:8000/api';

  // State
  let rawNodes = [];
  let rawEdges = [];
  let graphNodes = [];
  let graphEdges = [];
  let selectedNode = null;
  let selectedEdge = null;
  let hoveredNode = null;

  let filterNodeType = 'all';
  let filterStatus = 'all';
  let searchQuery = '';

  // Canvas & Physics
  const canvas = document.getElementById('network-canvas');
  const ctx = canvas.getContext('2d');
  let animationFrameId = null;
  let isSimulating = true;
  let alpha = 1.0; // Simulation temperature

  // Camera & Interaction
  let transform = { x: 0, y: 0, k: 1 };
  let isDraggingCanvas = false;
  let dragStart = { x: 0, y: 0 };
  let draggedNode = null;

  // DOM Elements
  const inspectorTitle = document.getElementById('inspector-title');
  const inspectorSubtitle = document.getElementById('inspector-subtitle');
  const inspectorContent = document.getElementById('inspector-content');
  const searchInput = document.getElementById('network-search-input');

  const statTotalNodes = document.getElementById('stat-total-nodes');
  const statTotalVouches = document.getElementById('stat-total-vouches');
  const statTotalDenounces = document.getElementById('stat-total-denounces');
  const statHealthScore = document.getElementById('stat-health-score');

  // Modal Elements
  const trustModal = document.getElementById('trust-action-modal');
  const trustModalClose = document.getElementById('trust-modal-close');
  const trustFormCancel = document.getElementById('trust-form-cancel');
  const trustActionForm = document.getElementById('trust-action-form');
  const trustFormRepo = document.getElementById('trust-form-repo');

  // Init
  window.addEventListener('DOMContentLoaded', () => {
    setupCanvas();
    setupEventListeners();
    loadRepositoriesForModal();
    loadNetworkData();
    loadDashboardStats();
  });

  function setupCanvas() {
    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      render();
    }
    window.addEventListener('resize', resize);
    resize();
  }

  // Fetch Graph Data
  async function loadNetworkData() {
    try {
      const res = await fetch(`${API_BASE}/trust/network-graph`);
      const json = await res.json();
      if (!json.success || !json.data) return;

      rawNodes = json.data.nodes || [];
      rawEdges = json.data.edges || [];

      statTotalNodes.textContent = rawNodes.length;

      // Count vouches & denounces in edges
      let vouches = 0;
      let denounces = 0;
      rawEdges.forEach((e) => {
        if (e.type === 'VOUCH') vouches++;
        if (e.type === 'DENOUNCE') denounces++;
      });
      statTotalVouches.textContent = vouches;
      statTotalDenounces.textContent = denounces;

      applyFiltersAndInitGraph();
    } catch (err) {
      console.error('Failed to load network graph data:', err);
    }
  }

  async function loadDashboardStats() {
    try {
      const res = await fetch(`${API_BASE}/dashboard/stats`);
      const json = await res.json();
      if (json.success && json.data) {
        statHealthScore.textContent = `${json.data.network_health_score || 85.0}%`;
      }
    } catch (e) {
      statHealthScore.textContent = '88.5%';
    }
  }

  async function loadRepositoriesForModal() {
    try {
      const res = await fetch(`${API_BASE}/repositories`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        trustFormRepo.innerHTML = json.data
          .map((r) => `<option value="${r.id}">${escapeHtml(r.full_name)}</option>`)
          .join('');
      }
    } catch (e) {
      trustFormRepo.innerHTML = '<option value="">No repositories available</option>';
    }
  }

  function applyFiltersAndInitGraph() {
    // Filter nodes
    const filteredNodes = rawNodes.filter((node) => {
      if (filterNodeType !== 'all' && node.type !== filterNodeType) return false;
      if (filterStatus !== 'all' && node.type === 'contributor') {
        if (filterStatus === 'NEW' && (node.status === 'NEW' || node.status === 'NEUTRAL')) return true;
        if (node.status !== filterStatus) return false;
      }
      return true;
    });

    const nodeIds = new Set(filteredNodes.map((n) => n.id));

    // Filter edges: both endpoints must be in nodeIds
    const filteredEdges = rawEdges.filter((edge) => {
      return nodeIds.has(edge.source) && nodeIds.has(edge.target);
    });

    // Initialize physics nodes
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const existingMap = new Map();
    graphNodes.forEach((n) => existingMap.set(n.id, n));

    graphNodes = filteredNodes.map((n, i) => {
      const existing = existingMap.get(n.id);
      if (existing) {
        existing.label = n.label;
        existing.status = n.status;
        existing.trust_score = n.trust_score;
        existing.vouches_count = n.vouches_count;
        existing.denounces_count = n.denounces_count;
        existing.total_prs = n.total_prs;
        return existing;
      }

      // Spread nodes in circle
      const angle = (i / filteredNodes.length) * 2 * Math.PI;
      const radius = 140 + Math.random() * 120;
      return {
        ...n,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        radius: getNodeRadius(n)
      };
    });

    graphEdges = filteredEdges.map((e) => ({ ...e }));

    alpha = 1.0;
    if (!animationFrameId) {
      stepSimulation();
    }
  }

  function getNodeRadius(node) {
    if (node.type === 'repository') return 24;
    if (node.type === 'maintainer') return 20;
    // Contributor radius depends slightly on trust score
    const score = node.trust_score || 50;
    return 18 + Math.min(10, Math.floor(score / 15));
  }

  function getNodeColor(node) {
    if (node.type === 'repository') return '#3b82f6'; // Blue
    if (node.type === 'maintainer') return '#8b5cf6'; // Purple

    // Contributor
    if (node.status === 'TRUSTED') return '#10b981'; // Green
    if (node.status === 'FLAGGED') return '#ef4444'; // Red
    return '#64748b'; // Slate / Neutral good faith
  }

  // Force-directed simulation step
  function stepSimulation() {
    if (isSimulating && alpha > 0.005) {
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;

      // 1. Repulsion between nodes (Coulomb force)
      for (let i = 0; i < graphNodes.length; i++) {
        const n1 = graphNodes[i];
        for (let j = i + 1; j < graphNodes.length; j++) {
          const n2 = graphNodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);

          if (dist < 350) {
            const force = (8000 / distSq) * alpha;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (n1 !== draggedNode) {
              n1.vx -= fx;
              n1.vy -= fy;
            }
            if (n2 !== draggedNode) {
              n2.vx += fx;
              n2.vy += fy;
            }
          }
        }
      }

      // 2. Spring force along edges (Hooke's law)
      const nodeMap = new Map();
      graphNodes.forEach((n) => nodeMap.set(n.id, n));

      graphEdges.forEach((edge) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const desiredDist = edge.type === 'CONTRIBUTED_TO' ? 120 : 150;
        const force = (dist - desiredDist) * 0.04 * alpha;

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (source !== draggedNode) {
          source.vx += fx;
          source.vy += fy;
        }
        if (target !== draggedNode) {
          target.vx -= fx;
          target.vy -= fy;
        }
      });

      // 3. Center gravity pull
      graphNodes.forEach((node) => {
        if (node === draggedNode) return;
        const dx = cx - node.x;
        const dy = cy - node.y;
        node.vx += dx * 0.005 * alpha;
        node.vy += dy * 0.005 * alpha;

        // Apply velocity with damping
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.85;
        node.vy *= 0.85;
      });

      alpha *= 0.99; // Cooling
    }

    render();
    animationFrameId = requestAnimationFrame(stepSimulation);
  }

  // Render Canvas
  function render() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    const nodeMap = new Map();
    graphNodes.forEach((n) => nodeMap.set(n.id, n));

    // Draw Edges
    graphEdges.forEach((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return;

      const isSelected = selectedEdge === edge;
      ctx.beginPath();

      if (edge.type === 'VOUCH') {
        ctx.strokeStyle = isSelected ? '#34d399' : 'rgba(16, 185, 129, 0.65)';
        ctx.lineWidth = isSelected ? 3.5 : 2;
        ctx.setLineDash([]);
      } else if (edge.type === 'DENOUNCE') {
        ctx.strokeStyle = isSelected ? '#f87171' : 'rgba(239, 68, 68, 0.75)';
        ctx.lineWidth = isSelected ? 3.5 : 2;
        ctx.setLineDash([5, 4]);
      } else {
        // CONTRIBUTED_TO
        ctx.strokeStyle = isSelected ? '#93c5fd' : 'rgba(96, 165, 250, 0.35)';
        ctx.lineWidth = isSelected ? 2.5 : 1.2;
        ctx.setLineDash([]);
      }

      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw Arrow head toward target
      drawArrow(source.x, source.y, target.x, target.y, target.radius + 6, ctx.strokeStyle);
    });

    // Draw Nodes
    graphNodes.forEach((node) => {
      const isSelected = selectedNode === node;
      const isHovered = hoveredNode === node;
      const color = getNodeColor(node);

      ctx.save();
      ctx.translate(node.x, node.y);

      // Glow effect for selected / hovered
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(0, 0, node.radius + 8, 0, 2 * Math.PI);
        ctx.fillStyle = isSelected ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.15)';
        ctx.fill();
      }

      // Main Node Shape
      if (node.type === 'repository') {
        // Rounded box
        const r = node.radius;
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 3 : 2;
        roundRect(ctx, -r, -r, r * 2, r * 2, 8);
        ctx.fill();
        ctx.stroke();

        // Icon
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📦', 0, 0);
      } else if (node.type === 'maintainer') {
        // Circle / Shield
        ctx.beginPath();
        ctx.arc(0, 0, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = '#2e1065';
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.fill();
        ctx.stroke();

        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🛡️', 0, 0);
      } else {
        // Contributor Circle
        ctx.beginPath();
        ctx.arc(0, 0, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 3.5 : 2.5;
        ctx.fill();
        ctx.stroke();

        // Contributor Initial or Avatar
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const initial = (node.label || 'C').charAt(0).toUpperCase();
        ctx.fillText(initial, 0, 0);

        // Small status badge indicator dot
        ctx.beginPath();
        ctx.arc(node.radius - 4, node.radius - 4, 4.5, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      }

      // Label below node
      ctx.font = isSelected ? 'bold 12px sans-serif' : '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = isSelected ? '#ffffff' : '#cbd5e1';
      ctx.fillText(node.label, 0, node.radius + 14);

      ctx.restore();
    });

    ctx.restore();
  }

  function drawArrow(x1, y1, x2, y2, offset, color) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < offset + 10) return;

    const tox = x2 - (dx / dist) * offset;
    const toy = y2 - (dy / dist) * offset;
    const angle = Math.atan2(dy, dx);
    const arrowLength = 7;

    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tox, toy);
    ctx.lineTo(
      tox - arrowLength * Math.cos(angle - Math.PI / 6),
      toy - arrowLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      tox - arrowLength * Math.cos(angle + Math.PI / 6),
      toy - arrowLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // Interactivity Handlers
  function setupEventListeners() {
    // Search
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = (e.target.value || '').trim().toLowerCase();
        if (!searchQuery) {
          selectedNode = null;
          render();
          return;
        }

        const match = graphNodes.find((n) => n.label.toLowerCase().includes(searchQuery));
        if (match) {
          selectNode(match);
          // Center on matching node
          const rect = canvas.getBoundingClientRect();
          transform.x = rect.width / 2 - match.x * transform.k;
          transform.y = rect.height / 2 - match.y * transform.k;
          render();
        }
      });
    }

    // Refresh button
    const btnRefresh = document.getElementById('btn-refresh-graph');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        btnRefresh.textContent = '⏳ Loading…';
        loadNetworkData().then(() => {
          btnRefresh.textContent = '🔄 Reload Graph';
        });
      });
    }

    // Canvas Mouse Events
    canvas.addEventListener('mousedown', (e) => {
      const pos = getMousePos(e);
      const clickedNode = findNodeAt(pos.x, pos.y);

      if (clickedNode) {
        draggedNode = clickedNode;
        selectNode(clickedNode);
        alpha = 0.3; // Reheat slightly
      } else {
        const clickedEdge = findEdgeAt(pos.x, pos.y);
        if (clickedEdge) {
          selectEdge(clickedEdge);
        } else {
          isDraggingCanvas = true;
          dragStart = { x: e.clientX - transform.x, y: e.clientY - transform.y };
          selectedNode = null;
          selectedEdge = null;
          renderInspectorEmpty();
        }
      }
      render();
    });

    window.addEventListener('mousemove', (e) => {
      if (draggedNode) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        draggedNode.x = (mouseX - transform.x) / transform.k;
        draggedNode.y = (mouseY - transform.y) / transform.k;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
        alpha = 0.3;
        render();
        return;
      }

      if (isDraggingCanvas) {
        transform.x = e.clientX - dragStart.x;
        transform.y = e.clientY - dragStart.y;
        render();
        return;
      }

      // Hover check
      const pos = getMousePos(e);
      const node = findNodeAt(pos.x, pos.y);
      if (node !== hoveredNode) {
        hoveredNode = node;
        canvas.style.cursor = node ? 'pointer' : 'grab';
        render();
      }
    });

    window.addEventListener('mouseup', () => {
      draggedNode = null;
      isDraggingCanvas = false;
    });

    // Zoom on wheel
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      zoomAroundPoint(zoomFactor, e.clientX, e.clientY);
    });

    // Floating Controls
    document.getElementById('ctrl-zoom-in').addEventListener('click', () => {
      const rect = canvas.getBoundingClientRect();
      zoomAroundPoint(1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });

    document.getElementById('ctrl-zoom-out').addEventListener('click', () => {
      const rect = canvas.getBoundingClientRect();
      zoomAroundPoint(0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });

    document.getElementById('ctrl-fit-view').addEventListener('click', fitGraphView);

    const toggleSimBtn = document.getElementById('ctrl-toggle-sim');
    toggleSimBtn.addEventListener('click', () => {
      isSimulating = !isSimulating;
      toggleSimBtn.textContent = isSimulating ? '⏸ Pause' : '▶ Resume';
      if (isSimulating) alpha = 0.4;
    });

    document.getElementById('ctrl-reheat').addEventListener('click', () => {
      alpha = 1.0;
      isSimulating = true;
      toggleSimBtn.textContent = '⏸ Pause';
    });

    // Filter Buttons
    document.querySelectorAll('.filter-pill').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const type = e.target.dataset.filterType;
        const val = e.target.dataset.val;

        // Toggle active within category
        document
          .querySelectorAll(`.filter-pill[data-filter-type="${type}"]`)
          .forEach((b) => b.classList.remove('active'));
        e.target.classList.add('active');

        if (type === 'node') filterNodeType = val;
        if (type === 'status') filterStatus = val;

        applyFiltersAndInitGraph();
      });
    });

    // Modal Close
    trustModalClose.addEventListener('click', () => trustModal.classList.remove('is-open'));
    trustFormCancel.addEventListener('click', () => trustModal.classList.remove('is-open'));

    // Modal Submit
    trustActionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const actionType = document.getElementById('trust-form-action-type').value;
      const username = document.getElementById('trust-form-contributor-username').value;
      const repoId = parseInt(trustFormRepo.value) || null;
      const category = document.getElementById('trust-form-category').value;
      const reason = document.getElementById('trust-form-reason').value.trim();
      const evidenceUrl = document.getElementById('trust-form-evidence').value.trim();

      if (!reason || !evidenceUrl) {
        alert('Please provide both context reason and a verifiable evidence URL.');
        return;
      }

      const endpoint = actionType === 'VOUCH' ? `${API_BASE}/trust/vouch` : `${API_BASE}/trust/denounce`;
      const submitBtn = document.getElementById('trust-form-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Recording…';

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contributor_username: username,
            repo_id: repoId,
            author_username: 'Rounak-2008',
            category: category,
            reason: reason,
            evidence_url: evidenceUrl
          })
        });

        const json = await res.json();
        if (json.success) {
          trustModal.classList.remove('is-open');
          await loadNetworkData();
          // Re-select contributor to refresh inspector
          const updatedNode = graphNodes.find((n) => n.label === username);
          if (updatedNode) selectNode(updatedNode);
        } else {
          alert(`Error recording trust action: ${json.error || 'Server rejected request'}`);
        }
      } catch (err) {
        alert(`Network request failed: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Record';
      }
    });
  }

  function zoomAroundPoint(factor, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const newK = Math.max(0.2, Math.min(3.5, transform.k * factor));
    transform.x = mouseX - (mouseX - transform.x) * (newK / transform.k);
    transform.y = mouseY - (mouseY - transform.y) * (newK / transform.k);
    transform.k = newK;
    render();
  }

  function fitGraphView() {
    if (graphNodes.length === 0) return;
    const rect = canvas.getBoundingClientRect();

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    graphNodes.forEach((n) => {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    });

    const graphWidth = maxX - minX + 100;
    const graphHeight = maxY - minY + 100;

    const kx = rect.width / graphWidth;
    const ky = rect.height / graphHeight;
    transform.k = Math.max(0.3, Math.min(1.2, Math.min(kx, ky)));

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    transform.x = rect.width / 2 - midX * transform.k;
    transform.y = rect.height / 2 - midY * transform.k;

    render();
  }

  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    return {
      x: (mouseX - transform.x) / transform.k,
      y: (mouseY - transform.y) / transform.k
    };
  }

  function findNodeAt(x, y) {
    for (let i = graphNodes.length - 1; i >= 0; i--) {
      const node = graphNodes[i];
      const dx = node.x - x;
      const dy = node.y - y;
      if (dx * dx + dy * dy <= (node.radius + 4) * (node.radius + 4)) {
        return node;
      }
    }
    return null;
  }

  function findEdgeAt(x, y) {
    const nodeMap = new Map();
    graphNodes.forEach((n) => nodeMap.set(n.id, n));

    for (let i = graphEdges.length - 1; i >= 0; i--) {
      const edge = graphEdges[i];
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;

      const d = distToSegment({ x, y }, source, target);
      if (d < 8) {
        return edge;
      }
    }
    return null;
  }

  function distToSegment(p, v, w) {
    const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }

  // Inspector Panels
  function selectNode(node) {
    selectedNode = node;
    selectedEdge = null;

    inspectorTitle.textContent = node.label;
    inspectorSubtitle.textContent = `${node.type.toUpperCase()} NODE`;

    // Find incident edges
    const incoming = rawEdges.filter((e) => e.target === node.id);
    const outgoing = rawEdges.filter((e) => e.source === node.id);

    if (node.type === 'contributor') {
      renderContributorInspector(node, incoming, outgoing);
    } else if (node.type === 'repository') {
      renderRepositoryInspector(node, incoming, outgoing);
    } else {
      renderMaintainerInspector(node, incoming, outgoing);
    }
  }

  function selectEdge(edge) {
    selectedEdge = edge;
    selectedNode = null;

    inspectorTitle.textContent = `${edge.type} Connection`;
    inspectorSubtitle.textContent = 'TRUST AUDIT RECORD';

    renderEdgeInspector(edge);
  }

  function renderInspectorEmpty() {
    inspectorTitle.textContent = 'Network Inspector';
    inspectorSubtitle.textContent = 'Click any node or link to view verifiable evidence.';
    inspectorContent.innerHTML = `
      <div style="text-align: center; padding: var(--space-8) var(--space-4); color: var(--color-text-secondary);">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">🕸️</div>
        <div style="font-weight: 500; font-size: 0.95rem; margin-bottom: 4px;">No Selection</div>
        <div style="font-size: 0.8rem; line-height: 1.4;">
          Click on any repository, contributor, or trust line to inspect audit trails and evidence.
        </div>
      </div>
    `;
  }

  function renderContributorInspector(node, incoming, outgoing) {
    const score = node.trust_score !== null ? node.trust_score : 50.0;
    const status = node.status || 'NEW';
    const statusClass =
      status === 'TRUSTED' ? 'badge-success' : status === 'FLAGGED' ? 'badge-danger' : 'badge-neutral';

    let html = `
      <div class="inspector-section" style="border-bottom: 1px solid var(--color-border); padding-bottom: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <span class="badge ${statusClass}">${escapeHtml(status)}</span>
          <span style="font-size: 1.25rem; font-weight: bold; color: ${getNodeColor(node)};">${score.toFixed(1)} / 100</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--color-text-secondary); margin-bottom: 10px;">
          PRs: <strong>${node.total_prs || 0}</strong> | Vouches: <strong style="color: #10b981;">${node.vouches_count || 0}</strong> | Denounces: <strong style="color: #ef4444;">${node.denounces_count || 0}</strong>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-sm" id="btn-node-vouch" style="flex: 1; color: #10b981;">✓ Vouch</button>
          <button class="btn btn-secondary btn-sm" id="btn-node-denounce" style="flex: 1; color: #ef4444;">⚠️ Denounce</button>
        </div>
      </div>

      <div class="inspector-section">
        <div class="inspector-label">Incoming Trust Records (${incoming.length})</div>
    `;

    if (incoming.length === 0) {
      html += `<div style="font-size: 0.8rem; color: var(--color-text-secondary); font-style: italic;">No recorded peer vouches or denouncements.</div>`;
    } else {
      incoming.forEach((edge) => {
        const cls = edge.type === 'VOUCH' ? 'vouch' : edge.type === 'DENOUNCE' ? 'denounce' : 'pr';
        html += `
          <div class="edge-item-card ${cls}">
            <div style="display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 3px;">
              <span>${escapeHtml(edge.type)}</span>
              <span style="font-size: 0.72rem; color: var(--color-text-secondary);">${escapeHtml(edge.category || '')}</span>
            </div>
            <div style="font-size: 0.78rem; color: var(--color-text-primary); margin-bottom: 4px;">
              ${escapeHtml(edge.reason || 'No description provided')}
            </div>
            ${
              edge.evidence_url
                ? `<a href="${escapeHtml(edge.evidence_url)}" target="_blank" rel="noopener noreferrer" style="font-size: 0.72rem; color: var(--color-primary); word-break: break-all;">🔗 Evidence Link</a>`
                : ''
            }
          </div>
        `;
      });
    }

    html += `
      </div>
      <div class="inspector-section" style="margin-top: 10px;">
        <div class="inspector-label">Contributions Submitted (${outgoing.length})</div>
    `;

    if (outgoing.length === 0) {
      html += `<div style="font-size: 0.8rem; color: var(--color-text-secondary); font-style: italic;">No pull requests connected yet.</div>`;
    } else {
      outgoing.forEach((edge) => {
        html += `
          <div class="edge-item-card pr">
            <div style="font-weight: 600;">Contributed to Repo</div>
            <div style="font-size: 0.78rem; color: var(--color-text-secondary);">${escapeHtml(edge.category || 'Pull Requests')}</div>
          </div>
        `;
      });
    }

    html += `</div>`;
    inspectorContent.innerHTML = html;

    // Attach Vouch / Denounce Modal triggers
    document.getElementById('btn-node-vouch').addEventListener('click', () => {
      openTrustModal('VOUCH', node.label);
    });
    document.getElementById('btn-node-denounce').addEventListener('click', () => {
      openTrustModal('DENOUNCE', node.label);
    });
  }

  function renderRepositoryInspector(node, incoming, outgoing) {
    const contributors = incoming.filter((e) => e.type === 'CONTRIBUTED_TO');

    let html = `
      <div class="inspector-section" style="border-bottom: 1px solid var(--color-border); padding-bottom: 12px;">
        <div class="inspector-label">Repository Node</div>
        <div style="font-size: 1.1rem; font-weight: bold; color: var(--color-primary); margin-bottom: 4px;">
          ${escapeHtml(node.label)}
        </div>
        <div style="font-size: 0.8rem; color: var(--color-text-secondary);">
          Connected Contributors: <strong>${contributors.length}</strong>
        </div>
      </div>

      <div class="inspector-section">
        <div class="inspector-label">Active Contributors</div>
    `;

    if (contributors.length === 0) {
      html += `<div style="font-size: 0.8rem; color: var(--color-text-secondary); font-style: italic;">No contributors linked yet.</div>`;
    } else {
      contributors.forEach((edge) => {
        html += `
          <div class="edge-item-card pr">
            <div style="font-weight: 600;">${escapeHtml(edge.source.replace('contrib_', '@'))}</div>
            <div style="font-size: 0.78rem; color: var(--color-text-secondary);">${escapeHtml(edge.category || 'PRs')}</div>
          </div>
        `;
      });
    }

    html += `</div>`;
    inspectorContent.innerHTML = html;
  }

  function renderMaintainerInspector(node, incoming, outgoing) {
    let html = `
      <div class="inspector-section" style="border-bottom: 1px solid var(--color-border); padding-bottom: 12px;">
        <div class="inspector-label">Maintainer Node</div>
        <div style="font-size: 1.1rem; font-weight: bold; color: #8b5cf6; margin-bottom: 4px;">
          ${escapeHtml(node.label)}
        </div>
        <div style="font-size: 0.8rem; color: var(--color-text-secondary);">
          Trust Actions Authored: <strong>${outgoing.length}</strong>
        </div>
      </div>

      <div class="inspector-section">
        <div class="inspector-label">Recent Trust Actions</div>
    `;

    if (outgoing.length === 0) {
      html += `<div style="font-size: 0.8rem; color: var(--color-text-secondary); font-style: italic;">No trust actions logged.</div>`;
    } else {
      outgoing.forEach((edge) => {
        const cls = edge.type === 'VOUCH' ? 'vouch' : 'denounce';
        html += `
          <div class="edge-item-card ${cls}">
            <div style="font-weight: 600;">${escapeHtml(edge.type)} &rarr; ${escapeHtml(edge.target.replace('contrib_', '@'))}</div>
            <div style="font-size: 0.78rem; margin: 2px 0;">${escapeHtml(edge.reason || '')}</div>
            ${
              edge.evidence_url
                ? `<a href="${escapeHtml(edge.evidence_url)}" target="_blank" rel="noopener noreferrer" style="font-size: 0.72rem; color: var(--color-primary);">🔗 Evidence</a>`
                : ''
            }
          </div>
        `;
      });
    }

    html += `</div>`;
    inspectorContent.innerHTML = html;
  }

  function renderEdgeInspector(edge) {
    const cls = edge.type === 'VOUCH' ? 'vouch' : edge.type === 'DENOUNCE' ? 'denounce' : 'pr';
    const html = `
      <div class="inspector-section">
        <div class="edge-item-card ${cls}" style="margin-top: 8px;">
          <div style="font-size: 1rem; font-weight: bold; margin-bottom: 6px;">
            ${escapeHtml(edge.type)} Record
          </div>
          <div style="font-size: 0.82rem; margin-bottom: 6px;">
            <strong>Category:</strong> ${escapeHtml(edge.category || 'General')}
          </div>
          <div style="font-size: 0.82rem; margin-bottom: 8px;">
            <strong>Context Reason:</strong><br/>
            ${escapeHtml(edge.reason || 'No description provided')}
          </div>
          ${
            edge.author
              ? `<div style="font-size: 0.78rem; color: var(--color-text-secondary); margin-bottom: 4px;"><strong>Author:</strong> @${escapeHtml(edge.author)}</div>`
              : ''
          }
          ${
            edge.evidence_url
              ? `<div style="margin-top: 8px;"><a href="${escapeHtml(edge.evidence_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="display: inline-block;">🔗 View Verifiable Evidence</a></div>`
              : ''
          }
        </div>
      </div>
    `;
    inspectorContent.innerHTML = html;
  }

  function openTrustModal(actionType, username) {
    document.getElementById('trust-form-action-type').value = actionType;
    document.getElementById('trust-form-contributor-username').value = username;
    document.getElementById('trust-form-username-display').textContent = `@${username}`;
    document.getElementById('trust-modal-title').textContent =
      actionType === 'VOUCH' ? `Vouch for @${username}` : `Denounce @${username}`;
    document.getElementById('trust-form-submit').textContent =
      actionType === 'VOUCH' ? '✓ Submit Vouch' : '⚠️ Submit Denouncement';
    document.getElementById('trust-form-submit').className =
      actionType === 'VOUCH' ? 'btn btn-success btn-sm' : 'btn btn-danger btn-sm';

    trustModal.classList.add('is-open');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
