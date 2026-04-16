// ═══════════════════════════════════════════════════════════════════════════════
// API FETCH — Multi-source: Yahoo Finance (primary) + TD (fallback) + FMP + BOI + FRED + World Bank
// ═══════════════════════════════════════════════════════════════════════════════

const TD_BASE = "https://api.twelvedata.com";
const FMP_BASE = "https://financialmodelingprep.com/stable";

// Multiple CORS proxies for resilience — if one goes down, try the next
const CORS_PROXIES = [
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.org/?url=${encodeURIComponent(url)}`,
];
let _workingProxy = -1; // cache which proxy works: -1=untested, -2=direct

// ── Core fetch helpers ─────────────────────────────────────────────────────

async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return resp;
  } catch(e) { clearTimeout(timer); throw e; }
}

async function fetchWithProxy(url, timeoutMs = 10000) {
  // If we already know a working proxy, try it first
  if (_workingProxy === -2) {
    try { const r = await fetchWithTimeout(url, timeoutMs); if (r.ok) return r; } catch(e) {}
    _workingProxy = -1;
  } else if (_workingProxy >= 0) {
    try {
      const r = await fetchWithTimeout(CORS_PROXIES[_workingProxy](url), timeoutMs);
      if (r.ok) return r;
    } catch(e) {}
    _workingProxy = -1;
  }
  // Try direct
  try {
    const r = await fetchWithTimeout(url, timeoutMs);
    if (r.ok) { _workingProxy = -2; return r; }
  } catch(e) {}
  // Try each proxy
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    try {
      const r = await fetchWithTimeout(CORS_PROXIES[i](url), timeoutMs);
      if (r.ok) { _workingProxy = i; return r; }
    } catch(e) { continue; }
  }
  throw new Error("All proxies failed");
}

// ── Yahoo Finance v8 chart API ─────────────────────────────────────────────

async function yahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const resp = await fetchWithProxy(url);
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch(e) { return null; }
  const result = json.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta;
  const price = meta.regularMarketPrice;
  if (!price) return null;
  const prevClose = meta.chartPreviousClose || meta.previousClose || price;
  const change = prevClose ? ((price - prevClose) / prevClose * 100) : 0;
  const quote = result.indicators?.quote?.[0];
  const lastIdx = quote?.close ? quote.close.length - 1 : -1;
  return {
    symbol: meta.symbol || symbol,
    price,
    open: (lastIdx >= 0 && quote.open[lastIdx]) || price,
    high: (lastIdx >= 0 && quote.high[lastIdx]) || price,
    low: (lastIdx >= 0 && quote.low[lastIdx]) || price,
    volume: (lastIdx >= 0 && quote.volume[lastIdx]) || meta.regularMarketVolume || 0,
    change_pct: change,
    name: meta.shortName || meta.longName || "",
    date: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10) : ""
  };
}

async function yahooBatch(symbols, concurrency = 5) {
  const results = [];
  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async sym => {
        try { return await yahooQuote(sym); }
        catch(e) { console.warn(`Yahoo ${sym}:`, e.message); return null; }
      })
    );
    results.push(...batchResults.filter(Boolean));
  }
  return results;
}

// ── Twelve Data (fallback, requires API key) ────────────────────────────────

async function tdQuote(symbols) {
  if (!STATE.tdApiKey) throw new Error("No TD key");
  const symbolStr = Array.isArray(symbols) ? symbols.join(",") : symbols;
  const url = `${TD_BASE}/quote?symbol=${encodeURIComponent(symbolStr)}&apikey=${STATE.tdApiKey}`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.code && data.code >= 400) throw new Error(data.message || `Error ${data.code}`);
  if (Array.isArray(symbols) && symbols.length > 1) return data;
  return { [symbolStr]: data };
}

// ── FMP (sectors, requires API key) ─────────────────────────────────────────

async function fmpFetch(path) {
  if (!STATE.apiKey) throw new Error("FMP key not configured");
  const sep = path.includes("?") ? "&" : "?";
  const url = `${FMP_BASE}/${path}${sep}apikey=${STATE.apiKey}`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ── Bank of Israel API (שער יציג, no key needed) ────────────────────────────

async function fetchBOI() {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const url = `https://www.boi.org.il/PublicApi/GetExchangeRates?DateFrom=${weekAgo}&DateTo=${today}&Lang=he`;
  const resp = await fetchWithProxy(url);
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { return null; }
  if (!data.exchangeRates || !Array.isArray(data.exchangeRates)) return null;
  return data.exchangeRates;
}

