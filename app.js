// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

let STATE = {
  macro: {},
  indices: {},
  sectors: {},
  commodities: {},
  currencies: {},
  fear: {},
  portfolio: [],
  timestamps: {},
  refPoints: {},
  // API keys — indexed by source stateKey
  apiKey: "",        // FMP
  tdApiKey: "",      // Twelve Data
  fredApiKey: "",    // FRED
  avApiKey: "",      // Alpha Vantage
  polygonApiKey: "", // Polygon.io
  iexApiKey: "",     // IEX Cloud
  nasdaqApiKey: "",  // NASDAQ Data Link
  refinitivApiKey: "",
  bloombergApiKey: "",
  authMode: "",      // "neil" or "guest"
};

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

function doAuth() {
  const pass = document.getElementById("authPass").value;
  if (pass === NK_PASS) {
    STATE.authMode = "neil";
    STATE.tdApiKey = NK_KEYS.td;
    STATE.apiKey = NK_KEYS.fmp;
    STATE.fredApiKey = NK_KEYS.fred;
    STATE.avApiKey = NK_KEYS.av;
    STATE.polygonApiKey = NK_KEYS.polygon;
    saveState();
    document.getElementById("authOverlay").classList.add("hidden");
    document.getElementById("authLabel").textContent = "👤 ניל";
    showStatus("ברוך הבא ניל! כל מפתחות ה-API פעילים", "success");
    renderApiSources();
  } else {
    showStatus("סיסמה שגויה", "error");
  }
}

function guestAuth() {
  STATE.authMode = "guest";
  saveState();
  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("authLabel").textContent = "👤 אורח";
  showStatus("כניסה כאורח — מקורות חינמיים בלבד. ניתן להוסיף API keys בהגדרות", "success");
  renderApiSources();
}

function checkAuth() {
  if (STATE.authMode === "neil") {
    // Ensure keys are loaded
    if (!STATE.tdApiKey) STATE.tdApiKey = NK_KEYS.td;
    if (!STATE.apiKey) STATE.apiKey = NK_KEYS.fmp;
    if (!STATE.fredApiKey) STATE.fredApiKey = NK_KEYS.fred;
    if (!STATE.avApiKey) STATE.avApiKey = NK_KEYS.av;
    if (!STATE.polygonApiKey) STATE.polygonApiKey = NK_KEYS.polygon;
    document.getElementById("authOverlay").classList.add("hidden");
    document.getElementById("authLabel").textContent = "👤 ניל";
  } else if (STATE.authMode === "guest") {
    document.getElementById("authOverlay").classList.add("hidden");
    document.getElementById("authLabel").textContent = "👤 אורח";
  }
  // else: show auth dialog (default)
  renderApiSources();
}

function renderApiSources() {
  const el = document.getElementById("apiSourcesList");
  if (!el) return;
  // Show priority badges only
  el.innerHTML = API_SOURCES.filter(s => s.priority > 0).sort((a,b) => b.priority - a.priority).map(s => {
    const hasKey = s.stateKey ? !!STATE[s.stateKey] : true;
    const active = !s.stateKey || hasKey;
    return `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.1)'};color:${active ? 'var(--green)' : 'var(--text-ghost)'}">${s.name} ${active ? '✓' : '🔒'}</span>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHART (simple canvas-based)
// ═══════════════════════════════════════════════════════════════════════════════

let _chartSymbol = null;
let _chartName = null;

function openChart(symbol, name, fundsOrKey) {
  _chartSymbol = symbol;
  _chartName = name;
  document.getElementById("chartTitle").textContent = name;
  document.getElementById("chartModal").classList.remove("hidden");
  // Reset range buttons
  document.querySelectorAll(".chart-range").forEach(b => b.classList.toggle("active", b.dataset.range === "1y"));
  loadChart(symbol, "1y");

  // Resolve funds: if string key → look up INDEX_FUNDS; if object → use directly
  let funds = null;
  if (typeof fundsOrKey === "string" && fundsOrKey) {
    funds = (typeof INDEX_FUNDS !== "undefined" && INDEX_FUNDS[fundsOrKey]) || null;
    // Also check sector funds
    if (!funds) {
      Object.values(SECTOR_REGIONS || {}).forEach(r => {
        r.sectors.forEach(s => { if (s.etf === symbol || s.name === fundsOrKey) funds = s.funds; });
      });
    }
  } else if (fundsOrKey && typeof fundsOrKey === "object") {
    funds = fundsOrKey;
  }

  // Show tracking funds
  const fundsEl = document.getElementById("chartFunds");
  if (funds && (funds.usd?.length || funds.ils?.length)) {
    let fhtml = `<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">📋 קרנות מחקות:</div>`;
    if (funds.usd?.length) fhtml += `<div style="font-size:11px;color:var(--text-faint);margin-bottom:4px">דולריות: ${funds.usd.join(', ')}</div>`;
    if (funds.ils?.length) fhtml += `<div style="font-size:11px;color:var(--text-faint)">שקליות: ${funds.ils.join(', ')}</div>`;
    fundsEl.innerHTML = fhtml;
  } else {
    fundsEl.innerHTML = '';
  }
}

function openChartSector(etf, name) {
  const funds = window._sectorFunds?.[etf] || null;
  openChart(etf, name, funds);
}

function closeChart(e) {
  if (e.target === document.getElementById("chartModal")) {
    document.getElementById("chartModal").classList.add("hidden");
  }
}

async function loadChart(symbol, range, btn) {
  symbol = symbol || _chartSymbol;
  if (!symbol) return;
  if (btn) {
    document.querySelectorAll(".chart-range").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }
  const canvas = document.getElementById("chartCanvas");
  const ctx = canvas.getContext("2d");
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px Rubik";
  ctx.textAlign = "center";
  ctx.fillText("טוען גרף...", canvas.width/2, canvas.height/2);

  try {
    const interval = range === "10y" || range === "5y" ? "1mo" : range === "2y" ? "1wk" : "1d";
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const resp = await fetchWithProxy(url);
    const json = await resp.json();
    const result = json.chart?.result?.[0];
    if (!result) throw new Error("No data");
    const closes = result.indicators?.quote?.[0]?.close || [];
    const timestamps = result.timestamp || [];
    drawChart(ctx, canvas, timestamps, closes, _chartName);
  } catch(e) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ef4444";
    ctx.fillText("שגיאה בטעינת גרף: " + e.message, canvas.width/2, canvas.height/2);
  }
}

function drawChart(ctx, canvas, timestamps, closes, name) {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const data = closes.map((v, i) => [timestamps[i], v]).filter(d => d[1] !== null);
  if (data.length < 2) return;
  const prices = data.map(d => d[1]);
  const min = Math.min(...prices) * 0.98;
  const max = Math.max(...prices) * 1.02;
  const range = max - min;
  const pad = { top: 30, bottom: 40, left: 60, right: 20 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  // Grid
  ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + ch * (i / 4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    ctx.fillStyle = "#64748b"; ctx.font = "11px JetBrains Mono"; ctx.textAlign = "right";
    ctx.fillText((max - range * i / 4).toFixed(2), pad.left - 6, y + 4);
  }
  // Date labels
  ctx.fillStyle = "#64748b"; ctx.font = "10px JetBrains Mono"; ctx.textAlign = "center";
  for (let i = 0; i < 5; i++) {
    const idx = Math.floor(data.length * i / 4);
    if (idx < data.length) {
      const d = new Date(data[idx][0] * 1000);
      const lbl = d.toLocaleDateString("he-IL", { month: "short", year: "2-digit" });
      ctx.fillText(lbl, pad.left + cw * (idx / (data.length - 1)), h - pad.bottom + 16);
    }
  }
  // Line
  const isUp = prices[prices.length - 1] >= prices[0];
  ctx.strokeStyle = isUp ? "#22c55e" : "#ef4444";
  ctx.lineWidth = 2; ctx.beginPath();
  data.forEach((d, i) => {
    const x = pad.left + cw * (i / (data.length - 1));
    const y = pad.top + ch * (1 - (d[1] - min) / range);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  // Fill
  ctx.lineTo(pad.left + cw, pad.top + ch);
  ctx.lineTo(pad.left, pad.top + ch);
  ctx.closePath();
  ctx.fillStyle = isUp ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)";
  ctx.fill();
  // Stats
  const first = prices[0], last = prices[prices.length - 1];
  const pct = ((last - first) / first * 100).toFixed(2);
  ctx.fillStyle = isUp ? "#22c55e" : "#ef4444";
  ctx.font = "bold 14px Rubik"; ctx.textAlign = "left";
  ctx.fillText(`${last.toFixed(2)} (${pct > 0 ? '+' : ''}${pct}%)`, pad.left + 8, pad.top - 8);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE (localStorage + JSON file)
// ═══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = "inv-dashboard-v1";

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE)); } catch(e) { console.warn("localStorage save failed:", e); }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      STATE = { ...STATE, ...parsed };
    }
  } catch(e) { console.warn("localStorage load failed:", e); }
}

