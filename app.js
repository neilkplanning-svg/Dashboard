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
    const hasKey = s.id === "td" ? !!STATE.tdApiKey : s.id === "fmp" ? !!STATE.apiKey : s.id === "fred" ? !!STATE.fredApiKey : true;
    const active = !s.keyRequired || hasKey;
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
  const bar = document.getElementById("statusBar");
  bar.textContent = msg;
  bar.className = "status-bar " + type;
  bar.classList.remove("hidden");
  setTimeout(() => bar.classList.add("hidden"), type === "error" ? 8000 : 3000);
}

function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tabId));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + tabId));
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

function makeCell(section, rowKey, fieldKey, value, isColor) {
  const display = fmtNum(value);
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
// RENDER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function renderMacro() {
  let html = `<thead><tr><th>אזור</th>`;
  MACRO_FIELDS.forEach(f => html += `<th>${f.label}${f.manual ? " 🔒" : ""}</th>`);
  html += `</tr></thead><tbody>`;
  REGIONS.forEach(r => {
    html += `<tr><td class="label">${r.flag} ${r.name}</td>`;
    MACRO_FIELDS.forEach(f => {
      html += `<td>${makeCell("macro", r.key, f.key, STATE.macro[r.key]?.[f.key], false)}</td>`;
    });
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
      html += `<th>${f.label}${f.manual ? " 🔒" : ""}</th>`;
    }
  });
  html += `<th>📌 רפרנס</th>`;
  html += `</tr></thead><tbody>`;
  INDICES.forEach(idx => {
    const escapedName = idx.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    // Pass index key — openChart will look up INDEX_FUNDS internally (avoids JSON in onclick)
    html += `<tr><td class="label"><a href="#" onclick="openChart('${idx.sym}','${escapedName}','${idx.key}');return false" style="color:var(--accent);text-decoration:none;cursor:pointer" title="לחץ לגרף + קרנות מחקות">${idx.name}</a></td><td>${idx.region}</td>`;
    INDEX_FIELDS.forEach(f => {
      if (f.ref) {
        const ref = getRefChange("indices", idx.key);
        if (ref) {
          const cls = colorClass(ref.change);
          const dt = new Date(ref.date);
          const dateStr = dt.toLocaleDateString("he-IL");
          html += `<td><span class="${cls}">${fmtNum(ref.change)}%</span><span class="ref-date">${dateStr} (${fmtNum(ref.refPrice)})</span></td>`;
        } else {
          html += `<td>—</td>`;
        }
      } else {
        html += `<td>${makeCell("indices", idx.key, f.key, STATE.indices[idx.key]?.[f.key], f.color)}</td>`;
      }
    });
    // Reference point button
    const hasRef = STATE.refPoints?.indices?.[idx.key];
    html += `<td>`;
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
        html += `<td>${makeCell("sectors", sectorName, f.key, STATE.sectors[sectorName]?.[f.key], f.color)}</td>`;
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

    html += `<div class="fear-card">
      <div class="fear-label">${ind.label}${ind.manual ? " 🔒" : ""}</div>
      <div class="fear-value"><span class="cell-val" onclick="startEdit(this,'fear','${ind.key}','value')" title="לחץ לעריכה">${display}</span></div>
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
      <th>סימול</th><th>שם</th><th>כמות</th><th>מחיר ממוצע</th><th>מחיר נוכחי</th>
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
      <td class="label">${s.symbol}</td>
      <td>${s.name || "—"}</td>
      <td><span class="cell-val" onclick="editPortfolioField(${i},'shares')">${s.shares}</span></td>
      <td><span class="cell-val" onclick="editPortfolioField(${i},'avgPrice')">${fmtNum(s.avgPrice)}</span></td>
      <td>${cp ? fmtNum(cp) : "—"}</td>
      <td class="${colorClass(s.dayChange)}">${s.dayChange ? fmtNum(s.dayChange) + "%" : "—"}</td>
      <td class="${colorClass(pnl)}">${cp ? "$" + fmtNum(pnl, 0) : "—"}</td>
      <td class="${colorClass(pnlPct)}">${cp ? fmtNum(pnlPct) + "%" : "—"}</td>
      <td>${cp ? "$" + fmtNum(val, 0) : "—"}</td>
      <td style="font-size:11px">${s.sector || "—"}</td>
      <td><input class="notes-input" value="${(s.notes||'').replace(/"/g,'&quot;')}" onchange="updateNotes(${i},this.value)" placeholder="הערה..." /></td>
      <td><button class="btn-danger" onclick="removeStock(${i})">✕</button></td>
    </tr>`;
  });

  html += `</tbody><tfoot><tr class="tfoot-total">
    <td colspan="8" style="text-align:left;font-family:var(--sans)">סה״כ שווי תיק</td>
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
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

loadState();
checkAuth();
renderAll();