// ── FRED API (macro data, requires free API key) ────────────────────────────

async function fredFetch(seriesId) {
  if (!STATE.fredApiKey) throw new Error("No FRED key");
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${STATE.fredApiKey}&file_type=json&sort_order=desc&limit=1`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  const obs = data.observations?.[0];
  if (!obs || obs.value === ".") return null;
  return { value: parseFloat(obs.value), date: obs.date };
}

async function fetchAllFRED() {
  const results = {};
  const entries = Object.entries(FRED_SERIES);
  // Fetch in batches of 4 to avoid rate limiting
  for (let i = 0; i < entries.length; i += 4) {
    const batch = entries.slice(i, i + 4);
    const batchResults = await Promise.all(
      batch.map(async ([key, series]) => {
        try {
          const r = await fredFetch(series);
          return [key, r];
        } catch(e) { console.warn(`FRED ${key}:`, e.message); return [key, null]; }
      })
    );
    batchResults.forEach(([key, val]) => { if (val) results[key] = val; });
  }
  return results;
}

async function fetchFREDBonds() {
  if (!STATE.fredApiKey) throw new Error("No FRED key");
  const results = {};
  const entries = Object.entries(FRED_BOND_10Y);
  // Fetch in batches of 4 to avoid rate limiting
  for (let i = 0; i < entries.length; i += 4) {
    const batch = entries.slice(i, i + 4);
    const batchResults = await Promise.all(
      batch.map(async ([region, seriesId]) => {
        try {
          const r = await fredFetch(seriesId);
          return [region, r];
        } catch(e) { console.warn(`FRED Bond ${region}:`, e.message); return [region, null]; }
      })
    );
    batchResults.forEach(([region, val]) => {
      if (val) results[region] = { value: val.value, date: val.date };
    });
  }
  return results;
}

// ── World Bank API (macro data, free, no key needed) ────────────────────────

async function fetchWorldBank() {
  const results = {};
  for (const [field, indicator] of Object.entries(WB_INDICATORS)) {
    try {
      const url = `https://api.worldbank.org/v2/country/${WB_COUNTRIES}/indicator/${indicator}?format=json&per_page=60&date=2020:2026`;
      const resp = await fetchWithTimeout(url);
      if (!resp.ok) continue;
      const json = await resp.json();
      const data = json[1]; // World Bank returns [metadata, data]
      if (!Array.isArray(data)) continue;
      // Group by country, pick most recent non-null value
      const byCountry = {};
      data.forEach(d => {
        if (d.value === null) return;
        const code = d.countryiso3code;
        if (!byCountry[code] || parseInt(d.date) > parseInt(byCountry[code].date)) {
          byCountry[code] = { value: d.value, date: d.date };
        }
      });
      // Map to our region codes
      const codeMap = { USA: "US", EUU: "EU", JPN: "JP", CHN: "CN", IND: "IN", ISR: "IL" };
      Object.entries(byCountry).forEach(([iso3, val]) => {
        const region = codeMap[iso3];
        if (!region) return;
        if (!results[region]) results[region] = {};
        results[region][field] = val.value;
        results[region][field + "_year"] = val.date;
      });
    } catch(e) { console.warn(`WB ${field}:`, e.message); }
  }
  return results;
}

// ── Test Connection ─────────────────────────────────────────────────────────