function exportData() {
  const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `investment-dashboard-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus("הנתונים יוצאו בהצלחה", "success");
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      STATE = { ...STATE, ...imported };
      saveState();
      renderAll();
      showStatus("הנתונים יובאו בהצלחה", "success");
    } catch(err) {
      showStatus("שגיאה בייבוא: קובץ לא תקין", "error");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function exportCSV() {
  if (STATE.portfolio.length === 0) { showStatus("אין מניות בתיק", "error"); return; }
  let csv = "\uFEFF" + "Symbol,Name,Shares,Avg Price,Current Price,Day Change %,P&L,P&L %,Value,Sector,Notes\n";
  STATE.portfolio.forEach(s => {
    const cp = s.currentPrice || 0;
    const pnl = s.shares * (cp - s.avgPrice);
    const pnlPct = s.avgPrice ? ((cp - s.avgPrice) / s.avgPrice * 100) : 0;
    const val = s.shares * cp;
    csv += `${s.symbol},"${s.name||''}",${s.shares},${s.avgPrice},${cp},${s.dayChange||0},${pnl.toFixed(2)},${pnlPct.toFixed(2)},${val.toFixed(2)},"${s.sector||''}","${(s.notes||'').replace(/"/g,'""')}"\n`;
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `portfolio-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus("תיק יוצא ל-CSV", "success");
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function showStatus(msg, type) {
  // Toast-based notification (non-blocking)
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const t = document.createElement("div");
  t.className = "toast toast-" + (type || "info");
  t.textContent = msg;
  container.appendChild(t);
  const ttl = type === "error" ? 6000 : 3000;
  setTimeout(() => {
    t.classList.add("toast-out");
    setTimeout(() => t.remove(), 220);
  }, ttl);
}

function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tabId));
  document.querySelectorAll(".bottom-nav-item").forEach(t => t.classList.toggle("active", t.dataset.tab === tabId));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + tabId));
  // Scroll content to top on tab switch (mobile UX)
  try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// THEME TOGGLE (Light / Dark) — persisted in localStorage
// ═══════════════════════════════════════════════════════════════════════════════
const THEME_KEY = "inv-dashboard-theme";
function applyTheme(theme) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  const next = cur === "light" ? "dark" : "light";
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch(e) {}
}
(function initTheme(){
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch(e) {}
  if (!saved && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) saved = "light";
  applyTheme(saved || "dark");
})();

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND PALETTE (Ctrl+K quick search)
// ═══════════════════════════════════════════════════════════════════════════════
let _cmdIndex = [];
let _cmdActive = 0;

function buildCmdIndex() {
  const idx = [];
  // Tabs
  [
    { id: "macro", icon: "🌍", label: "מאקרו" },
    { id: "indices", icon: "📊", label: "מדדים" },
    { id: "sectors", icon: "🏭", label: "סקטורים" },
    { id: "commodities", icon: "🛢️", label: "סחורות ומט״ח" },
    { id: "fear", icon: "😰", label: "פחד וסנטימנט" },
    { id: "scanner", icon: "🔎", label: "סקרינר" },
    { id: "portfolio", icon: "💼", label: "תיק אישי" },
  ].forEach(t => idx.push({ type: "tab", group: "עמודים", icon: t.icon, label: t.label, action: () => switchTab(t.id) }));

  // Indices
  if (typeof INDICES !== "undefined") INDICES.forEach(i =>
    idx.push({ type: "index", group: "מדדים", icon: "📊", label: i.name, meta: i.region || "", action: () => { switchTab("indices"); openChart(i.sym, i.name, i.key); } })
  );
  // Commodities
  if (typeof COMMODITIES !== "undefined") COMMODITIES.forEach(c =>
    idx.push({ type: "commodity", group: "סחורות", icon: "🛢️", label: c.name, meta: c.unit || "", action: () => { switchTab("commodities"); openChart(c.sym, c.name); } })
  );
  // Currencies
  if (typeof CURRENCIES !== "undefined") CURRENCIES.forEach(c =>
    idx.push({ type: "currency", group: "מטבעות", icon: "💱", label: `${c.key} — ${c.name}`, action: () => { switchTab("commodities"); openChart(c.yahoo || c.key, c.name); } })
  );
  // Portfolio
  (STATE.portfolio || []).forEach(s =>
    idx.push({ type: "stock", group: "תיק אישי", icon: "💼", label: `${s.symbol} — ${s.name || ""}`, meta: s.sector || "", action: () => { switchTab("portfolio"); } })
  );
  // Actions
  idx.push({ type: "action", group: "פעולות", icon: "🔄", label: "משוך נתונים מחדש", action: () => fetchAllData() });
  idx.push({ type: "action", group: "פעולות", icon: "🌙", label: "החלף עיצוב (כהה/בהיר)", action: () => toggleTheme() });
  idx.push({ type: "action", group: "פעולות", icon: "⚙️", label: "הגדרות API", action: () => toggleApiBar() });
  idx.push({ type: "action", group: "פעולות", icon: "💾", label: "ייצוא/ייבוא נתונים", action: () => toggleDataBar() });
  idx.push({ type: "action", group: "פעולות", icon: "📤", label: "ייצוא JSON", action: () => exportData() });
  idx.push({ type: "action", group: "פעולות", icon: "📊", label: "ייצוא תיק ל-CSV", action: () => exportCSV() });

  _cmdIndex = idx;
}

function openCmd() {
  buildCmdIndex();
  const ov = document.getElementById("cmdOverlay");
  const input = document.getElementById("cmdInput");
  ov.classList.remove("hidden");
  input.value = "";
  _cmdActive = 0;
  renderCmdResults();
  setTimeout(() => input.focus(), 10);
}

function closeCmd() {
  document.getElementById("cmdOverlay").classList.add("hidden");
}

function renderCmdResults() {
  const q = (document.getElementById("cmdInput").value || "").trim().toLowerCase();
  const el = document.getElementById("cmdResults");
  let items = _cmdIndex;
  if (q) {
    items = _cmdIndex.filter(it => (it.label + " " + (it.meta || "") + " " + it.group).toLowerCase().includes(q));
  }
  items = items.slice(0, 40);
  if (!items.length) {
    el.innerHTML = `<div class="cmd-empty">אין תוצאות עבור "${q}"</div>`;
    return;
  }
  // Group by group name
  const groups = {};
  items.forEach((it, i) => {
    if (!groups[it.group]) groups[it.group] = [];
    groups[it.group].push({ ...it, _i: i });
  });
  _cmdActive = Math.min(_cmdActive, items.length - 1);
  let html = "";
  let globalIdx = 0;
  Object.entries(groups).forEach(([g, arr]) => {
    html += `<div class="cmd-group-label">${g}</div>`;
    arr.forEach(it => {
      const isActive = globalIdx === _cmdActive;
      html += `<div class="cmd-item ${isActive ? 'cmd-active' : ''}" data-i="${globalIdx}" onclick="runCmd(${globalIdx})">
        <span class="cmd-item-icon">${it.icon}</span>
        <span>${it.label}</span>
        ${it.meta ? `<span class="cmd-item-meta">${it.meta}</span>` : ""}
      </div>`;
      globalIdx++;
    });
  });
  el.innerHTML = html;
  // Scroll active into view
  const active = el.querySelector(".cmd-active");
  if (active) active.scrollIntoView({ block: "nearest" });
  // Stash flat list for keyboard access
  window._cmdFlat = items;
}

function runCmd(i) {
  const list = window._cmdFlat || [];
  const item = list[i];
  if (!item) return;
  closeCmd();
  setTimeout(() => item.action && item.action(), 60);
}

function onCmdKey(e) {
  const list = window._cmdFlat || [];
  if (e.key === "Escape") { e.preventDefault(); closeCmd(); return; }
  if (e.key === "Enter")  { e.preventDefault(); runCmd(_cmdActive); return; }
  if (e.key === "ArrowDown") { e.preventDefault(); _cmdActive = Math.min(_cmdActive + 1, list.length - 1); renderCmdResults(); return; }
  if (e.key === "ArrowUp")   { e.preventDefault(); _cmdActive = Math.max(_cmdActive - 1, 0); renderCmdResults(); return; }
}

// Global Ctrl+K / Cmd+K binding
document.addEventListener("keydown", function(e) {
  if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    openCmd();
  }
  if (e.key === "Escape") {
    const helpM = document.getElementById("helpModal");
    const infoM = document.getElementById("infoModal");
    if (helpM && !helpM.classList.contains("hidden")) { closeHelp(); return; }
    if (infoM && !infoM.classList.contains("hidden")) { closeInfo(); return; }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON + INLINE LOADING BAR
// ═══════════════════════════════════════════════════════════════════════════════
function showLoadingBar() {
  const b = document.getElementById("loadingBar");
  const p = document.getElementById("loadingProgress");
  if (b) b.classList.remove("hidden");
  if (p) p.classList.remove("hidden");
  setProgress(0, "מתחיל…");
}
function hideLoadingBar() {
  const b = document.getElementById("loadingBar");
  const p = document.getElementById("loadingProgress");
  if (b) b.classList.add("hidden");
  if (p) p.classList.add("hidden");
}
// Progress state (used by fetchAllData in api.js)
let LOADING_STATE = { done: 0, total: 0 };
function resetProgress(total) {
  LOADING_STATE = { done: 0, total: Math.max(1, total) };
  setProgress(0, "מתחיל…");
}
function stepProgress(label) {
  LOADING_STATE.done = Math.min(LOADING_STATE.done + 1, LOADING_STATE.total);
  const pct = Math.round((LOADING_STATE.done / LOADING_STATE.total) * 100);
  setProgress(pct, label);
}
function setProgress(pct, label) {
  const fill = document.getElementById("loadingBarFill");
  const pctEl = document.getElementById("loadingProgressPct");
  const lblEl = document.getElementById("loadingProgressLabel");
  if (fill) fill.style.width = pct + "%";
  if (pctEl) pctEl.textContent = pct + "%";
  if (lblEl && label) lblEl.textContent = label;
}
function showSectionLoading(section) {
  const panel = document.getElementById("panel-" + section);
  if (panel) panel.classList.add("section-loading");
}
function hideSectionLoading(section) {
  const panel = document.getElementById("panel-" + section);
  if (panel) panel.classList.remove("section-loading");
}

function renderSkeletonTable(tableId, rows, cols) {
  const t = document.getElementById(tableId);
  if (!t) return;
  let html = "<tbody>";
  for (let i = 0; i < rows; i++) {
    html += "<tr>";
    for (let j = 0; j < cols; j++) {
      html += `<td><span class="skeleton" style="width:${40 + Math.random()*50}px"></span></td>`;
    }
    html += "</tr>";
  }
  html += "</tbody>";
  t.innerHTML = html;
}

function toggleApiBar() {
  const bar = document.getElementById("apiBar");
  const isOpen = bar.classList.toggle("show");
  if (isOpen) renderApiPanel();
}

function toggleDataBar() {
  document.getElementById("dataBar").classList.toggle("show");
}

function renderApiPanel() {
  const tierMap = { auto: "api-auto-rows", free: "api-free-rows", paid: "api-paid-rows" };
  // Clear containers
  Object.values(tierMap).forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });

  API_SOURCES.forEach(s => {
    const container = document.getElementById(tierMap[s.tier]);
    if (!container) return;
    const hasKey = s.stateKey ? !!STATE[s.stateKey] : null;
    const statusDot = s.tier === "auto"
      ? `<span class="api-dot api-dot-on" title="פעיל">●</span>`
      : hasKey
        ? `<span class="api-dot api-dot-on" title="מוגדר">●</span>`
        : `<span class="api-dot api-dot-off" title="לא מוגדר">○</span>`;

    const keyInput = s.stateKey
      ? `<input id="key-${s.id}" class="api-key-input" type="password"
           value="${STATE[s.stateKey] || ""}"
           placeholder="${s.placeholder || 'API Key'}"
           title="${s.placeholder || ''}" />`
      : `<span style="font-size:11px;color:var(--green);font-weight:600">✓ פעיל ללא מפתח</span>`;

    const signupLink = s.signupUrl
      ? `<a href="${s.signupUrl}" target="_blank" class="api-signup-link" title="הרשמה / תיעוד">הרשמה ←</a>`
      : "";

    const docLink = `<a href="${s.url}" target="_blank" class="api-site-link" title="אתר ${s.name}">🔗</a>`;

    container.insertAdjacentHTML("beforeend", `
      <div class="api-source-row">
        <div class="api-source-info">
          ${statusDot}
          <div>
            <div class="api-source-name">${s.name} ${docLink}</div>
            <div class="api-source-desc">${s.desc}</div>
            <div class="api-source-uses">משמש ל: ${s.uses}</div>
          </div>
        </div>
        <div class="api-source-key">
          ${keyInput}
          ${signupLink}
        </div>
      </div>`);
  });
}

function saveApiKey() {
  // Save all API keys from inputs
  API_SOURCES.forEach(s => {
    if (!s.stateKey) return;
    const inp = document.getElementById("key-" + s.id);
    if (inp) STATE[s.stateKey] = inp.value.trim();
  });
  saveState();
  document.getElementById("apiBar").classList.remove("show");
  showStatus("המפתחות נשמרו", "success");
}

// ── Selective refresh per section ─────────────────────────────────────────
async function refreshSection(section, btnEl) {
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = "⏳"; }
  try {
    await fetchAllData([section]);
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = "🔄"; }
  }
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("he-IL") + " " + dt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function fmtNum(v, decimals = 2) {
  if (v === null || v === undefined || v === "") return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Format large GDP numbers in USD (e.g., "27.36T", "4.19T", "520B")
function fmtGDP(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9)  return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6)  return "$" + (n / 1e6).toFixed(1) + "M";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
// Per-capita GDP: always show as money with commas
function fmtMoney(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ── INFO MODAL (click-to-explain) ────────────────────────────────────────
function openInfo(key) {
  const info = (typeof METRIC_INFO !== "undefined") ? METRIC_INFO[key] : null;
  if (!info) return;
  document.getElementById("infoTitle").textContent = "ℹ️ " + info.title;
  const esc = s => (s || "").replace(/</g, "&lt;");
  let html = "";
  if (info.what)  html += `<div class="info-section"><div class="info-section-label">מה זה?</div><div class="info-section-body">${esc(info.what)}</div></div>`;
  if (info.how)   html += `<div class="info-section"><div class="info-section-label">איך מחושב?</div><div class="info-section-body">${esc(info.how)}</div></div>`;
  if (info.range) html += `<div class="info-section"><div class="info-section-label">טווחי ערכים</div><div class="info-section-body">${esc(info.range)}</div></div>`;
  if (info.use)   html += `<div class="info-section"><div class="info-section-label">שימוש במדד</div><div class="info-section-body">${esc(info.use)}</div></div>`;
  if (info.src)   html += `<div class="info-source">📡 מקור: ${esc(info.src)}</div>`;
  document.getElementById("infoBody").innerHTML = html;
  document.getElementById("infoModal").classList.remove("hidden");
}
function closeInfo(e) {
  if (!e || e.target === document.getElementById("infoModal")) {
    document.getElementById("infoModal").classList.add("hidden");
  }
}

// ── HELP MODAL (full dashboard guide) ─────────────────────────────────────
const HELP_SECTIONS = [
  {
    icon: "🌍",
    title: "מאקרו — נתוני שווקים עולמיים",
    body: [
      "טבלה עם 12 מדינות מציגה תמ״ג, תמ״ג לנפש, צמיחה, אינפלציה, ריבית, אבטלה, יחס חוב/תמ״ג, ותשואת אג״ח 10Y.",
      "ליד כל מדינה מופיע סימון ירוק/אדום המראה האם הבורסה שלה פתוחה כרגע (הסימון מתעדכן אוטומטית כל דקה).",
      "נתונים נשלפים אוטומטית מ-World Bank, Trading Economics ו-FRED. שדות עם 🔒 הם ידניים בלבד.",
    ],
  },
  {
    icon: "📊",
    title: "מדדים — S&P 500, נאסד\"ק, ת\"א 35 וכו'",
    body: [
      "כל מדד מציג: מחיר, שינוי 24ש, מכפיל רווח (P/E), מכפיל עתידי, מכפיל ממוצע היסטורי, מדד שילר (CAPE), תשואת דיבידנד, ורווחיות.",
      "לחיצה על כותרת P/E ממוצע היסטורי או Shiller CAPE (עם ℹ️) תפתח הסבר מלא על המדד — ממה מחושב, טווחי ערכים, ואיך להשתמש בו.",
      "לחיצה על שם המדד פותחת גרף חודשי/שנתי + רשימת קרנות מחקות בש״ח ובדולר.",
      "לחצן 📌 רפרנס שומר את המחיר הנוכחי כנקודת השוואה — מאוחר יותר תראה את השינוי באחוזים מהרפרנס.",
    ],
  },
  {
    icon: "🏭",
    title: "סקטורים",
    body: [
      "סקטורים שונים לפי אזור (ארה״ב, אירופה, ישראל).",
      "מציג ביצועים של ETF-סקטוריאליים (XLK, XLF, XLV וכו').",
      "לחיצה על סקטור פותחת גרף.",
    ],
  },
  {
    icon: "🛢️",
    title: "סחורות ומטבעות",
    body: [
      "נפט, זהב, כסף, גז טבעי, ועוד — כולל שער התחלה של השנה.",
      "מטבעות כוללים USD/ILS, EUR/ILS, GBP/ILS — מקור: בנק ישראל + Yahoo Finance.",
    ],
  },
  {
    icon: "😱",
    title: "מדדי פחד",
    body: [
      "Fear & Greed (CNN), VIX, Put/Call Ratio, AAII Sentiment, Buffett Indicator.",
      "לחיצה על כל כרטיס פותחת הסבר מלא על המדד — מה הוא מודד, איך לפרש, ומה מקור המידע.",
    ],
  },
  {
    icon: "💼",
    title: "תיק אישי + סקרינר מניות",
    body: [
      "הוסף מניות בודדות לסקרינר לקבלת P/E, יחס חוב, דיבידנד, וכו'. מניות ישראליות (.TA) מומרות מאגורות לשקלים אוטומטית.",
      "לחצן ➕ השווה פותח פאנל השוואה של עד 4 מניות זו לצד זו — התא הכי טוב בכל שורה מוצג בירוק, הכי גרוע באדום.",
      "ניתן לייבא/לייצא את התיק ב-JSON או CSV (כפתור 💾 בכותרת).",
    ],
  },
  {
    icon: "⚙️",
    title: "הגדרות API + מקורות",
    body: [
      "לחצן ⚙️ בכותרת פותח את פאנל מקורות ה-API. יש 3 רמות: אוטומטי (ללא מפתח), חינמי (עם מפתח), ובתשלום.",
      "המפתחות נשמרים בדפדפן בלבד — לעולם לא נשלחים לשרת.",
      "רשימת התיעדוף מראה איזה מקור ישמש ראשון לכל סוג נתון.",
    ],
  },
  {
    icon: "💡",
    title: "טיפים כלליים",
    body: [
      "🔍 Ctrl+K פותח חיפוש מהיר — חפש מדד, סקטור, מניה, סחורה או מטבע.",
      "🔄 לחצן \"משוך נתונים\" בראש הדף מביא עדכון מלא. כל טאב גם מציג לחצן 🔄 שלו למשיכה של הסעיף בלבד.",
      "🌙/☀️ כפתור מעבר בין עיצוב כהה לבהיר — נשמר בדפדפן.",
      "💾 ייצוא/ייבוא לגיבוי — תמיד טוב לייצא JSON לפני שינויים גדולים.",
      "📈 כמעט כל מספר בדשבורד ניתן לעריכה ידנית — לחץ על התא לערוך.",
      "ℹ️ חפש את הסמל הזה ליד שדות — לחיצה תפתח הסבר מלא על המדד.",
    ],
  },
];

function openHelp() {
  const esc = s => (s || "").replace(/</g, "&lt;");
  let html = `<div class="help-intro">דשבורד זה מרכז נתוני שוק ומאקרו ממקורות מרובים. המדריך להלן יעזור לך לנצל את כל היכולות.</div>`;
  HELP_SECTIONS.forEach(sec => {
    html += `<div class="help-section">`;
    html += `<div class="help-section-title">${sec.icon} ${esc(sec.title)}</div>`;
    html += `<ul class="help-section-list">`;
    sec.body.forEach(line => { html += `<li>${esc(line)}</li>`; });
    html += `</ul></div>`;
  });
  html += `<div class="help-footer">נתקלת בבעיה? בדוק את הקונסול (F12) — הדשבורד מתעד בלוג את כל קריאות ה-API.</div>`;
  document.getElementById("helpBody").innerHTML = html;
  document.getElementById("helpModal").classList.remove("hidden");
}
function closeHelp(e) {
  if (!e || e.target === document.getElementById("helpModal")) {
    document.getElementById("helpModal").classList.add("hidden");
  }
}

function colorClass(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return "";
  return n > 0 ? "positive" : n < 0 ? "negative" : "";
}

function updateTimestamp(section) {
  STATE.timestamps[section] = new Date().toISOString();
  const el = document.getElementById("ts-" + section);
  if (el) el.textContent = "עדכון אחרון: " + fmtDate(STATE.timestamps[section]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDITABLE CELL
// ═══════════════════════════════════════════════════════════════════════════════

function makeCell(section, rowKey, fieldKey, value, isColor, fmt) {
  let display;
  if (fmt === "gdp") display = fmtGDP(value);
  else if (fmt === "money") display = fmtMoney(value);
  else display = fmtNum(value);
  const cls = isColor ? colorClass(value) : "";
  return `<span class="cell-val ${cls}" onclick="startEdit(this,'${section}','${rowKey}','${fieldKey}')" title="לחץ לעריכה">${display}</span>`;
}

function startEdit(el, section, rowKey, fieldKey) {
  const current = (STATE[section]?.[rowKey]?.[fieldKey]) || "";
  el.outerHTML = `<span class="cell-edit">
    <input value="${current}" onkeydown="if(event.key==='Enter')commitEdit(this,'${section}','${rowKey}','${fieldKey}');if(event.key==='Escape')cancelEdit('${section}')" autofocus />
    <button style="background:var(--green);color:#000" onclick="commitEdit(this.previousElementSibling,'${section}','${rowKey}','${fieldKey}')">✓</button>
    <button style="background:var(--text-faint);color:#fff" onclick="cancelEdit('${section}')">✕</button>
  </span>`;
}

function commitEdit(input, section, rowKey, fieldKey) {
  if (!STATE[section][rowKey]) STATE[section][rowKey] = {};
  STATE[section][rowKey][fieldKey] = input.value;
  updateTimestamp(section);
  saveState();
  renderSection(section);
}

function cancelEdit(section) { renderSection(section); }

// ═══════════════════════════════════════════════════════════════════════════════
// REFERENCE POINTS
// ═══════════════════════════════════════════════════════════════════════════════

function setRefPoint(category, key) {
  const data = STATE[category]?.[key];
  if (!data) return;
  const price = parseFloat(data.price || data.rate);
  if (!price || isNaN(price)) { showStatus("אין מחיר נוכחי לשמירה", "error"); return; }
  if (!STATE.refPoints[category]) STATE.refPoints[category] = {};
  STATE.refPoints[category][key] = {
    price: price,
    date: new Date().toISOString(),
  };
  saveState();
  renderSection(category === "indices" ? "indices" : "commodities");
  showStatus(`נקודת רפרנס נשמרה: ${key} = ${price}`, "success");
}

function clearRefPoint(category, key) {
  if (STATE.refPoints[category]) {
    delete STATE.refPoints[category][key];
    saveState();
    renderSection(category === "indices" ? "indices" : "commodities");
  }
}

function getRefChange(category, key) {
  const ref = STATE.refPoints?.[category]?.[key];
  if (!ref) return null;
  const data = STATE[category]?.[key];
  const currentPrice = parseFloat(data?.price);
  if (!currentPrice || isNaN(currentPrice)) return null;
  const change = ((currentPrice - ref.price) / ref.price * 100);
  return { change: change.toFixed(2), date: ref.date, refPrice: ref.price };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARKET-OPEN INDICATOR
// ═══════════════════════════════════════════════════════════════════════════════

// Parse "HH:MM" → minutes-since-midnight
function _hm2min(hm) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

// Return {open: bool, status: string, name: string} for a region's exchange
function isMarketOpen(regionKey) {
  const mh = typeof MARKET_HOURS !== "undefined" ? MARKET_HOURS[regionKey] : null;
  if (!mh) return { open: false, status: "אין נתוני בורסה", name: "" };
  try {
    // Get current time in that exchange's timezone
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: mh.tz, hour12: false,
      weekday: "short", hour: "2-digit", minute: "2-digit",
    });
    const parts = fmt.formatToParts(new Date());
    const wdShort = parts.find(p => p.type === "weekday").value; // Sun/Mon/…
    const hh = parts.find(p => p.type === "hour").value;
    const mm = parts.find(p => p.type === "minute").value;
    const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const wd = wdMap[wdShort];
    const nowMin = parseInt(hh, 10) * 60 + parseInt(mm, 10);
    const nowStr = `${hh}:${mm}`;
    const openMin = _hm2min(mh.open);
    const closeMin = _hm2min(mh.close);
    const isTradingDay = mh.days.includes(wd);
    if (!isTradingDay) {
      return { open: false, name: mh.name, status: `${mh.name} • סגור (סוף שבוע) • ${nowStr} מקומי` };
    }
    if (nowMin < openMin) {
      return { open: false, name: mh.name, status: `${mh.name} • סגור • נפתח ב-${mh.open} (כעת ${nowStr})` };
    }
    if (nowMin >= closeMin) {
      return { open: false, name: mh.name, status: `${mh.name} • סגור (נעל ב-${mh.close}) • ${nowStr} מקומי` };
    }
    // Check lunch break
    if (mh.lunch) {
      const lStart = _hm2min(mh.lunch[0]);
      const lEnd = _hm2min(mh.lunch[1]);
      if (nowMin >= lStart && nowMin < lEnd) {
        return { open: false, name: mh.name, status: `${mh.name} • הפסקת צהריים (${mh.lunch[0]}–${mh.lunch[1]}) • ${nowStr} מקומי` };
      }
    }
    return { open: true, name: mh.name, status: `${mh.name} • פתוח • ${nowStr} מקומי (נסגר ב-${mh.close})` };
  } catch (e) {
    return { open: false, name: mh.name || "", status: "שגיאה בחישוב שעות" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function renderMacro() {
  let html = `<thead><tr><th>אזור</th>`;
  MACRO_FIELDS.forEach(f => html += `<th>${f.label}${f.manual ? " 🔒" : ""}</th>`);
  html += `<th>בורסה</th></tr></thead><tbody>`;
  REGIONS.forEach(r => {
    const mkt = isMarketOpen(r.key);
    const dotCls = mkt.open ? "market-dot market-open" : "market-dot market-closed";
    const dot = `<span class="${dotCls}" title="${mkt.status}">●</span>`;
    html += `<tr><td class="label">${dot} ${r.flag} ${r.name}</td>`;
    MACRO_FIELDS.forEach(f => {
      html += `<td>${makeCell("macro", r.key, f.key, STATE.macro[r.key]?.[f.key], false, f.fmt)}</td>`;
    });
    // Market-status column (more explicit on desktop; dot is also in label)
    const statusTxt = mkt.open ? "פתוח" : "סגור";
    html += `<td data-label="בורסה" title="${mkt.status}"><span class="${dotCls}">●</span> <span class="market-status-txt">${statusTxt}</span><div class="market-name">${mkt.name || ""}</div></td>`;
    html += `</tr>`;
  });
  html += `</tbody>`;
  document.getElementById("macroTable").innerHTML = html;
  document.getElementById("ts-macro").textContent = "עדכון אחרון: " + fmtDate(STATE.timestamps.macro);
}

function renderIndices() {
  let html = `<thead><tr><th>מדד</th><th>אזור</th>`;
  INDEX_FIELDS.forEach(f => {
    if (f.ref) {
      html += `<th>${f.label}</th>`;
    } else {
      const hasInfo = (f.key === "pe_historical_avg" || f.key === "shiller_cape" || f.key === "pe_forward");
      if (hasInfo) {
        html += `<th><span onclick="openInfo('${f.key}')" style="cursor:pointer;color:var(--accent)" title="לחץ להסבר על המדד">${f.label}${f.manual ? " 🔒" : ""} ℹ️</span></th>`;
      } else {
        html += `<th>${f.label}${f.manual ? " 🔒" : ""}</th>`;
      }
    }
  });
  html += `<th>📌 רפרנס</th>`;
  html += `</tr></thead><tbody>`;
  INDICES.forEach(idx => {
    const escapedName = idx.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    // Pass index key — openChart will look up INDEX_FUNDS internally (avoids JSON in onclick)
    html += `<tr><td class="label"><a href="#" onclick="openChart('${idx.sym}','${escapedName}','${idx.key}');return false" style="color:var(--accent);text-decoration:none;cursor:pointer" title="לחץ לגרף + קרנות מחקות">${idx.name}</a></td><td data-label="אזור">${idx.region}</td>`;
    INDEX_FIELDS.forEach(f => {
      if (f.ref) {
        const ref = getRefChange("indices", idx.key);
        if (ref) {
          const cls = colorClass(ref.change);
          const dt = new Date(ref.date);
          const dateStr = dt.toLocaleDateString("he-IL");
          html += `<td data-label="${f.label}"><span class="${cls}">${fmtNum(ref.change)}%</span><span class="ref-date">${dateStr} (${fmtNum(ref.refPrice)})</span></td>`;
        } else {
          html += `<td data-label="${f.label}">—</td>`;
        }
      } else {
        const hasInfo = (f.key === "pe_historical_avg" || f.key === "shiller_cape" || f.key === "pe_forward");
        const infoBtn = hasInfo ? ` <span class="inline-info-btn" onclick="openInfo('${f.key}')" title="לחץ להסבר">ℹ️</span>` : "";
        html += `<td data-label="${f.label}">${makeCell("indices", idx.key, f.key, STATE.indices[idx.key]?.[f.key], f.color)}${infoBtn}</td>`;
      }
    });
    // Reference point button
    const hasRef = STATE.refPoints?.indices?.[idx.key];
    html += `<td data-label="רפרנס">`;
    html += `<button class="ref-btn${hasRef ? ' active' : ''}" onclick="setRefPoint('indices','${idx.key}')" title="סמן מחיר נוכחי כרפרנס">📌</button>`;
    if (hasRef) html += ` <button class="ref-btn" onclick="clearRefPoint('indices','${idx.key}')" title="נקה רפרנס">✕</button>`;
    html += `</td>`;
    html += `</tr>`;
  });
  html += `</tbody>`;
  document.getElementById("indicesTable").innerHTML = html;
  document.getElementById("ts-indices").textContent = "עדכון אחרון: " + fmtDate(STATE.timestamps.indices);
}

function switchSectorRegion(region, btn) {
  SECTOR_ACTIVE_REGION = region;
  document.querySelectorAll(".sector-region-btn").forEach(b => b.classList.toggle("active", b.dataset.region === region));
  renderSectors();
}

function renderSectors() {
  const sectors = getCurrentSectors();
  const etfs = getCurrentSectorETFs();
  let html = `<thead><tr><th>סקטור</th>`;
  SECTOR_FIELDS.forEach(f => {
    if (f.key === "funds") {
      html += `<th>${f.label}</th>`;
    } else {
      html += `<th>${f.label}${f.manual ? " 🔒" : ""}</th>`;
    }
  });
  html += `</tr></thead><tbody>`;
  sectors.forEach(sec => {
    const sectorName = sec.name;
    const etf = sec.etf || etfs[sectorName];
    const stateKey = `${SECTOR_ACTIVE_REGION}:${sectorName}`;
    const escapedName = sectorName.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    // Store funds in window._sectorFunds map to avoid JSON in onclick
    if (!window._sectorFunds) window._sectorFunds = {};
    window._sectorFunds[etf] = sec.funds || null;
    html += `<tr><td class="label"><a href="#" onclick="openChartSector('${etf}','${escapedName}');return false" style="color:var(--accent);text-decoration:none;cursor:pointer" title="לחץ לגרף + קרנות">${sectorName}</a></td>`;
    SECTOR_FIELDS.forEach(f => {
      if (f.key === "region") {
        html += `<td>${sec.region}</td>`;
      } else if (f.key === "funds") {
        const fundsList = [];
        if (sec.funds?.usd?.length) fundsList.push(...sec.funds.usd);
        if (sec.funds?.ils?.length) fundsList.push(...sec.funds.ils);
        html += `<td style="font-family:var(--sans);font-size:11px;color:var(--text-faint)">${fundsList.length ? fundsList.join(', ') : '—'}</td>`;
      } else {
        html += `<td>${makeCell("sectors", stateKey, f.key, STATE.sectors[stateKey]?.[f.key], f.color)}</td>`;
      }
    });
    html += `</tr>`;
  });
  html += `</tbody>`;
  document.getElementById("sectorsTable").innerHTML = html;
  document.getElementById("ts-sectors").textContent = "עדכון אחרון: " + fmtDate(STATE.timestamps.sectors);
}

function renderCommodities() {
  let html = `<thead><tr><th>סחורה</th><th>מחיר</th><th>שינוי יומי %</th><th>שינוי מתחילת שנה %</th><th>שינוי 12 חודשים %</th><th>שינוי מרפרנס %</th><th>📌 רפרנס</th><th>יחידה</th></tr></thead><tbody>`;
  COMMODITIES.forEach(c => {
    const escapedName = c.name.replace(/'/g, "\\'");
    html += `<tr><td class="label"><a href="#" onclick="openChart('${c.sym}','${escapedName}');return false" style="color:var(--accent);text-decoration:none;cursor:pointer" title="לחץ לגרף">${c.name}</a></td>`;
    html += `<td>${makeCell("commodities", c.key, "price", STATE.commodities[c.key]?.price, false)}</td>`;
    html += `<td>${makeCell("commodities", c.key, "change_pct", STATE.commodities[c.key]?.change_pct, true)}</td>`;
    html += `<td>${makeCell("commodities", c.key, "change_ytd", STATE.commodities[c.key]?.change_ytd, true)}</td>`;
    html += `<td>${makeCell("commodities", c.key, "change_12m", STATE.commodities[c.key]?.change_12m, true)}</td>`;
    // Reference change
    const ref = getRefChange("commodities", c.key);
    if (ref) {
      const cls = colorClass(ref.change);
      const dt = new Date(ref.date);
      const dateStr = dt.toLocaleDateString("he-IL");
      html += `<td><span class="${cls}">${fmtNum(ref.change)}%</span><span class="ref-date">${dateStr} (${fmtNum(ref.refPrice)})</span></td>`;
    } else {
      html += `<td>—</td>`;
    }
    // Reference button
    const hasRef = STATE.refPoints?.commodities?.[c.key];
    html += `<td>`;
    html += `<button class="ref-btn${hasRef ? ' active' : ''}" onclick="setRefPoint('commodities','${c.key}')" title="סמן מחיר נוכחי כרפרנס">📌</button>`;
    if (hasRef) html += ` <button class="ref-btn" onclick="clearRefPoint('commodities','${c.key}')" title="נקה רפרנס">✕</button>`;
    html += `</td>`;
    html += `<td>${c.unit}</td></tr>`;
  });
  html += `</tbody>`;
  document.getElementById("commoditiesTable").innerHTML = html;
  document.getElementById("ts-commodities").textContent = "עדכון אחרון: " + fmtDate(STATE.timestamps.commodities);
}

function renderCurrencies() {
  let html = `<thead><tr><th>מטבע</th><th>שם</th><th>שער מול ₪</th><th>שינוי יומי %</th></tr></thead><tbody>`;
  CURRENCIES.forEach(c => {
    const yahooSym = c.yahoo || (c.cross ? c.cross[0] : c.key);
    html += `<tr><td class="label"><a href="#" onclick="openChart('${yahooSym}','${c.name}');return false" style="color:var(--accent);text-decoration:none;cursor:pointer" title="לחץ לגרף">${c.key}</a></td><td>${c.name}</td>`;
    html += `<td>${makeCell("currencies", c.key, "rate", STATE.currencies[c.key]?.rate, false)}</td>`;
    html += `<td>${makeCell("currencies", c.key, "change_pct", STATE.currencies[c.key]?.change_pct, true)}</td>`;
    html += `</tr>`;
  });
  html += `</tbody>`;
  document.getElementById("currenciesTable").innerHTML = html;
  document.getElementById("ts-currencies").textContent = "עדכון אחרון: " + fmtDate(STATE.timestamps.currencies);
}

function renderFear() {
  let html = "";
  FEAR_INDICATORS.forEach(ind => {
    const val = STATE.fear[ind.key]?.value;
    const display = fmtNum(val);
    let extra = "";

    if (ind.type === "vix" && val) {
      const n = parseFloat(val);
      const lbl = n < 20 ? "רגוע ✓" : n < 30 ? "חשש ⚠" : "פאניקה 🔥";
      const bg = n < 20 ? "#166534" : n < 30 ? "#854d0e" : "#991b1b";
      extra = `<div class="fear-badge" style="background:${bg}">${lbl}</div>`;
    }
    if (ind.type === "bar" && val) {
      const w = Math.min(100, Math.max(0, parseFloat(val)));
      extra = `<div class="fear-bar"><div class="fear-bar-fill" style="width:${w}%"></div></div>
               <div class="fear-bar-labels"><span>פחד קיצוני</span><span>חמדנות קיצונית</span></div>`;
    }
    if (ind.type === "spread" && val && parseFloat(val) < 0) {
      extra = `<div style="margin-top:8px;color:var(--red);font-size:12px;font-weight:600">⚠ עקום תשואות הפוך — אזהרת מיתון</div>`;
    }

    const hasInfo = typeof METRIC_INFO !== "undefined" && METRIC_INFO[ind.key];
    const clickable = hasInfo ? ' clickable' : '';
    const infoClick = hasInfo ? ` onclick="if(event.target.closest('.cell-val, .cell-edit, input'))return; openInfo('${ind.key}')" title="לחץ להסבר מלא על המדד"` : '';
    html += `<div class="fear-card${clickable}"${infoClick}>
      <div class="fear-label">${ind.label}${ind.manual ? " 🔒" : ""}${hasInfo ? ' <span style="color:var(--accent);font-size:12px">ℹ️</span>' : ''}</div>
      <div class="fear-value"><span class="cell-val" onclick="event.stopPropagation();startEdit(this,'fear','${ind.key}','value')" title="לחץ לעריכה">${display}</span></div>
      <div class="fear-desc">${ind.desc}</div>
      ${extra}
    </div>`;
  });
  document.getElementById("fearGrid").innerHTML = html;
  document.getElementById("ts-fear").textContent = "עדכון אחרון: " + fmtDate(STATE.timestamps.fear);
}

function renderPortfolio() {
  const container = document.getElementById("portfolioContent");
  const summary = document.getElementById("portfolioSummary");

  if (STATE.portfolio.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div style="font-size:40px;margin-bottom:12px">📋</div>
      <div>אין מניות בתיק. הוסף מניות באמצעות הטופס למעלה.</div>
      <div style="margin-top:8px;color:var(--text-faint);font-size:13px">ניתן גם לייבא מקובץ JSON</div>
    </div>`;
    summary.innerHTML = "";
    return;
  }

  let totalValue = 0, totalPnl = 0;
  let html = `<div class="table-wrap"><table>
    <thead><tr>
      <th>סימול / שם</th><th>כמות</th><th>מחיר ממוצע</th><th>מחיר נוכחי</th>
      <th>שינוי יומי %</th><th>רווח/הפסד</th><th>רווח %</th><th>שווי</th><th>סקטור</th><th>הערות</th><th></th>
    </tr></thead><tbody>`;

  STATE.portfolio.forEach((s, i) => {
    const cp = s.currentPrice || 0;
    const pnl = s.shares * (cp - s.avgPrice);
    const pnlPct = s.avgPrice ? ((cp - s.avgPrice) / s.avgPrice * 100) : 0;
    const val = s.shares * cp;
    totalValue += val;
    totalPnl += pnl;

    html += `<tr>
      <td class="label">${s.symbol} <span style="font-weight:400;color:var(--text-faint);font-size:12px">${s.name ? '· ' + s.name : ''}</span></td>
      <td data-label="כמות"><span class="cell-val" onclick="editPortfolioField(${i},'shares')">${s.shares}</span></td>
      <td data-label="מחיר ממוצע"><span class="cell-val" onclick="editPortfolioField(${i},'avgPrice')">${fmtNum(s.avgPrice)}</span></td>
      <td data-label="מחיר נוכחי">${cp ? fmtNum(cp) : "—"}</td>
      <td data-label="שינוי יומי" class="${colorClass(s.dayChange)}">${s.dayChange ? fmtNum(s.dayChange) + "%" : "—"}</td>
      <td data-label="רווח/הפסד" class="${colorClass(pnl)}">${cp ? "$" + fmtNum(pnl, 0) : "—"}</td>
      <td data-label="רווח %" class="${colorClass(pnlPct)}">${cp ? fmtNum(pnlPct) + "%" : "—"}</td>
      <td data-label="שווי">${cp ? "$" + fmtNum(val, 0) : "—"}</td>
      <td data-label="סקטור" style="font-size:11px">${s.sector || "—"}</td>
      <td data-label="הערות"><input class="notes-input" value="${(s.notes||'').replace(/"/g,'&quot;')}" onchange="updateNotes(${i},this.value)" placeholder="הערה..." /></td>
      <td data-label=""><button class="btn-danger" onclick="removeStock(${i})">✕ הסר</button></td>
    </tr>`;
  });

  html += `</tbody><tfoot><tr class="tfoot-total">
    <td colspan="7" style="text-align:left;font-family:var(--sans)">סה״כ שווי תיק</td>
    <td style="color:var(--accent)">$${totalValue.toLocaleString("en-US",{maximumFractionDigits:0})}</td>
    <td colspan="3"></td>
  </tr></tfoot></table></div>`;

  container.innerHTML = html;

  const sectorCount = new Set(STATE.portfolio.map(p => p.sector).filter(Boolean)).size;
  summary.innerHTML = `
    <div class="summary-card"><div class="summary-label">מניות בתיק</div><div class="summary-value">${STATE.portfolio.length}</div></div>
    <div class="summary-card"><div class="summary-label">רווח/הפסד כולל</div><div class="summary-value ${colorClass(totalPnl)}">$${totalPnl.toFixed(0)}</div></div>
    <div class="summary-card"><div class="summary-label">סקטורים</div><div class="summary-value">${sectorCount}</div></div>
  `;

  document.getElementById("ts-portfolio").textContent = "עדכון אחרון: " + fmtDate(STATE.timestamps.portfolio);
}

function renderSection(section) {
  const map = { macro: renderMacro, indices: renderIndices, sectors: renderSectors, commodities: renderCommodities, currencies: renderCurrencies, fear: renderFear, portfolio: renderPortfolio };
  if (map[section]) map[section]();
}

function renderAll() {
  renderMacro(); renderIndices(); renderSectors(); renderCommodities(); renderCurrencies(); renderFear(); renderPortfolio();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PORTFOLIO ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function addStock() {
  const symbol = document.getElementById("pf-symbol").value.trim().toUpperCase();
  if (!symbol) return;
  STATE.portfolio.push({
    id: Date.now(),
    symbol,
    name: document.getElementById("pf-name").value.trim(),
    shares: parseFloat(document.getElementById("pf-shares").value) || 0,
    avgPrice: parseFloat(document.getElementById("pf-avg").value) || 0,
    sector: document.getElementById("pf-sector").value,
    notes: document.getElementById("pf-notes").value.trim(),
    currentPrice: null, dayChange: null, lastFetched: null,
    addedDate: new Date().toISOString(),
  });
  updateTimestamp("portfolio");
  saveState();
  renderPortfolio();
  ["pf-symbol","pf-name","pf-shares","pf-avg","pf-notes"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("pf-sector").value = "";
}

function removeStock(idx) {
  if (!confirm("להסיר את " + STATE.portfolio[idx].symbol + "?")) return;
  STATE.portfolio.splice(idx, 1);
  saveState();
  renderPortfolio();
}

function updateNotes(idx, val) {
  STATE.portfolio[idx].notes = val;
  saveState();
}

function editPortfolioField(idx, field) {
  const current = STATE.portfolio[idx][field];
  const val = prompt(field === "shares" ? "כמות חדשה:" : "מחיר ממוצע חדש:", current);
  if (val === null) return;
  STATE.portfolio[idx][field] = parseFloat(val) || 0;
  saveState();
  renderPortfolio();
}

// ═══════════════════════════════════════════════════════════════════════════════
// STOCK COMPARISON (up to 4)
// ═══════════════════════════════════════════════════════════════════════════════

const COMPARE_MAX = 4;
window._compareStocks = []; // [{ symbol, data }]

function renderCompareSlots() {
  const el = document.getElementById("compareSlots");
  if (!el) return;
  let html = "";
  window._compareStocks.forEach((s, i) => {
    html += `<span class="compare-slot"><strong>${s.symbol}</strong>
      <button class="remove" onclick="removeFromCompare(${i})" title="הסר">✕</button></span>`;
  });
  const empty = COMPARE_MAX - window._compareStocks.length;
  for (let i = 0; i < empty; i++) {
    html += `<span class="compare-slot empty">— ריק —</span>`;
  }
  el.innerHTML = html;
}

async function addToCompare() {
  const input = document.getElementById("scannerSymbol");
  const sym = (input?.value || "").trim().toUpperCase();
  if (!sym) { showStatus("הזן סימול תחילה", "error"); return; }
  if (window._compareStocks.length >= COMPARE_MAX) {
    showStatus(`ניתן להשוות עד ${COMPARE_MAX} מניות — הסר אחת קודם`, "error");
    return;
  }
  if (window._compareStocks.some(s => s.symbol === sym)) {
    showStatus(`${sym} כבר בהשוואה`, "error");
    return;
  }
  document.getElementById("comparePanel").classList.remove("hidden");
  // Placeholder while loading
  window._compareStocks.push({ symbol: sym, data: null });
  renderCompareSlots();
  renderCompareTable();
  showStatus(`שולף נתונים ל-${sym}...`, "info");
  try {
    const data = await fetchCompareData(sym);
    const entry = window._compareStocks.find(s => s.symbol === sym);
    if (entry) entry.data = data;
    renderCompareSlots();
    renderCompareTable();
  } catch (e) {
    showStatus(`שגיאה בשליפת ${sym}: ${e.message}`, "error");
    removeFromCompare(window._compareStocks.findIndex(s => s.symbol === sym));
  }
}

async function fetchCompareData(sym) {
  const isIL = sym.includes('.TA');
  const q = await yahooQuote(sym).catch(() => null);
  if (!q || !q.price) throw new Error("לא נמצא מחיר");
  // agorot → ש"ח
  if (isIL) {
    q.price /= 100;
    if (q.fiftyTwoWeekHigh) q.fiftyTwoWeekHigh /= 100;
    if (q.fiftyTwoWeekLow)  q.fiftyTwoWeekLow  /= 100;
  }
  const [det, ytd, m12] = await Promise.all([
    fetchStockDetails(sym).catch(() => ({})),
    yahooYTDChange(sym).catch(() => null),
    yahoo12MChange(sym).catch(() => null),
  ]);
  return {
    price: q.price,
    change_pct: q.change_pct,
    currency: isIL ? '₪' : '$',
    pe: det.pe || null,
    forwardPE: det.forwardPE || null,
    pb: det.pb || null,
    evEbitda: det.evEbitda || null,
    enterpriseValue: det.enterpriseValue || null,
    eps: det.eps || null,
    beta: det.beta || null,
    debtEquity: det.debtEquity || null,
    roe: det.roe || null,
    divYield: det.divYield || null,
    marketCap: det.marketCap || null,
    priceTarget: det.priceTarget || null,
    analystRating: det.analystRating || null,
    ytdChange: ytd,
    m12Change: m12,
  };
}

function removeFromCompare(idx) {
  if (idx < 0) return;
  window._compareStocks.splice(idx, 1);
  renderCompareSlots();
  renderCompareTable();
  if (window._compareStocks.length === 0) {
    document.getElementById("comparePanel").classList.add("hidden");
  }
}

function clearCompare() {
  window._compareStocks = [];
  renderCompareSlots();
  renderCompareTable();
  document.getElementById("comparePanel").classList.add("hidden");
}

function renderCompareTable() {
  const el = document.getElementById("compareTable");
  if (!el) return;
  if (window._compareStocks.length === 0) { el.innerHTML = ""; return; }

  const rows = [
    { label: "מחיר נוכחי", key: "price", fmt: (v, d) => d.currency + parseFloat(v).toFixed(2), bestHigh: null },
    { label: "שינוי יומי %", key: "change_pct", fmt: v => parseFloat(v).toFixed(2) + "%", bestHigh: true, color: true },
    { label: "שינוי YTD %", key: "ytdChange", fmt: v => parseFloat(v).toFixed(2) + "%", bestHigh: true, color: true },
    { label: "שינוי 12M %", key: "m12Change", fmt: v => parseFloat(v).toFixed(2) + "%", bestHigh: true, color: true },
    { label: "P/E נוכחי", key: "pe", fmt: v => parseFloat(v).toFixed(2), bestHigh: false }, // lower = cheaper
    { label: "P/E עתידי", key: "forwardPE", fmt: v => parseFloat(v).toFixed(2), bestHigh: false },
    { label: "P/B", key: "pb", fmt: v => parseFloat(v).toFixed(2), bestHigh: false },
    { label: "EV/EBITDA", key: "evEbitda", fmt: v => parseFloat(v).toFixed(2), bestHigh: false },
    { label: "EPS", key: "eps", fmt: (v, d) => d.currency + parseFloat(v).toFixed(2), bestHigh: true },
    { label: "Beta", key: "beta", fmt: v => parseFloat(v).toFixed(2), bestHigh: null },
    { label: "חוב/הון", key: "debtEquity", fmt: v => parseFloat(v).toFixed(2), bestHigh: false },
    { label: "ROE", key: "roe", fmt: v => v, bestHigh: null },
    { label: "דיבידנד", key: "divYield", fmt: v => v, bestHigh: null },
    { label: "שווי שוק", key: "marketCap", fmt: v => v, bestHigh: null },
    { label: "Enterprise Value", key: "enterpriseValue", fmt: v => v, bestHigh: null },
    { label: "יעד אנליסטים", key: "priceTarget", fmt: (v, d) => d.currency + parseFloat(v).toFixed(2), bestHigh: null },
    { label: "קונצנזוס", key: "analystRating", fmt: v => v, bestHigh: null },
  ];

  let html = `<div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>מדד</th>`;
  window._compareStocks.forEach(s => html += `<th>${s.symbol}</th>`);
  html += `</tr></thead><tbody>`;

  rows.forEach(row => {
    html += `<tr><td>${row.label}</td>`;
    // Collect numeric values for best/worst highlighting
    const vals = window._compareStocks.map(s => {
      if (!s.data) return null;
      const v = s.data[row.key];
      if (v == null || v === "") return null;
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    });
    const valid = vals.filter(v => v != null);
    let best = null, worst = null;
    if (row.bestHigh != null && valid.length > 1) {
      if (row.bestHigh) { best = Math.max(...valid); worst = Math.min(...valid); }
      else              { best = Math.min(...valid); worst = Math.max(...valid); }
    }
    window._compareStocks.forEach((s, idx) => {
      if (!s.data) { html += `<td>…</td>`; return; }
      const v = s.data[row.key];
      if (v == null || v === "") { html += `<td style="color:var(--text-ghost)">—</td>`; return; }
      let cls = "";
      const n = vals[idx];
      if (best != null && n != null) {
        if (n === best)  cls = "best";
        else if (n === worst) cls = "worst";
      }
      if (row.color && n != null) cls = n >= 0 ? "best" : "worst";
      let display;
      try { display = row.fmt(v, s.data); }
      catch(e) { display = v; }
      html += `<td class="${cls}">${display}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div>`;
  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

loadState();
checkAuth();
renderAll();

// Refresh market-open indicator every 60 seconds while the macro tab is visible
setInterval(() => {
  try {
    const macroPanel = document.getElementById("panel-macro");
    if (macroPanel && macroPanel.classList.contains("active")) {
      renderMacro();
    }
  } catch (_) {}
}, 60 * 1000);