async function testApi() {
  showStatus("בודק חיבור ל-Yahoo Finance...", "success");
  try {
    const q = await yahooQuote("AAPL");
    if (q && q.price) {
      const sign = q.change_pct >= 0 ? "+" : "";
      const proxy = _workingProxy === -2 ? "direct" : _workingProxy >= 0 ? `proxy #${_workingProxy + 1}` : "unknown";
      showStatus(`✓ Yahoo Finance עובד! AAPL = $${q.price.toFixed(2)} (${sign}${q.change_pct.toFixed(2)}%) [${proxy}]`, "success");
      return;
    }
    showStatus("⚠ Yahoo Finance החזיר תשובה ריקה", "error");
  } catch(e) {
    console.warn("Yahoo failed:", e.message);
    if (STATE.tdApiKey) {
      try {
        const data = await tdQuote("AAPL");
        const q = data.AAPL || data;
        if (q && q.close) {
          showStatus(`✓ Twelve Data עובד! AAPL = $${parseFloat(q.close).toFixed(2)} (Yahoo לא זמין)`, "success");
          return;
        }
      } catch(e2) { showStatus(`✕ שני המקורות נכשלו. Yahoo: ${e.message}. TD: ${e2.message}`, "error"); return; }
    }
    showStatus(`✕ Yahoo Finance נכשל: ${e.message}. הוסף Twelve Data key כגיבוי.`, "error");
  }
  // Also test BOI
  try {
    const boi = await fetchBOI();
    if (boi && boi.length > 0) {
      const usd = boi.find(r => r.key === "USD");
      if (usd) console.log(`BOI ✓ USD/ILS = ${usd.currentExchangeRate}`);
    }
  } catch(e) { console.warn("BOI test:", e.message); }
  // Also test FRED
  if (STATE.fredApiKey) {
    try {
      const r = await fredFetch("FEDFUNDS");
      if (r) console.log(`FRED ✓ Fed Funds = ${r.value}%`);
    } catch(e) { console.warn("FRED test:", e.message); }
  }
}

// ── Fetch All Data ──────────────────────────────────────────────────────────

async function fetchAllData() {
  document.getElementById("loadingOverlay").classList.remove("hidden");
  document.getElementById("fetchBtn").disabled = true;
  let successCount = 0;
  const errors = [];

  // Build Yahoo symbol list
  const yahooSymbols = [];
  const yahooMap = {};
  INDICES.forEach(i => { yahooSymbols.push(i.sym); yahooMap[i.sym] = { cat: "indices", key: i.key }; });
  COMMODITIES.forEach(c => { yahooSymbols.push(c.sym); yahooMap[c.sym] = { cat: "commodities", key: c.key }; });
  yahooSymbols.push("^VIX"); yahooMap["^VIX"] = { cat: "fear", key: "vix" };
  yahooSymbols.push("^TNX"); yahooMap["^TNX"] = { cat: "fear", key: "yield_10y_us" };
  STATE.portfolio.forEach(s => {
    const sym = s.symbol.toUpperCase();
    if (!yahooMap[sym]) {
      yahooSymbols.push(sym);
      yahooMap[sym] = { cat: "portfolio", key: s.symbol };
    }
  });

  // 1. Try Yahoo Finance (primary)
  let yahooWorked = false;
  try {
    showStatus(`שולף ${yahooSymbols.length} סימולים מ-Yahoo Finance...`, "success");
    const results = await yahooBatch(yahooSymbols);
    if (results.length > 0) {
      yahooWorked = true;
      const okByCategory = { indices: 0, commodities: 0, fear: 0, portfolio: 0 };
      results.forEach(q => {
        const sym = q.symbol?.toUpperCase();
        const meta = yahooMap[sym];
        if (!meta) return;
        const price = parseFloat(q.price);
        const change = parseFloat(q.change_pct).toFixed(2);
        if (!price) return;
        if (meta.cat === "indices") {
          if (!STATE.indices[meta.key]) STATE.indices[meta.key] = {};
          STATE.indices[meta.key].price = price.toFixed(2);
          STATE.indices[meta.key].ytd = change;
          okByCategory.indices++;
        } else if (meta.cat === "commodities") {
          if (!STATE.commodities[meta.key]) STATE.commodities[meta.key] = {};
          STATE.commodities[meta.key].price = price.toFixed(2);
          STATE.commodities[meta.key].change_pct = change;
          okByCategory.commodities++;
        } else if (meta.cat === "fear") {
          if (!STATE.fear[meta.key]) STATE.fear[meta.key] = {};
          STATE.fear[meta.key].value = price.toFixed(2);
          okByCategory.fear++;
          // Also copy ^TNX (US 10Y yield) to macro
          if (meta.key === "yield_10y_us") {
            if (!STATE.macro.US) STATE.macro.US = {};
            STATE.macro.US.bond_10y = price.toFixed(2);
          }
        } else if (meta.cat === "portfolio") {
          const stock = STATE.portfolio.find(s => s.symbol.toUpperCase() === meta.key.toUpperCase());
          if (stock) {
            stock.currentPrice = price;
            stock.dayChange = change;
            stock.lastFetched = new Date().toISOString();
            okByCategory.portfolio++;
          }
        }
      });
      if (okByCategory.indices > 0) { updateTimestamp("indices"); successCount++; }
      if (okByCategory.commodities > 0) { updateTimestamp("commodities"); successCount++; }
      if (okByCategory.fear > 0) { updateTimestamp("fear"); successCount++; }
      if (okByCategory.portfolio > 0) { updateTimestamp("portfolio"); successCount++; }
      if (okByCategory.indices < INDICES.length) errors.push(`מדדים ${okByCategory.indices}/${INDICES.length}`);
      if (okByCategory.commodities < COMMODITIES.length) errors.push(`סחורות ${okByCategory.commodities}/${COMMODITIES.length}`);
      if (STATE.portfolio.length > 0 && okByCategory.portfolio < STATE.portfolio.length) errors.push(`תיק ${okByCategory.portfolio}/${STATE.portfolio.length}`);
    }
  } catch(e) {
    console.warn("Yahoo fetch failed:", e);
    errors.push("Yahoo: " + e.message);
  }

  // 2. If Yahoo failed and Twelve Data key exists — use TD as fallback
  if (!yahooWorked && STATE.tdApiKey) {
    showStatus("Yahoo נכשל, עובר ל-Twelve Data...", "success");
    try {
      const tdSymbols = [];
      const tdMap = {};
      INDICES.forEach(i => { tdSymbols.push(i.sym); tdMap[i.sym] = { cat: "indices", key: i.key }; });
      COMMODITIES.forEach(c => { tdSymbols.push(c.sym); tdMap[c.sym] = { cat: "commodities", key: c.key }; });
      tdSymbols.push("VIX"); tdMap["VIX"] = { cat: "fear", key: "vix" };
      STATE.portfolio.forEach(s => {
        if (!tdMap[s.symbol]) { tdSymbols.push(s.symbol); tdMap[s.symbol] = { cat: "portfolio", key: s.symbol }; }
      });
      const data = await tdQuote(tdSymbols);
      const okByCategory = { indices: 0, commodities: 0, fear: 0, portfolio: 0 };
      Object.entries(tdMap).forEach(([sym, meta]) => {
        const q = data[sym];
        if (q && q.close && !q.code) {
          const price = parseFloat(q.close);
          const change = parseFloat(q.percent_change || 0).toFixed(2);
          if (meta.cat === "indices") {
            if (!STATE.indices[meta.key]) STATE.indices[meta.key] = {};
            STATE.indices[meta.key].price = price.toFixed(2);
            STATE.indices[meta.key].ytd = change;
            okByCategory.indices++;
          } else if (meta.cat === "commodities") {
            if (!STATE.commodities[meta.key]) STATE.commodities[meta.key] = {};
            STATE.commodities[meta.key].price = price.toFixed(2);
            STATE.commodities[meta.key].change_pct = change;
            okByCategory.commodities++;
          } else if (meta.cat === "fear") {
            if (!STATE.fear.vix) STATE.fear.vix = {};
            STATE.fear.vix.value = price.toFixed(2);
            okByCategory.fear++;
          } else if (meta.cat === "portfolio") {
            const stock = STATE.portfolio.find(s => s.symbol === sym);
            if (stock) {
              stock.currentPrice = price;
              stock.dayChange = change;
              stock.lastFetched = new Date().toISOString();
              okByCategory.portfolio++;
            }
          }
        }
      });
      if (okByCategory.indices > 0) { updateTimestamp("indices"); successCount++; }
      if (okByCategory.commodities > 0) { updateTimestamp("commodities"); successCount++; }
      if (okByCategory.fear > 0) { updateTimestamp("fear"); successCount++; }
      if (okByCategory.portfolio > 0) { updateTimestamp("portfolio"); successCount++; }
    } catch(e) { errors.push("TD: " + e.message); }
  }

  // 3. FOREX via Yahoo Finance (supports all pairs including ILS, CNY)
  try {
    showStatus("שולף שערי מטבעות מ-Yahoo Finance...", "success");
    const fxSymbols = CURRENCIES.map(c => c.yahoo);
    const fxResults = await yahooBatch(fxSymbols);
    let fxOk = 0;
    fxResults.forEach(q => {
      const curr = CURRENCIES.find(c => c.yahoo === q.symbol);
      if (!curr) return;
      if (!STATE.currencies[curr.key]) STATE.currencies[curr.key] = {};
      STATE.currencies[curr.key].rate = q.price.toFixed(4);
      STATE.currencies[curr.key].change_pct = q.change_pct.toFixed(2);
      fxOk++;
    });
    if (fxOk > 0) { updateTimestamp("currencies"); successCount++; }
    else errors.push("מט״ח: Yahoo");
  } catch(e) { errors.push("מט״ח: " + e.message); }

  // 4. SECTORS via Yahoo Finance sector ETFs (free, no key needed)
  try {
    showStatus("שולף ביצועי סקטורים מ-Yahoo Finance...", "success");
    const sectorSymbols = Object.values(SECTOR_ETFS);
    const sectorResults = await yahooBatch(sectorSymbols);
    let secOk = 0;
    Object.entries(SECTOR_ETFS).forEach(([sectorName, etfSym]) => {
      const q = sectorResults.find(r => r.symbol === etfSym);
      if (!q) return;
      if (!STATE.sectors[sectorName]) STATE.sectors[sectorName] = {};
      STATE.sectors[sectorName].ytd = q.change_pct.toFixed(2);
      STATE.sectors[sectorName].price = q.price.toFixed(2);
      secOk++;
    });
    if (secOk > 0) { updateTimestamp("sectors"); successCount++; }
    else errors.push("סקטורים: Yahoo");
  } catch(e) { errors.push("סקטורים: " + e.message); }

  // 4b. SECTORS extra data via FMP (optional, if API key exists)
  if (STATE.apiKey) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      let sectors;
      try { sectors = await fmpFetch(`sector-performance-snapshot?date=${today}`); }
      catch(e) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        sectors = await fmpFetch(`sector-performance-snapshot?date=${y.toISOString().slice(0,10)}`);
      }
      if (Array.isArray(sectors)) {
        sectors.forEach(s => {
          const name = s.sector;
          if (!STATE.sectors[name]) STATE.sectors[name] = {};
          if (s.averageChange) STATE.sectors[name].ytd = parseFloat(s.averageChange).toFixed(2);
        });
      }
    } catch(e) { console.warn("FMP Sectors:", e.message); }
  }

  // 5. BOI — Bank of Israel representative exchange rates (שער יציג)
  try {
    showStatus("שולף שערי יציג מבנק ישראל...", "success");
    const boiRates = await fetchBOI();
    if (boiRates && boiRates.length > 0) {
      let boiOk = 0;
      const boiMap = { USD: "USD/ILS", EUR: "EUR/ILS", GBP: "GBP/ILS", JPY: "JPY/ILS" };
      boiRates.forEach(r => {
        const pair = boiMap[r.key];
        if (pair) {
          if (!STATE.currencies[pair]) STATE.currencies[pair] = {};
          const rate = r.unit > 1 ? (r.currentExchangeRate / r.unit) : r.currentExchangeRate;
          STATE.currencies[pair].rate = rate.toFixed(4);
          STATE.currencies[pair].change_pct = parseFloat(r.currentChange || 0).toFixed(2);
          STATE.currencies[pair].source = "בנק ישראל";
          boiOk++;
        }
      });
      // Overwrite USD/ILS and EUR/ILS with official BOI rate
      const usd = boiRates.find(r => r.key === "USD");
      if (usd) {
        if (!STATE.currencies["USD/ILS"]) STATE.currencies["USD/ILS"] = {};
        STATE.currencies["USD/ILS"].rate = usd.currentExchangeRate.toFixed(4);
        STATE.currencies["USD/ILS"].change_pct = parseFloat(usd.currentChange || 0).toFixed(2);
        STATE.currencies["USD/ILS"].source = "שער יציג";
      }
      const eur = boiRates.find(r => r.key === "EUR");
      if (eur) {
        if (!STATE.currencies["EUR/ILS"]) STATE.currencies["EUR/ILS"] = {};
        STATE.currencies["EUR/ILS"].rate = eur.currentExchangeRate.toFixed(4);
        STATE.currencies["EUR/ILS"].change_pct = parseFloat(eur.currentChange || 0).toFixed(2);
        STATE.currencies["EUR/ILS"].source = "שער יציג";
      }
      if (boiOk > 0) { updateTimestamp("currencies"); if (!successCount) successCount++; }
    }
  } catch(e) { console.warn("BOI:", e.message); }

  // 6. World Bank — Macro data: GDP, inflation, unemployment (free, no key)
  try {
    showStatus("שולף נתוני מאקרו מ-World Bank...", "success");
    const wb = await fetchWorldBank();
    let wbOk = 0;
    Object.entries(wb).forEach(([region, data]) => {
      if (!STATE.macro[region]) STATE.macro[region] = {};
      if (data.gdp_growth !== undefined) { STATE.macro[region].gdp_growth = data.gdp_growth.toFixed(2); wbOk++; }
      if (data.inflation !== undefined) { STATE.macro[region].inflation = data.inflation.toFixed(2); wbOk++; }
      if (data.unemployment !== undefined) { STATE.macro[region].unemployment = data.unemployment.toFixed(2); wbOk++; }
    });
    if (wbOk > 0) { updateTimestamp("macro"); successCount++; }
    else errors.push("מאקרו: World Bank");
  } catch(e) { errors.push("World Bank: " + e.message); }

  // 7. FRED — Macro data override with more current data (optional, needs key)
  if (STATE.fredApiKey) {
    try {
      showStatus("שולף נתוני מאקרו מ-FRED...", "success");
      const fred = await fetchAllFRED();
      let macroOk = 0;
      // Map FRED results to STATE.macro
      const mapping = [
        ["US_interest", "US", "interest_rate"],
        ["US_unemployment", "US", "unemployment"],
        ["IL_interest", "IL", "interest_rate"],
        ["EU_interest", "EU", "interest_rate"],
        ["EU_unemployment", "EU", "unemployment"],
        ["JP_interest", "JP", "interest_rate"],
        ["JP_unemployment", "JP", "unemployment"],
        ["CN_interest", "CN", "interest_rate"],
      ];
      mapping.forEach(([fredKey, region, field]) => {
        if (fred[fredKey]) {
          if (!STATE.macro[region]) STATE.macro[region] = {};
          STATE.macro[region][field] = fred[fredKey].value.toFixed(2);
          macroOk++;
        }
      });
      // Inflation from FRED is index-based (CPI), need YoY calculation
      // For CPI series, the value is already YoY % for some series
      const inflationMapping = [
        ["US_inflation", "US"],
        ["IL_inflation", "IL"],
        ["EU_inflation", "EU"],
        ["JP_inflation", "JP"],
        ["CN_inflation", "CN"],
      ];
      inflationMapping.forEach(([fredKey, region]) => {
        if (fred[fredKey]) {
          if (!STATE.macro[region]) STATE.macro[region] = {};
          STATE.macro[region].inflation = fred[fredKey].value.toFixed(2);
          macroOk++;
        }
      });
      if (macroOk > 0) { updateTimestamp("macro"); successCount++; }
    } catch(e) { errors.push("FRED: " + e.message); }
  }

  // 8. FRED — 10Y Bond yields (optional, needs key)
  if (STATE.fredApiKey) {
    try {
      showStatus("שולף תשואות אג״ח 10Y מ-FRED...", "success");
      const bonds = await fetchFREDBonds();
      let bondOk = 0;
      Object.entries(bonds).forEach(([region, data]) => {
        if (!STATE.macro[region]) STATE.macro[region] = {};
        STATE.macro[region].bond_10y = data.value.toFixed(2);
        bondOk++;
      });
      if (bondOk > 0) { updateTimestamp("macro"); }
    } catch(e) { console.warn("FRED Bonds:", e.message); }
  }

  saveState();
  renderAll();

  document.getElementById("loadingOverlay").classList.add("hidden");
  document.getElementById("fetchBtn").disabled = false;

  const proxyLabel = _workingProxy === -2 ? "direct" : _workingProxy >= 0 ? `proxy #${_workingProxy + 1}` : "";
  if (successCount === 0) {
    showStatus(`✕ נכשל: ${errors.join(" | ")}`, "error");
  } else if (errors.length === 0) {
    showStatus(`✓ ${successCount} קטגוריות עודכנו בהצלחה ${proxyLabel ? `[${proxyLabel}]` : ""}`, "success");
  } else {
    showStatus(`✓ עודכנו ${successCount}. חסרים: ${errors.join(", ")}`, "success");
  }
  console.log("Fetch result:", { success: successCount, errors, yahooWorked, proxy: _workingProxy });
}

// ═══════════════════════════════════════════════════════════════════════════════
// STOCK SCANNER — Lookup any stock by symbol
// ═══════════════════════════════════════════════════════════════════════════════

async function scanStock() {
  const input = document.getElementById("scannerSymbol");
  const resultDiv = document.getElementById("scannerResult");
  const sym = input.value.trim().toUpperCase();
  if (!sym) return;

  resultDiv.innerHTML = `<div style="color:var(--text-dim);padding:20px;text-align:center">מחפש ${sym}...</div>`;

  let q = null;
  let source = "";

  // Try Yahoo Finance first
  try {
    q = await yahooQuote(sym);
    if (q && q.price) source = "Yahoo Finance";
  } catch(e) { console.warn("Yahoo scanner:", e); }

  // Fallback to Twelve Data
  if (!q && STATE.tdApiKey) {
    try {
      const data = await tdQuote(sym);
      const tq = data[sym] || data;
      if (tq && tq.close) {
        q = {
          price: parseFloat(tq.close),
          open: parseFloat(tq.open),
          high: parseFloat(tq.high),
          low: parseFloat(tq.low),
          volume: parseFloat(tq.volume),
          change_pct: parseFloat(tq.percent_change || 0),
          name: tq.name || "",
          date: tq.datetime || ""
        };
        source = "Twelve Data";
      }
    } catch(e) { console.warn("TD scanner:", e); }
  }

  if (!q || !q.price) {
    resultDiv.innerHTML = `<div style="color:var(--red);padding:20px;text-align:center">לא נמצא מידע על ${sym}. נסה סימבול אחר.</div>`;
    return;
  }

  const changeClass = q.change_pct >= 0 ? "positive" : "negative";
  const sign = q.change_pct >= 0 ? "+" : "";

  resultDiv.innerHTML = `
    <div class="scanner-card">
      <div class="scanner-header">
        <div>
          <div class="scanner-symbol">${sym}</div>
          ${q.name ? `<div class="scanner-name">${q.name}</div>` : ""}
          <div style="font-size:11px;color:var(--text-faint);margin-top:4px">מקור: ${source}</div>
        </div>
        <div class="scanner-price-block">
          <div class="scanner-price">$${q.price.toFixed(2)}</div>
          <div class="scanner-change ${changeClass}">${sign}${q.change_pct.toFixed(2)}%</div>
        </div>
      </div>
      <div class="scanner-grid">
        <div class="scanner-item"><span class="scanner-label">פתיחה:</span> <span>$${q.open?.toFixed(2) || "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">גבוה:</span> <span>$${q.high?.toFixed(2) || "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">נמוך:</span> <span>$${q.low?.toFixed(2) || "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">מחזור:</span> <span>${q.volume?.toLocaleString() || "—"}</span></div>
      </div>
      <div class="scanner-actions">
        <button class="btn btn-success btn-small" onclick="addFromScanner('${sym}', '${(q.name || "").replace(/'/g, "")}')">+ הוסף לתיק</button>
        <a href="https://finance.yahoo.com/quote/${sym}" target="_blank" class="btn btn-outline">📊 Yahoo Finance</a>
        <a href="https://www.google.com/finance/quote/${sym}:NASDAQ" target="_blank" class="btn btn-outline">🔎 Google Finance</a>
        <a href="https://seekingalpha.com/symbol/${sym}" target="_blank" class="btn btn-outline">🔬 Seeking Alpha</a>
      </div>
    </div>
  `;
}

function addFromScanner(sym, name) {
  document.getElementById("pf-symbol").value = sym;
  document.getElementById("pf-name").value = name;
  switchTab("portfolio");
  setTimeout(() => document.getElementById("pf-shares").focus(), 100);
}
