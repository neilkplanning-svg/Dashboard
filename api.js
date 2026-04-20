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
    date: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10) : "",
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || null,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow || null,
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
      const url = `https://api.worldbank.org/v2/country/${WB_COUNTRIES}/indicator/${indicator}?format=json&per_page=100&date=2018:2026`;
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
      const codeMap = WB_COUNTRY_MAP;
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

// ── Yahoo Finance Historical Data ──────────────────────────────────────────

async function yahooHistorical(symbol, range = "10y") {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=${range}`;
  const resp = await fetchWithProxy(url);
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch(e) { return null; }
  const result = json.chart?.result?.[0];
  if (!result) return null;
  const quotes = result.indicators?.quote?.[0];
  if (!quotes || !quotes.high) return null;
  const highs = quotes.high.filter(v => v !== null);
  const lows = quotes.low.filter(v => v !== null);
  const closes = quotes.close.filter(v => v !== null);
  return {
    high_10y: Math.max(...highs),
    low_10y: Math.min(...lows),
    first_close: closes[0] || null,  // price at start of range
    last_close: closes[closes.length - 1] || null,
  };
}

async function yahooYTDChange(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=ytd`;
  const resp = await fetchWithProxy(url);
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch(e) { return null; }
  const result = json.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta;
  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose || price;
  const closes = result.indicators?.quote?.[0]?.close?.filter(v => v !== null);
  const startPrice = closes?.[0] || prevClose;
  return startPrice ? ((price - startPrice) / startPrice * 100) : 0;
}

async function yahoo12MChange(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
  const resp = await fetchWithProxy(url);
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch(e) { return null; }
  const result = json.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta;
  const price = meta.regularMarketPrice;
  const closes = result.indicators?.quote?.[0]?.close?.filter(v => v !== null);
  const startPrice = closes?.[0] || price;
  return startPrice ? ((price - startPrice) / startPrice * 100) : 0;
}

// ── Yahoo Finance v7 quote — simpler, more reliable for P/E through proxies ──

async function yahooQuoteV7(symbol) {
  // v7 quote endpoint — no crumb needed for most proxies, lots of fields
  try {
    const fields = "trailingPE,forwardPE,marketCap,priceToBook,epsTrailingTwelveMonths,beta,trailingAnnualDividendYield,dividendYield,longName,shortName,regularMarketPrice";
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&fields=${fields}`;
    const resp = await fetchWithProxy(url, 12000);
    const text = await resp.text();
    const json = JSON.parse(text);
    const r = json.quoteResponse?.result?.[0];
    if (!r) return null;
    const dy = r.dividendYield ?? r.trailingAnnualDividendYield;
    return {
      pe:        r.trailingPE ?? null,
      forwardPE: r.forwardPE ?? null,
      eps:       r.epsTrailingTwelveMonths ?? null,
      marketCap: r.marketCap ?? null,
      beta:      r.beta ?? null,
      pb:        r.priceToBook ?? null,
      debtEquity: null, // not in v7
      divYield:  dy != null ? (dy * 100).toFixed(2) + "%" : null,
      name:      r.longName || r.shortName || null,
    };
  } catch(e) { return null; }
}

// ── Yahoo Finance v10 quoteSummary — richer but often 401 without crumb ─────

async function yahooQuoteSummary(symbol) {
  // Returns trailingPE, forwardPE, marketCap, beta, eps, priceToBook, debtToEquity
  try {
    const mods = "summaryDetail,defaultKeyStatistics,financialData";
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${mods}`;
    const resp = await fetchWithProxy(url, 12000);
    const text = await resp.text();
    const json = JSON.parse(text);
    const r = json.quoteSummary?.result?.[0];
    if (!r) return null;
    const sd = r.summaryDetail || {};
    const ks = r.defaultKeyStatistics || {};
    const fd = r.financialData || {};
    const raw = obj => obj?.raw ?? null;
    return {
      pe:        raw(sd.trailingPE)  || raw(ks.trailingPE)  || null,
      forwardPE: raw(sd.forwardPE)   || raw(ks.forwardPE)   || null,
      eps:       raw(ks.trailingEps) || null,
      marketCap: raw(sd.marketCap)   || null,
      beta:      raw(sd.beta)        || raw(ks.beta)        || null,
      pb:        raw(ks.priceToBook) || null,
      debtEquity: raw(fd.debtToEquity) || null,
      divYield:  raw(sd.dividendYield) != null ? (raw(sd.dividendYield) * 100).toFixed(2) + "%" : null,
      evEbitda:  raw(ks.enterpriseToEbitda) || null,
      evRevenue: raw(ks.enterpriseToRevenue) || null,
      enterpriseValue: raw(ks.enterpriseValue) || null,
      profitMargin: raw(fd.profitMargins) || null,
      operatingMargin: raw(fd.operatingMargins) || null,
      roe:       raw(fd.returnOnEquity) != null ? (raw(fd.returnOnEquity) * 100).toFixed(2) + "%" : null,
      roa:       raw(fd.returnOnAssets) != null ? (raw(fd.returnOnAssets) * 100).toFixed(2) + "%" : null,
    };
  } catch(e) { return null; }
}

// Smart combiner: v7 first (reliable), v10 to fill gaps (debtEquity etc.)
async function yahooMetrics(symbol) {
  const v7 = await yahooQuoteV7(symbol);
  // If v7 gave PE we're mostly good — still try v10 for debtEquity if missing
  if (v7 && v7.pe) {
    if (!v7.debtEquity) {
      const v10 = await yahooQuoteSummary(symbol).catch(() => null);
      if (v10) {
        v7.debtEquity = v10.debtEquity;
        v7.pb = v7.pb || v10.pb;
      }
    }
    return v7;
  }
  // v7 failed entirely — try v10
  const v10 = await yahooQuoteSummary(symbol).catch(() => null);
  return v10 || v7 || null;
}

// ── Stock Analysis JSON API (free, no API key, CORS-friendly) ─────────────

async function fetchSAOverview(type, symbol) {
  // type: "e" for ETF, "s" for stock
  const url = `${STOCK_ANALYSIS_BASE}/api/symbol/${type}/${symbol.toLowerCase()}/overview`;
  const resp = await fetchWithProxy(url, 15000);
  const text = await resp.text();
  try { return JSON.parse(text); } catch(e) { return null; }
}

async function fetchETFMetrics(symbol) {
  // Try Yahoo and SA in parallel and merge — Yahoo wins for trailing PE,
  // SA fills forwardPE / pb gaps when Yahoo doesn't expose them for the ETF.
  const saNum = v => v == null ? null : parseFloat(String(v).replace(/[^0-9.-]/g, "")) || null;
  const [ys, saRaw] = await Promise.all([
    yahooMetrics(symbol).catch(() => null),
    fetchSAOverview("e", symbol).catch(() => null),
  ]);
  const d = saRaw?.data || saRaw || {};
  const sa = {
    pe:         saNum(d.peRatio) || saNum(d.pe) || saNum(d.priceEarnings) || saNum(d.trailingPE) || null,
    forwardPE:  saNum(d.forwardPE) || saNum(d.forwardPeRatio) || null,
    divYield:   d.dividendYield || d.divYield || null,
    beta:       saNum(d.beta) || null,
    pb:         saNum(d.pb) || saNum(d.priceToBook) || null,
  };
  return {
    pe:        ys?.pe        || sa.pe,
    forwardPE: ys?.forwardPE || sa.forwardPE,
    beta:      ys?.beta      || sa.beta,
    divYield:  ys?.divYield  || sa.divYield,
    pb:        ys?.pb        || sa.pb,
  };
}

async function fetchStockDetails(symbol) {
  // Primary: Yahoo v7 + v10 combined
  let yData = {};
  try {
    const ys = await yahooMetrics(symbol);
    if (ys) yData = ys;
  } catch(e) {}

  // Secondary: stockanalysis.com (lenient field-name matching)
  let saData = {};
  try {
    const data = await fetchSAOverview("s", symbol);
    const d = data?.data || data;
    if (d && typeof d === "object") {
      const saNum = v => v == null ? null : parseFloat(String(v).replace(/[^0-9.-]/g, "")) || null;
      saData = {
        pe:          saNum(d.peRatio) || saNum(d.pe) || saNum(d.trailingPE) || null,
        forwardPE:   saNum(d.forwardPE) || saNum(d.forwardPeRatio) || null,
        eps:         saNum(d.eps) || saNum(d.epsTrailing) || null,
        marketCap:   d.marketCap || d.marketCapFormatted || null,
        beta:        saNum(d.beta) || null,
        pb:          saNum(d.pb) || saNum(d.priceToBook) || saNum(d.pbRatio) || null,
        debtEquity:  saNum(d.debtEquity) || saNum(d.debtToEquity) || saNum(d.deRatio) || null,
        divYield:    d.dividendYield || d.divYield || null,
        revenue:     d.revenue || null,
        sharesOut:   d.sharesOutstanding || d.shares || null,
        evEbitda:    saNum(d.evEbitda) || saNum(d.enterpriseToEbitda) || saNum(d.evToEbitda) || null,
        evRevenue:   saNum(d.evRevenue) || saNum(d.enterpriseToRevenue) || null,
        enterpriseValue: d.enterpriseValue || null,
        analystRating: d.analystRating || d.analystConsensus || d.consensus || null,
        priceTarget: saNum(d.analystTarget) || saNum(d.priceTarget) || null,
        analystCount: d.analystCount ? parseInt(d.analystCount) : null,
        strongBuy:   d.strongBuy ? parseInt(d.strongBuy) : null,
        buy:         d.buy ? parseInt(d.buy) : null,
        hold:        d.hold ? parseInt(d.hold) : null,
        sell:        d.sell ? parseInt(d.sell) : null,
        strongSell:  d.strongSell ? parseInt(d.strongSell) : null,
      };
    }
  } catch(e) {}

  // Merge: SA wins for analyst/text fields, Yahoo wins for numeric PE (more reliable)
  return {
    ...saData,
    pe:         yData.pe        || saData.pe        || null,
    forwardPE:  yData.forwardPE || saData.forwardPE || null,
    eps:        yData.eps       || saData.eps       || null,
    beta:       yData.beta      || saData.beta      || null,
    pb:         yData.pb        || saData.pb        || null,
    debtEquity: yData.debtEquity|| saData.debtEquity|| null,
    divYield:   yData.divYield  || saData.divYield  || null,
    marketCap:  saData.marketCap || (yData.marketCap ? fmtMarketCap(yData.marketCap) : null),
    evEbitda:   yData.evEbitda  || saData.evEbitda  || null,
    evRevenue:  yData.evRevenue || saData.evRevenue || null,
    enterpriseValue: saData.enterpriseValue || (yData.enterpriseValue ? fmtMarketCap(yData.enterpriseValue) : null),
    roe:        yData.roe       || saData.roe       || null,
    roa:        yData.roa       || saData.roa       || null,
    profitMargin:    yData.profitMargin    || saData.profitMargin    || null,
    operatingMargin: yData.operatingMargin || saData.operatingMargin || null,
  };
}

function fmtMarketCap(val) {
  if (!val || isNaN(val)) return null;
  if (val >= 1e12) return (val / 1e12).toFixed(2) + "T";
  if (val >= 1e9)  return (val / 1e9).toFixed(2) + "B";
  if (val >= 1e6)  return (val / 1e6).toFixed(2) + "M";
  return val.toString();
}

// Kept for compatibility — now delegates to fetchStockDetails
async function fetchStockForecast(symbol) {
  return fetchStockDetails(symbol);
}

// Fetch historical annual financials (revenue + net income) for 5–8 years
// Primary: stockanalysis.com JSON API. Fallback: HTML scrape of financials page.
// Returns { years: ["2024","2023",...], revenue: [...], netIncome: [...] } or null.
async function fetchStockFinancials(symbol) {
  if (symbol.includes('.TA')) return null; // stockanalysis.com doesn't cover TASE
  const sym = symbol.toLowerCase();

  // Try the JSON API first (lightweight, preferred)
  try {
    const url = `${STOCK_ANALYSIS_BASE}/api/symbol/s/${sym}/financials?p=annual`;
    const resp = await fetchWithProxy(url, 15000);
    const text = await resp.text();
    const json = JSON.parse(text);
    const d = json?.data || json;
    // d may have a "data" object with revenue/netIncome arrays or rows — handle both
    const rows = d?.rows || d?.financials || d?.data || d;
    if (rows && typeof rows === "object") {
      // Try two possible shapes
      let years = null, revenue = null, netIncome = null;
      if (Array.isArray(rows.revenue)) { revenue = rows.revenue; }
      if (Array.isArray(rows.netIncome)) { netIncome = rows.netIncome; }
      if (Array.isArray(d.year)) { years = d.year.map(String); }
      else if (Array.isArray(rows.year)) { years = rows.year.map(String); }
      else if (Array.isArray(d.period)) { years = d.period.map(String); }
      if (years && revenue && netIncome) {
        return { years: years.slice(0, 8), revenue: revenue.slice(0, 8), netIncome: netIncome.slice(0, 8), source: "stockanalysis.com" };
      }
      // Alternate: rows is an array of {year, revenue, netIncome} objects
      if (Array.isArray(rows)) {
        const y = [], r = [], n = [];
        rows.slice(0, 8).forEach(row => {
          y.push(String(row.year || row.period || row.date || ""));
          r.push(row.revenue ?? row.Revenue ?? null);
          n.push(row.netIncome ?? row.NetIncome ?? row["Net Income"] ?? null);
        });
        if (y.some(Boolean) && r.some(v => v != null)) {
          return { years: y, revenue: r, netIncome: n, source: "stockanalysis.com" };
        }
      }
    }
  } catch(e) { /* fall through to scrape */ }

  // HTML-scrape fallback: parse the public financials page
  try {
    const url = `${STOCK_ANALYSIS_BASE}/stocks/${sym}/financials/`;
    const resp = await fetchWithProxy(url, 15000);
    const text = await resp.text();

    // Extract header row of years: <thead>…<th>FY 2024</th>…</thead>
    const theadMatch = text.match(/<thead[\s\S]*?<\/thead>/i);
    let years = [];
    if (theadMatch) {
      const yrs = [...theadMatch[0].matchAll(/(?:FY\s*)?(\d{4})(?:<|\s)/g)].map(m => m[1]);
      years = [...new Set(yrs)].slice(0, 8);
    }

    const extractRow = (label) => {
      // Find the tr containing the label and grab subsequent numeric cells
      const re = new RegExp(
        `<tr[^>]*>\\s*<td[^>]*>[^<]*<(?:span|a|b|strong)?[^>]*>\\s*${label}[^<]*<[\\s\\S]*?<\\/tr>`,
        'i'
      );
      const m = text.match(re);
      if (!m) return [];
      // Collect each <td> text content
      const tds = [...m[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => x[1].replace(/<[^>]+>/g, "").trim());
      // Drop first td (label itself) and any trailing non-numeric tail cells
      return tds.slice(1).map(v => {
        const cleaned = v.replace(/[^0-9.\-]/g, "");
        const n = parseFloat(cleaned);
        return isNaN(n) ? null : n;
      });
    };

    const revenue = extractRow("Revenue");
    const netIncome = extractRow("Net Income");
    if (years.length && revenue.length) {
      return { years, revenue: revenue.slice(0, years.length), netIncome: netIncome.slice(0, years.length), source: "stockanalysis.com (scrape)" };
    }
  } catch(e) { /* give up */ }

  return null;
}

async function fetchStockCashFlow(symbol) {
  // Cash flow details aren't in the overview API, try HTML scrape as fallback
  try {
    const url = `${STOCK_ANALYSIS_BASE}/stocks/${symbol.toLowerCase()}/financials/cash-flow-statement/`;
    const resp = await fetchWithProxy(url, 15000);
    const text = await resp.text();
    const extract = (pat) => { const m = text.match(pat); return m ? m[1].trim() : null; };
    return {
      buybackTTM: extract(/(?:Share Repurchase|Buyback)[^<]*<[^>]*>([^<]+)/i),
      sbcTTM: extract(/Stock.Based Compensation[^<]*<[^>]*>([^<]+)/i),
      dividendsPaid: extract(/Dividends Paid[^<]*<[^>]*>([^<]+)/i),
    };
  } catch(e) { return {}; }
}

// ── Finviz fallback for US stocks (snapshot table scrape) ──────────────
async function fetchFinvizData(symbol) {
  // Finviz only carries US-listed tickers
  if (symbol.includes('.TA')) return {};
  try {
    const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}`;
    const resp = await fetchWithProxy(url, 15000);
    const text = await resp.text();
    const out = {};
    // Finviz field label → our key
    const fieldMap = {
      "P/E":          "pe",
      "Forward P/E":  "forwardPE",
      "EPS (ttm)":    "eps",
      "P/B":          "pb",
      "Beta":         "beta",
      "Debt/Eq":      "debtEquity",
      "Dividend TTM": "divYield",
      "Dividend %":   "divYield",
      "Market Cap":   "marketCap",
      "Target Price": "priceTarget",
      "Recom":        "analystRating",
      "Sales":        "revenue",
      "Shs Outstand": "sharesOut",
      "ROE":          "roe",
      "ROA":          "roa",
      "Profit Margin":"profitMargin",
    };
    const numericKeys = new Set(["pe","forwardPE","pb","beta","debtEquity","priceTarget","eps","roe","roa","profitMargin"]);
    const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    Object.entries(fieldMap).forEach(([label, key]) => {
      // Pattern: <td ...>LABEL</td><td ...><b>VALUE</b></td> (or value without <b>)
      const re = new RegExp(
        `<td[^>]*>\\s*${escapeRe(label)}\\s*</td>\\s*<td[^>]*>(?:\\s*<[^>]+>\\s*)*([^<]+)`,
        'i'
      );
      const m = text.match(re);
      if (!m) return;
      const raw = m[1].trim();
      if (raw === "-" || raw === "—" || raw === "") return;
      if (numericKeys.has(key)) {
        const num = parseFloat(raw.replace(/[^0-9.\-]/g, ""));
        if (!isNaN(num)) out[key] = num;
      } else {
        out[key] = raw;
      }
    });
    return out;
  } catch(e) { console.warn("Finviz:", e.message); return {}; }
}

// ── Bizportal fallback for Israeli stocks (.TA) ─────────────────────────

async function fetchBizportalData(symbol) {
  // Strip .TA suffix for Bizportal
  const cleanSym = symbol.replace('.TA', '');
  try {
    const url = `https://www.bizportal.co.il/capitalmarket/quote/generalview/${cleanSym}`;
    const resp = await fetchWithProxy(url, 15000);
    const text = await resp.text();
    const result = {};
    // Try to extract P/E ratio
    const peMatch = text.match(/מכפיל רווח[^<]*<[^>]*>[^<]*<[^>]*>([0-9.,]+)/i) ||
                    text.match(/P\/E[^<]*<[^>]*>[^<]*<[^>]*>([0-9.,]+)/i);
    if (peMatch) result.pe = parseFloat(peMatch[1].replace(',', ''));
    // P/B ratio
    const pbMatch = text.match(/מכפיל הון[^<]*<[^>]*>[^<]*<[^>]*>([0-9.,]+)/i) ||
                    text.match(/P\/B[^<]*<[^>]*>[^<]*<[^>]*>([0-9.,]+)/i);
    if (pbMatch) result.pb = parseFloat(pbMatch[1].replace(',', ''));
    // Market cap
    const mcMatch = text.match(/שווי שוק[^<]*<[^>]*>[^<]*<[^>]*>([0-9.,]+)/i);
    if (mcMatch) result.marketCap = mcMatch[1];
    // Dividend yield
    const divMatch = text.match(/תשואת דיבידנד[^<]*<[^>]*>[^<]*<[^>]*>([0-9.,]+%?)/i);
    if (divMatch) result.divYield = divMatch[1];
    // Debt/equity
    const deMatch = text.match(/הון למאזן[^<]*<[^>]*>[^<]*<[^>]*>([0-9.,]+)/i);
    if (deMatch) result.debtEquity = parseFloat(deMatch[1].replace(',', ''));
    return result;
  } catch(e) { console.warn("Bizportal:", e.message); return {}; }
}

// ── Macro data from Trading Economics (scrape) ────────────────────────────

async function fetchMacroScrape() {
  try {
    const url = "https://tradingeconomics.com/matrix";
    const resp = await fetchWithProxy(url, 15000);
    const text = await resp.text();
    const results = {};
    const countries = {
      'united-states': 'US', 'euro-area': 'EU', 'japan': 'JP',
      'china': 'CN', 'india': 'IN', 'israel': 'IL'
    };
    for (const [slug, code] of Object.entries(countries)) {
      if (!results[code]) results[code] = {};
      const irMatch = text.match(new RegExp(slug + '[\\s\\S]{0,500}?interest[\\s\\S]{0,200}?([0-9]+\\.?[0-9]*)', 'i'));
      if (irMatch) results[code].interest_rate = parseFloat(irMatch[1]);
      const infMatch = text.match(new RegExp(slug + '[\\s\\S]{0,500}?inflation[\\s\\S]{0,200}?([0-9]+\\.?[0-9]*)', 'i'));
      if (infMatch) results[code].inflation = parseFloat(infMatch[1]);
      const unMatch = text.match(new RegExp(slug + '[\\s\\S]{0,500}?unemployment[\\s\\S]{0,200}?([0-9]+\\.?[0-9]*)', 'i'));
      if (unMatch) results[code].unemployment = parseFloat(unMatch[1]);
    }
    return results;
  } catch(e) { console.warn("Macro scrape:", e.message); return {}; }
}

// ── Macro from individual Trading Economics pages (more reliable) ─────────

async function fetchMacroTE() {
  const results = {};
  const pages = [
    { url: "https://tradingeconomics.com/country-list/interest-rate", field: "interest_rate" },
    { url: "https://tradingeconomics.com/country-list/inflation-rate", field: "inflation" },
    { url: "https://tradingeconomics.com/country-list/unemployment-rate", field: "unemployment" },
    { url: "https://tradingeconomics.com/country-list/government-bond-10y", field: "bond_10y" },
    { url: "https://tradingeconomics.com/country-list/government-debt-to-gdp", field: "debt_to_gdp" },
  ];
  const countryNames = {
    'United States': 'US', 'United Kingdom': 'GB', 'Germany': 'DE', 'France': 'FR',
    'Japan': 'JP', 'China': 'CN', 'India': 'IN', 'Israel': 'IL',
    'Brazil': 'BR', 'South Korea': 'KR', 'Mexico': 'MX', 'Turkey': 'TR',
    'Euro Area': 'EU',
  };
  for (const page of pages) {
    try {
      const resp = await fetchWithProxy(page.url, 12000);
      const text = await resp.text();
      for (const [name, code] of Object.entries(countryNames)) {
        if (!results[code]) results[code] = {};
        // Pattern: country name followed by a number in a table cell. Allow negative values.
        const pat = new RegExp(name + '[\\s\\S]{0,300}?<td[^>]*>\\s*(-?[0-9]+\\.?[0-9]*)\\s*<', 'i');
        const m = text.match(pat);
        if (m && results[code][page.field] == null) {
          results[code][page.field] = parseFloat(m[1]);
        }
      }
    } catch(e) { console.warn(`TE ${page.field}:`, e.message); }
  }
  return results;
}

// ── CNN Fear & Greed (free, no key) ──────────────────────────────────────
async function fetchCNNFearGreed() {
  try {
    const url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
    const resp = await fetchWithProxy(url, 12000);
    const text = await resp.text();
    const json = JSON.parse(text);
    const score = json?.fear_and_greed?.score;
    if (score == null) return null;
    return (Math.round(score * 10) / 10).toString();
  } catch(e) { console.warn("CNN F&G:", e.message); return null; }
}

// ── Extended fear indicators via FRED (requires fredApiKey) ──────────────
async function fetchExtendedFearFRED() {
  const out = {};
  if (!STATE.fredApiKey) return out;
  // HY credit spread (BAML US High Yield Master II OAS) — daily, %
  try {
    const cs = await fredFetch("BAMLH0A0HYM2");
    if (cs) out.credit_spread = cs.value.toFixed(2);
  } catch(e) {}
  // Buffett Indicator ≈ Wilshire 5000 (price index ≈ $B mkt cap) / GDP × 100
  try {
    const [will, gdp] = await Promise.all([
      fredFetch("WILL5000PRFC").catch(() => null),
      fredFetch("GDP").catch(() => null),
    ]);
    if (will && gdp) {
      const ratio = (will.value * 1.05 / gdp.value) * 100;
      out.buffett_indicator = ratio.toFixed(1);
    }
  } catch(e) {}
  // Margin debt / GDP × 100 — quarterly
  try {
    const [md, gdp2] = await Promise.all([
      fredFetch("BOGZ1FL663067003Q").catch(() => null),  // $M, quarterly
      fredFetch("GDP").catch(() => null),                // $B annualized
    ]);
    if (md && gdp2) {
      const ratio = (md.value / 1000) / gdp2.value * 100;
      out.margin_debt = ratio.toFixed(2);
    }
  } catch(e) {}
  return out;
}

async function fetchMultpl() {
  const results = {};
  try {
    const peResp = await fetchWithProxy("https://www.multpl.com/s-p-500-pe-ratio", 10000);
    const peText = await peResp.text();
    const peMatch = peText.match(/Current.*?:\s*([0-9]+\.?[0-9]*)/);
    if (peMatch) results.sp500_pe = parseFloat(peMatch[1]);
    const avgMatch = peText.match(/Mean:\s*([0-9]+\.?[0-9]*)/);
    if (avgMatch) results.sp500_pe_avg = parseFloat(avgMatch[1]);
  } catch(e) {}
  try {
    const capeResp = await fetchWithProxy("https://www.multpl.com/shiller-pe", 10000);
    const capeText = await capeResp.text();
    const capeMatch = capeText.match(/Current.*?:\s*([0-9]+\.?[0-9]*)/);
    if (capeMatch) results.shiller_cape = parseFloat(capeMatch[1]);
  } catch(e) {}
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

// only: null/undefined = all sections, or array e.g. ["indices","fear"]
async function fetchAllData(only) {
  const has = (s) => !only || only.includes(s);
  const isPartial = !!only;

  showLoadingBar();
  // Estimate total progress steps based on which sections are fetched
  const stepMap = {
    indices: 5,       // batch quotes, 10Y hist, YTD, 12M, PE
    sectors: 3,       // ETF quotes, YTD/12M, PE
    commodities: 2,   // batch + hist
    currencies: 2,    // Yahoo + BOI
    fear: 3,          // batch + FRED spread + CNN/FRED
    macro: 5,         // WB + FRED + bonds + proxies + TE
    portfolio: 1,
  };
  const sections = isPartial ? only : ["macro","indices","sectors","commodities","currencies","fear","portfolio"];
  const totalSteps = sections.reduce((a, s) => a + (stepMap[s] || 1), 0) || 1;
  resetProgress(totalSteps);

  if (!isPartial) {
    document.getElementById("fetchBtn").disabled = true;
    document.getElementById("fetchBtn").textContent = "⏳ טוען...";
    // Show skeletons in every section we're about to refresh
    ["macro","indices","sectors","commodities","currencies","fear","portfolio"].forEach(s => showSectionLoading(s));
  } else {
    only.forEach(s => showSectionLoading(s));
  }
  let successCount = 0;
  const errors = [];

  // Build Yahoo symbol list — include only what's needed
  const yahooSymbols = [];
  const yahooMap = {};
  if (has("indices") || has("macro"))
    INDICES.forEach(i => { yahooSymbols.push(i.sym); yahooMap[i.sym] = { cat: "indices", key: i.key }; });
  if (has("commodities"))
    COMMODITIES.forEach(c => { yahooSymbols.push(c.sym); yahooMap[c.sym] = { cat: "commodities", key: c.key }; });
  if (has("fear") || has("macro")) {
    yahooSymbols.push("^VIX"); yahooMap["^VIX"] = { cat: "fear", key: "vix" };
    yahooSymbols.push("^TNX"); yahooMap["^TNX"] = { cat: "fear", key: "yield_10y_us" };
    yahooSymbols.push("DX-Y.NYB"); yahooMap["DX-Y.NYB"] = { cat: "fear", key: "us_dollar_index" };
  }
  if (has("portfolio") || !isPartial) {
    STATE.portfolio.forEach(s => {
      const sym = s.symbol.toUpperCase();
      if (!yahooMap[sym]) {
        yahooSymbols.push(sym);
        yahooMap[sym] = { cat: "portfolio", key: s.symbol };
      }
    });
  }

  // 1. Try Yahoo Finance (primary)
  let yahooWorked = false;
  try {
    stepProgress(`Yahoo Finance — ${yahooSymbols.length} סימולים`);
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
            // Israeli (.TA) Yahoo quotes are in אגורות → convert to ₪
            stock.currentPrice = sym.endsWith(".TA") ? price / 100 : price;
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

  // 1b. Fetch 10Y high/low and YTD for indices
  if (has("indices") && yahooWorked) {
    try {
      stepProgress("מדדים — שיא/שפל 10Y + YTD + 12M");
      for (const idx of INDICES) {
        try {
          const hist = await yahooHistorical(idx.sym, "10y");
          if (hist && STATE.indices[idx.key]) {
            const price = parseFloat(STATE.indices[idx.key].price);
            if (hist.high_10y) STATE.indices[idx.key].pct_from_high_10y = ((price - hist.high_10y) / hist.high_10y * 100).toFixed(2);
            if (hist.low_10y) STATE.indices[idx.key].pct_from_low_10y = ((price - hist.low_10y) / hist.low_10y * 100).toFixed(2);
          }
          const ytdChange = await yahooYTDChange(idx.sym);
          if (ytdChange !== null && STATE.indices[idx.key]) {
            STATE.indices[idx.key].change_ytd = ytdChange.toFixed(2);
          }
          const m12Change = await yahoo12MChange(idx.sym);
          if (m12Change !== null && STATE.indices[idx.key]) {
            STATE.indices[idx.key].change_12m = m12Change.toFixed(2);
          }
          // 1Y low
          try {
            const hist1y = await yahooHistorical(idx.sym, "1y");
            if (hist1y && hist1y.low_10y && STATE.indices[idx.key]) {
              const price = parseFloat(STATE.indices[idx.key].price);
              STATE.indices[idx.key].pct_from_low_1y = ((price - hist1y.low_10y) / hist1y.low_10y * 100).toFixed(2);
            }
          } catch(e) {}
        } catch(e) { console.warn(`Historical ${idx.sym}:`, e.message); }
      }
    } catch(e) { console.warn("Historical data:", e.message); }
  }

  // 1c. Fetch YTD and 12M change for sector ETFs (keyed by region:name)
  if (has("sectors") && yahooWorked) {
    try {
      stepProgress("סקטורים — שינויים YTD/12M");
      const allSectorRegional = [];
      Object.entries(SECTOR_REGIONS).forEach(([regionKey, r]) => r.sectors.forEach(s => {
        if (s.etf) allSectorRegional.push({ region: regionKey, name: s.name, etf: s.etf });
      }));
      const uniqueEtfs = [...new Set(allSectorRegional.map(s => s.etf))];
      const histByEtf = {};
      for (const etf of uniqueEtfs) {
        try {
          const [ytd, m12] = await Promise.all([
            yahooYTDChange(etf).catch(() => null),
            yahoo12MChange(etf).catch(() => null),
          ]);
          histByEtf[etf] = { ytd, m12 };
        } catch(e) { console.warn(`Sector hist ${etf}:`, e.message); }
      }
      allSectorRegional.forEach(s => {
        const h = histByEtf[s.etf];
        if (!h) return;
        const key = `${s.region}:${s.name}`;
        if (!STATE.sectors[key]) STATE.sectors[key] = {};
        if (h.ytd != null) STATE.sectors[key].change_ytd = h.ytd.toFixed(2);
        if (h.m12 != null) STATE.sectors[key].change_12m = h.m12.toFixed(2);
      });
    } catch(e) { console.warn("Sector historical:", e.message); }
  }

  // 1d. Fetch YTD and 12M change for commodities
  if (has("commodities") && yahooWorked) {
    try {
      stepProgress("סחורות — שינויים YTD/12M");
      for (const c of COMMODITIES) {
        try {
          const ytdChange = await yahooYTDChange(c.sym);
          if (ytdChange !== null) {
            if (!STATE.commodities[c.key]) STATE.commodities[c.key] = {};
            STATE.commodities[c.key].change_ytd = ytdChange.toFixed(2);
          }
          const m12Change = await yahoo12MChange(c.sym);
          if (m12Change !== null) {
            if (!STATE.commodities[c.key]) STATE.commodities[c.key] = {};
            STATE.commodities[c.key].change_12m = m12Change.toFixed(2);
          }
        } catch(e) { console.warn(`Commodity hist ${c.sym}:`, e.message); }
      }
    } catch(e) { console.warn("Commodity historical:", e.message); }
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

  // 3. FOREX — All currencies normalized to ILS
  if (!has("currencies")) { /* skip */ } else
  try {
    stepProgress("מטבעות — Yahoo Finance");
    // First fetch all needed Yahoo symbols
    const directSymbols = CURRENCIES.filter(c => c.direct && c.yahoo).map(c => c.yahoo);
    const crossSymbols = new Set();
    CURRENCIES.filter(c => c.cross).forEach(c => c.cross.forEach(s => crossSymbols.add(s)));
    const allFxSymbols = [...new Set([...directSymbols, ...crossSymbols])];
    const fxResults = await yahooBatch(allFxSymbols);
    const fxPrices = {};
    fxResults.forEach(q => { fxPrices[q.symbol] = q; });

    let fxOk = 0;
    CURRENCIES.forEach(curr => {
      if (!STATE.currencies[curr.key]) STATE.currencies[curr.key] = {};

      if (curr.direct && curr.yahoo && fxPrices[curr.yahoo]) {
        const q = fxPrices[curr.yahoo];
        STATE.currencies[curr.key].rate = q.price.toFixed(4);
        STATE.currencies[curr.key].change_pct = q.change_pct.toFixed(2);
        fxOk++;
      } else if (curr.cross && curr.crossCalc) {
        // Cross-calculate
        const q1 = fxPrices[curr.cross[0]]; // e.g., USDJPY=X
        const q2 = fxPrices[curr.cross[1]]; // e.g., USDILS=X
        if (q1 && q2) {
          let rate;
          if (curr.crossCalc === "ils_div_rate") {
            // JPY/ILS = USDILS / USDJPY (for 1 unit), but JPY shows as 100
            rate = q2.price / q1.price;
            if (curr.key === "JPY/ILS") rate = rate * 100; // Show per 100 JPY
          } else if (curr.crossCalc === "usd_mult") {
            // AUD/ILS = AUDUSD * USDILS
            rate = q1.price * q2.price;
          }
          if (rate) {
            STATE.currencies[curr.key].rate = rate.toFixed(4);
            // Approximate change
            const prevRate1 = q1.price / (1 + q1.change_pct/100);
            const prevRate2 = q2.price / (1 + q2.change_pct/100);
            let prevRate;
            if (curr.crossCalc === "ils_div_rate") {
              prevRate = prevRate2 / prevRate1;
              if (curr.key === "JPY/ILS") prevRate *= 100;
            } else {
              prevRate = prevRate1 * prevRate2;
            }
            const changePct = prevRate ? ((rate - prevRate) / prevRate * 100) : 0;
            STATE.currencies[curr.key].change_pct = changePct.toFixed(2);
            fxOk++;
          }
        }
      }
    });
    if (fxOk > 0) { updateTimestamp("currencies"); successCount++; }
    else errors.push("מט״ח: Yahoo");
  } catch(e) { errors.push("מט״ח: " + e.message); }

  // 4. SECTORS via Yahoo Finance — fetch ALL regions' ETFs at once
  if (!has("sectors")) { /* skip */ } else
  try {
    stepProgress("סקטורים — Yahoo Finance ETF");
    // Collect all unique ETF symbols from all regions
    const allSectorETFs = [];
    const etfToSector = {}; // map etf → [{region, sectorName}]
    Object.entries(SECTOR_REGIONS).forEach(([regionKey, regionData]) => {
      regionData.sectors.forEach(sec => {
        if (sec.etf && !allSectorETFs.includes(sec.etf)) {
          allSectorETFs.push(sec.etf);
        }
        if (!etfToSector[sec.etf]) etfToSector[sec.etf] = [];
        etfToSector[sec.etf].push({ region: regionKey, name: sec.name });
      });
    });
    const sectorResults = await yahooBatch(allSectorETFs);
    let secOk = 0;
    sectorResults.forEach(q => {
      const mappings = etfToSector[q.symbol];
      if (!mappings) return;
      mappings.forEach(m => {
        const key = `${m.region}:${m.name}`;
        if (!STATE.sectors[key]) STATE.sectors[key] = {};
        STATE.sectors[key].ytd = q.change_pct.toFixed(2);
        STATE.sectors[key].price = q.price.toFixed(2);
        secOk++;
      });
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
        // FMP sector snapshot is US sector data → write to "US:<name>"
        sectors.forEach(s => {
          const key = `US:${s.sector}`;
          if (!STATE.sectors[key]) STATE.sectors[key] = {};
          if (s.averageChange) STATE.sectors[key].ytd = parseFloat(s.averageChange).toFixed(2);
        });
      }
    } catch(e) { console.warn("FMP Sectors:", e.message); }
  }

  // 5. BOI — Bank of Israel representative exchange rates (שער יציג)
  if (!has("currencies") && !has("macro")) { /* skip */ } else
  try {
    stepProgress("מטבעות — בנק ישראל (שער יציג)");
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
      // Overwrite USD/ILS, EUR/ILS, GBP/ILS with official BOI rate
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
      const gbp = boiRates.find(r => r.key === "GBP");
      if (gbp) {
        if (!STATE.currencies["GBP/ILS"]) STATE.currencies["GBP/ILS"] = {};
        STATE.currencies["GBP/ILS"].rate = gbp.currentExchangeRate.toFixed(4);
        STATE.currencies["GBP/ILS"].change_pct = parseFloat(gbp.currentChange || 0).toFixed(2);
        STATE.currencies["GBP/ILS"].source = "שער יציג";
      }
      if (boiOk > 0) { updateTimestamp("currencies"); if (!successCount) successCount++; }
    }
  } catch(e) { console.warn("BOI:", e.message); }

  // 6. World Bank — Macro data: GDP, inflation, unemployment (free, no key)
  if (!has("macro")) { /* skip */ } else
  try {
    stepProgress("מאקרו — World Bank (GDP, אינפלציה, חוב)");
    const wb = await fetchWorldBank();
    let wbOk = 0;
    Object.entries(wb).forEach(([region, data]) => {
      if (!STATE.macro[region]) STATE.macro[region] = {};
      if (data.gdp_growth !== undefined)    { STATE.macro[region].gdp_growth = data.gdp_growth.toFixed(2); wbOk++; }
      if (data.inflation !== undefined)     { STATE.macro[region].inflation = data.inflation.toFixed(2); wbOk++; }
      if (data.unemployment !== undefined)  { STATE.macro[region].unemployment = data.unemployment.toFixed(2); wbOk++; }
      if (data.debt_to_gdp !== undefined)   { STATE.macro[region].debt_to_gdp = data.debt_to_gdp.toFixed(1); wbOk++; }
      if (data.gdp_absolute !== undefined)  { STATE.macro[region].gdp_absolute = Math.round(data.gdp_absolute).toString(); wbOk++; }
      if (data.gdp_per_capita !== undefined){ STATE.macro[region].gdp_per_capita = Math.round(data.gdp_per_capita).toString(); wbOk++; }
    });
    if (wbOk > 0) { updateTimestamp("macro"); successCount++; }
    else errors.push("מאקרו: World Bank");
  } catch(e) { errors.push("World Bank: " + e.message); }

  // 7. FRED — Macro data override with more current data (optional, needs key)
  if (has("macro") && STATE.fredApiKey) {
    try {
      stepProgress("מאקרו — FRED ריביות ואינפלציה");
      const fred = await fetchAllFRED();
      let macroOk = 0;
      // Map FRED results to STATE.macro
      const mapping = [
        ["US_interest", "US", "interest_rate"],
        ["US_unemployment", "US", "unemployment"],
        ["IL_interest", "IL", "interest_rate"],
        ["GB_interest", "GB", "interest_rate"],
        ["GB_unemployment", "GB", "unemployment"],
        ["DE_unemployment", "DE", "unemployment"],
        ["FR_unemployment", "FR", "unemployment"],
        ["JP_interest", "JP", "interest_rate"],
        ["JP_unemployment", "JP", "unemployment"],
        ["CN_interest", "CN", "interest_rate"],
        ["BR_interest", "BR", "interest_rate"],
        ["KR_interest", "KR", "interest_rate"],
        ["MX_interest", "MX", "interest_rate"],
        ["TR_interest", "TR", "interest_rate"],
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
        ["GB_inflation", "GB"],
        ["DE_inflation", "DE"],
        ["FR_inflation", "FR"],
        ["JP_inflation", "JP"],
        ["CN_inflation", "CN"],
        ["BR_inflation", "BR"],
        ["KR_inflation", "KR"],
        ["MX_inflation", "MX"],
        ["TR_inflation", "TR"],
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
  if (has("macro") && STATE.fredApiKey) {
    try {
      stepProgress("מאקרו — תשואות אג״ח 10Y מ-FRED");
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

  // 9. Fill missing macro fields via Yahoo Finance proxies
  if (!has("macro")) { /* skip */ } else
  try {
    stepProgress("מאקרו — השלמות מ-Yahoo");
    // Bond ETFs as proxies for 10Y yields when FRED is unavailable
    const macroProxies = [
      { sym: "^IRX",    region: "US", field: "interest_rate" },  // 13-week T-bill ≈ fed funds
      { sym: "^TNX",    region: "US", field: "bond_10y" },       // US 10Y treasury yield
      { sym: "^TNGB",   region: "GB", field: "bond_10y" },       // UK 10Y gilt yield
      { sym: "^TNGDE",  region: "DE", field: "bond_10y" },       // German bund 10Y
      { sym: "VGIT",    region: "US", field: null },             // (skipped — proxy only)
    ];
    for (const mp of macroProxies) {
      if (mp.field && (!STATE.macro[mp.region]?.[mp.field])) {
        try {
          const q = await yahooQuote(mp.sym);
          if (q && q.price) {
            if (!STATE.macro[mp.region]) STATE.macro[mp.region] = {};
            STATE.macro[mp.region][mp.field] = q.price.toFixed(2);
          }
        } catch(e) { console.warn(`Macro proxy ${mp.sym}:`, e.message); }
      }
    }
  } catch(e) { console.warn("Macro proxies:", e.message); }

  // 10. Scrape macro data from Trading Economics (try matrix first, then individual pages)
  if (!has("macro")) { /* skip */ } else
  try {
    stepProgress("מאקרו — Trading Economics (ריביות, אג״ח 10Y, חוב)");
    let macroScraped = await fetchMacroScrape();
    let scraped = 0;
    // Always also hit individual TE pages — they have bond_10y + debt_to_gdp which matrix lacks
    const teFull = await fetchMacroTE();
    // Merge: individual TE pages fill gaps in matrix results
    Object.entries(teFull).forEach(([region, data]) => {
      if (!macroScraped[region]) macroScraped[region] = {};
      Object.entries(data).forEach(([field, val]) => {
        if (macroScraped[region][field] == null) macroScraped[region][field] = val;
      });
    });
    Object.entries(macroScraped).forEach(([region, data]) => {
      if (!STATE.macro[region]) STATE.macro[region] = {};
      if (data.interest_rate != null && !STATE.macro[region].interest_rate) { STATE.macro[region].interest_rate = data.interest_rate.toFixed(2); scraped++; }
      if (data.inflation     != null && !STATE.macro[region].inflation)     { STATE.macro[region].inflation = data.inflation.toFixed(2); scraped++; }
      if (data.unemployment  != null && !STATE.macro[region].unemployment)  { STATE.macro[region].unemployment = data.unemployment.toFixed(2); scraped++; }
      if (data.bond_10y      != null && !STATE.macro[region].bond_10y)      { STATE.macro[region].bond_10y = data.bond_10y.toFixed(2); scraped++; }
      if (data.debt_to_gdp   != null && !STATE.macro[region].debt_to_gdp)   { STATE.macro[region].debt_to_gdp = data.debt_to_gdp.toFixed(1); scraped++; }
    });
    if (scraped > 0) { updateTimestamp("macro"); successCount++; }
  } catch(e) { console.warn("Macro scrape:", e.message); }

  // 11. Fetch P/E for index ETFs — Yahoo quoteSummary (primary) + stockanalysis fallback
  if (!has("indices")) { /* skip */ } else
  try {
    stepProgress("מדדים — מכפילי P/E");
    const etfPEList = INDICES.filter(i => i.sa && i.saType === "e");
    // Fetch in parallel batches of 3 to be polite
    for (let i = 0; i < etfPEList.length; i += 3) {
      const batch = etfPEList.slice(i, i + 3);
      await Promise.all(batch.map(async idx => {
        try {
          const metrics = await fetchETFMetrics(idx.sym);
          if (!STATE.indices[idx.key]) STATE.indices[idx.key] = {};
          if (metrics.pe)        STATE.indices[idx.key].pe_current  = parseFloat(metrics.pe).toFixed(2);
          if (metrics.forwardPE) STATE.indices[idx.key].pe_forward  = parseFloat(metrics.forwardPE).toFixed(2);
        } catch(e) { console.warn("ETF PE", idx.sym, e.message); }
      }));
    }
    updateTimestamp("indices");
  } catch(e) { console.warn("ETF P/E:", e.message); }

  // 11b. Fetch P/E for SECTOR ETFs (per region:name)
  if (!has("sectors")) { /* skip */ } else
  try {
    stepProgress("סקטורים — P/E לפי ETF");
    const allSectorRegional = [];
    Object.entries(SECTOR_REGIONS).forEach(([regionKey, r]) => r.sectors.forEach(s => {
      if (s.etf) allSectorRegional.push({ region: regionKey, name: s.name, etf: s.etf });
    }));
    const uniqueEtfs = [...new Set(allSectorRegional.map(s => s.etf))];
    const peByEtf = {};
    for (let i = 0; i < uniqueEtfs.length; i += 3) {
      const batch = uniqueEtfs.slice(i, i + 3);
      await Promise.all(batch.map(async etf => {
        try {
          const m = await fetchETFMetrics(etf);
          if (m.pe) peByEtf[etf] = parseFloat(m.pe).toFixed(2);
        } catch(e) {}
      }));
    }
    allSectorRegional.forEach(s => {
      if (!peByEtf[s.etf]) return;
      const key = `${s.region}:${s.name}`;
      if (!STATE.sectors[key]) STATE.sectors[key] = {};
      STATE.sectors[key].pe = peByEtf[s.etf];
    });
    updateTimestamp("sectors");
  } catch(e) { console.warn("Sector P/E:", e.message); }

  // 12. FRED — Yield Spread 10Y-2Y (auto-calc for fear screen)
  if (has("fear") && STATE.fredApiKey) {
    try {
      stepProgress("פחד — פער עקום תשואות 10Y-2Y");
      const [dgs10, dgs2] = await Promise.all([
        fredFetch("DGS10").catch(() => null),
        fredFetch("DGS2").catch(() => null),
      ]);
      if (dgs10 && dgs2) {
        const spread = (dgs10.value - dgs2.value).toFixed(2);
        if (!STATE.fear.yield_spread) STATE.fear.yield_spread = {};
        STATE.fear.yield_spread.value = spread;
        updateTimestamp("fear");
      }
    } catch(e) { console.warn("Yield Spread:", e.message); }
  }

  // 12b. Fetch % S&P500 stocks above 200-day MA (via Yahoo: ^SPXA200R)
  if (!has("fear")) { /* skip */ } else
  try {
    stepProgress("פחד — % מניות מעל MA200");
    const ma200q = await yahooQuote("^SPXA200R").catch(() => null);
    if (ma200q && ma200q.price) {
      if (!STATE.fear.sp500_above_200ma) STATE.fear.sp500_above_200ma = {};
      STATE.fear.sp500_above_200ma.value = ma200q.price.toFixed(1);
      updateTimestamp("fear");
    }
  } catch(e) { console.warn("MA200:", e.message); }

  // 12c. Extended fear indicators — CNN Fear&Greed + FRED-based
  if (has("fear")) {
    try {
      stepProgress("פחד — CNN Fear&Greed + מדדי FRED");
      const [fg, fredFear] = await Promise.all([
        fetchCNNFearGreed(),
        fetchExtendedFearFRED(),
      ]);
      let extOk = 0;
      if (fg) {
        if (!STATE.fear.fear_greed) STATE.fear.fear_greed = {};
        STATE.fear.fear_greed.value = fg;
        extOk++;
      }
      if (fredFear.credit_spread) {
        if (!STATE.fear.credit_spread) STATE.fear.credit_spread = {};
        STATE.fear.credit_spread.value = fredFear.credit_spread;
        extOk++;
      }
      if (fredFear.buffett_indicator) {
        if (!STATE.fear.buffett_indicator) STATE.fear.buffett_indicator = {};
        STATE.fear.buffett_indicator.value = fredFear.buffett_indicator;
        extOk++;
      }
      if (fredFear.margin_debt) {
        if (!STATE.fear.margin_debt) STATE.fear.margin_debt = {};
        STATE.fear.margin_debt.value = fredFear.margin_debt;
        extOk++;
      }
      if (extOk > 0) updateTimestamp("fear");
    } catch(e) { console.warn("Extended fear:", e.message); }
  }

  // 13. Scrape S&P 500 P/E and Shiller CAPE from multpl.com (SPY only — live)
  if (!has("indices")) { /* skip */ } else
  try {
    stepProgress("מדדים — Shiller CAPE ו-P/E היסטורי");
    const multpl = await fetchMultpl();
    if (multpl.sp500_pe && STATE.indices.SPY) {
      STATE.indices.SPY.pe_current = multpl.sp500_pe.toFixed(2);
    }
    if (multpl.sp500_pe_avg && STATE.indices.SPY) {
      STATE.indices.SPY.pe_historical_avg = multpl.sp500_pe_avg.toFixed(2);
    }
    if (multpl.shiller_cape && STATE.indices.SPY) {
      STATE.indices.SPY.shiller_cape = multpl.shiller_cape.toFixed(2);
    }
  } catch(e) { console.warn("multpl:", e.message); }

  // 13b. Fill missing pe_historical_avg + shiller_cape from static defaults
  // (user-editable manual fields — only filled if no value yet)
  if (has("indices") && typeof INDEX_PE_DEFAULTS !== "undefined") {
    Object.entries(INDEX_PE_DEFAULTS).forEach(([key, defaults]) => {
      if (!STATE.indices[key]) STATE.indices[key] = {};
      if (!STATE.indices[key].pe_historical_avg && defaults.pe_historical_avg) {
        STATE.indices[key].pe_historical_avg = defaults.pe_historical_avg;
      }
      if (!STATE.indices[key].shiller_cape && defaults.shiller_cape) {
        STATE.indices[key].shiller_cape = defaults.shiller_cape;
      }
      // Forward P/E fallback — if neither Yahoo nor SA returned a value
      if (!STATE.indices[key].pe_forward && defaults.pe_forward) {
        STATE.indices[key].pe_forward = defaults.pe_forward;
      }
    });
  }

  saveState();
  setProgress(100, "הושלם ✓");
  setTimeout(hideLoadingBar, 600);
  ["macro","indices","sectors","commodities","currencies","fear","portfolio"].forEach(s => hideSectionLoading(s));
  if (isPartial) {
    // Render only the changed sections
    only.forEach(s => renderSection(s));
    const label = only.map(s => ({ macro:"מאקרו", indices:"מדדים", sectors:"סקטורים", commodities:"סחורות", currencies:"מטבעות", fear:"פחד", portfolio:"תיק" }[s] || s)).join(", ");
    showStatus(`✓ ${label} עודכן${only.length > 1 ? "ו" : ""}`, "success");
  } else {
    renderAll();
    document.getElementById("fetchBtn").disabled = false;
    document.getElementById("fetchBtn").textContent = "🔄 משוך נתונים";
    const proxyLabel = _workingProxy === -2 ? "direct" : _workingProxy >= 0 ? `proxy #${_workingProxy + 1}` : "";
    if (successCount === 0) {
      showStatus(`✕ נכשל: ${errors.join(" | ")}`, "error");
    } else if (errors.length === 0) {
      showStatus(`✓ ${successCount} קטגוריות עודכנו בהצלחה ${proxyLabel ? `[${proxyLabel}]` : ""}`, "success");
    } else {
      showStatus(`✓ עודכנו ${successCount}. חסרים: ${errors.join(", ")}`, "success");
    }
  }
  console.log("Fetch result:", { only, success: successCount, errors, proxy: _workingProxy });
}

// ═══════════════════════════════════════════════════════════════════════════════
// STOCK SCANNER — Lookup any stock by symbol
// ═══════════════════════════════════════════════════════════════════════════════

async function scanStock() {
  const input = document.getElementById("scannerSymbol");
  const resultDiv = document.getElementById("scannerResult");
  const sym = input.value.trim().toUpperCase();
  if (!sym) return;

  resultDiv.innerHTML = `<div style="color:var(--text-dim);padding:20px;text-align:center">מחפש ${sym}... (מחיר + אנליסטים + פיננסים)</div>`;

  let q = null, source = "", forecast = {}, details = {}, cashflow = {};

  // Yahoo Finance for live price
  try {
    q = await yahooQuote(sym);
    if (q && q.price) source = "Yahoo Finance";
  } catch(e) { console.warn("Yahoo scanner:", e); }

  // Israeli (.TA) stocks are quoted in אגורות — convert to ₪ (÷ 100)
  const isIsraeliTicker = sym.includes('.TA');
  if (isIsraeliTicker && q && q.price) {
    q.price = q.price / 100;
    if (q.open) q.open = q.open / 100;
    if (q.high) q.high = q.high / 100;
    if (q.low)  q.low  = q.low  / 100;
    if (q.fiftyTwoWeekHigh) q.fiftyTwoWeekHigh = q.fiftyTwoWeekHigh / 100;
    if (q.fiftyTwoWeekLow)  q.fiftyTwoWeekLow  = q.fiftyTwoWeekLow  / 100;
  }

  // Fallback to Twelve Data
  if (!q && STATE.tdApiKey) {
    try {
      const data = await tdQuote(sym);
      const tq = data[sym] || data;
      if (tq && tq.close) {
        q = { price: parseFloat(tq.close), open: parseFloat(tq.open), high: parseFloat(tq.high),
              low: parseFloat(tq.low), volume: parseFloat(tq.volume), change_pct: parseFloat(tq.percent_change || 0),
              name: tq.name || "", date: tq.datetime || "" };
        source = "Twelve Data";
      }
    } catch(e) {}
  }

  if (!q || !q.price) {
    resultDiv.innerHTML = `<div style="color:var(--red);padding:20px;text-align:center">לא נמצא מידע על ${sym}. נסה סימבול אחר.</div>`;
    return;
  }

  // Fetch extended data from stockanalysis.com + Yahoo historical + Bizportal for .TA
  resultDiv.innerHTML = `<div style="color:var(--text-dim);padding:20px;text-align:center">שולף נתונים מורחבים ל-${sym}...</div>`;
  let usedFinviz = false;
  try {
    const isIsraeli = sym.includes('.TA');
    const [det, fc, cf, biz, fv, fin] = await Promise.all([
      fetchStockDetails(sym).catch(() => ({})),
      fetchStockForecast(sym).catch(() => ({})),
      fetchStockCashFlow(sym).catch(() => ({})),
      isIsraeli ? fetchBizportalData(sym).catch(() => ({})) : Promise.resolve({}),
      isIsraeli ? Promise.resolve({}) : fetchFinvizData(sym).catch(() => ({})),
      isIsraeli ? Promise.resolve(null) : fetchStockFinancials(sym).catch(() => null),
    ]);
    window._lastFinancials = fin; // stash for render below
    // Merge order: Yahoo/SA first, then Bizportal (IL) or Finviz (US) as fallback
    details = { ...biz, ...det };
    if (!details.pe && biz.pe) details.pe = biz.pe;
    if (!details.pb && biz.pb) details.pb = biz.pb;
    if (!details.debtEquity && biz.debtEquity) details.debtEquity = biz.debtEquity;
    if (!details.marketCap && biz.marketCap) details.marketCap = biz.marketCap;
    if (!details.divYield && biz.divYield) details.divYield = biz.divYield;
    // Finviz fills any remaining gaps for US stocks
    const finvizFields = ["pe","forwardPE","eps","pb","debtEquity","beta","divYield","marketCap","priceTarget","analystRating","revenue","sharesOut","roe","roa","profitMargin"];
    finvizFields.forEach(k => {
      const cur = details[k];
      if ((cur == null || cur === "" || (typeof cur === "number" && isNaN(cur))) && fv[k] != null) {
        details[k] = fv[k];
        usedFinviz = true;
      }
    });
    forecast = fc; cashflow = cf;
  } catch(e) {}
  // Annotate source label so user sees Finviz was consulted
  if (usedFinviz) source += " + Finviz";

  let ytdChange = null, m12Change = null, hist10y = null;
  try {
    [ytdChange, m12Change] = await Promise.all([
      yahooYTDChange(sym).catch(() => null),
      yahoo12MChange(sym).catch(() => null),
    ]);
    hist10y = await yahooHistorical(sym, "10y").catch(() => null);
  } catch(e) {}

  const changeClass = q.change_pct >= 0 ? "positive" : "negative";
  const sign = q.change_pct >= 0 ? "+" : "";

  // Merge forecast into details (both come from same API now)
  const merged = { ...details, ...forecast };

  // Analyst section
  let analystHTML = "";
  if (merged.analystCount || merged.priceTarget) {
    const buyTotal = (merged.strongBuy || 0) + (merged.buy || 0);
    const holdTotal = merged.hold || 0;
    const sellTotal = (merged.sell || 0) + (merged.strongSell || 0);
    const total = buyTotal + holdTotal + sellTotal;
    const rating = merged.analystRating || merged.consensus || "";
    const consensusEmoji = (rating === "Buy" || rating === "Strong Buy") ? "🟢" : rating === "Hold" ? "🟡" : rating === "Sell" ? "🔴" : "⚪";
    const upside = merged.priceTarget ? ((merged.priceTarget - q.price) / q.price * 100).toFixed(1) : "";
    analystHTML = `
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
        <h4 style="color:var(--accent);margin-bottom:12px">📊 המלצות אנליסטים</h4>
        <div class="scanner-grid">
          <div class="scanner-item"><span class="scanner-label">קונצנזוס:</span> <span>${consensusEmoji} ${rating || "—"}</span></div>
          <div class="scanner-item"><span class="scanner-label">אנליסטים:</span> <span>${merged.analystCount || "—"}</span></div>
          <div class="scanner-item"><span class="scanner-label">יעד ממוצע:</span> <span>$${merged.priceTarget?.toFixed(2) || "—"}</span></div>
          <div class="scanner-item"><span class="scanner-label">יעד גבוה:</span> <span>$${merged.targetHigh?.toFixed(2) || "—"}</span></div>
          <div class="scanner-item"><span class="scanner-label">יעד נמוך:</span> <span>$${merged.targetLow?.toFixed(2) || "—"}</span></div>
          <div class="scanner-item"><span class="scanner-label">אפסייד:</span> <span class="${upside > 0 ? 'positive' : 'negative'}">${upside ? upside + "%" : "—"}</span></div>
        </div>
        ${total > 0 ? `<div style="margin-top:8px;display:flex;gap:8px;font-size:11px;align-items:center">
          <span style="color:var(--green)">קנייה: ${buyTotal}</span>
          <span style="color:var(--yellow)">החזק: ${holdTotal}</span>
          <span style="color:var(--red)">מכירה: ${sellTotal}</span>
          <div style="flex:1;height:6px;background:var(--bg-elevated);border-radius:3px;overflow:hidden;display:flex">
            <div style="width:${(buyTotal/total*100).toFixed(0)}%;background:var(--green)"></div>
            <div style="width:${(holdTotal/total*100).toFixed(0)}%;background:var(--yellow)"></div>
            <div style="width:${(sellTotal/total*100).toFixed(0)}%;background:var(--red)"></div>
          </div>
        </div>` : ""}
      </div>`;
  }

  // Fundamentals — defensive number formatting (accepts strings too)
  const n2 = v => { const x = parseFloat(v); return isNaN(x) ? "—" : x.toFixed(2); };
  const pe = merged.pe, fpe = merged.forwardPE;
  const fundHTML = `
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
      <h4 style="color:var(--accent);margin-bottom:12px">📈 נתוני יסוד</h4>
      <div class="scanner-grid">
        <div class="scanner-item"><span class="scanner-label">P/E:</span> <span>${n2(pe)}</span></div>
        <div class="scanner-item"><span class="scanner-label">P/E עתידי:</span> <span>${n2(fpe)}</span></div>
        <div class="scanner-item"><span class="scanner-label">P/B:</span> <span>${n2(merged.pb)}</span></div>
        <div class="scanner-item"><span class="scanner-label" title="Enterprise Value to EBITDA — מכפיל שווי עסקי לרווח התפעולי. נמוך = זול יחסית">EV/EBITDA <span class="inline-info-btn" onclick="openInfo('ev_ebitda')" title="הסבר">ℹ️</span>:</span> <span>${n2(merged.evEbitda)}</span></div>
        <div class="scanner-item"><span class="scanner-label">חוב/הון:</span> <span>${n2(merged.debtEquity)}</span></div>
        <div class="scanner-item"><span class="scanner-label">EPS:</span> <span>${merged.eps != null && !isNaN(parseFloat(merged.eps)) ? (sym.includes('.TA') ? '₪' : '$') + parseFloat(merged.eps).toFixed(2) : "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">שווי שוק:</span> <span>${merged.marketCap || "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">Enterprise Value:</span> <span>${merged.enterpriseValue || "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">בטא:</span> <span>${n2(merged.beta)}</span></div>
        <div class="scanner-item"><span class="scanner-label">דיבידנד:</span> <span>${merged.divYield || "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">ROE:</span> <span>${merged.roe || "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">הכנסות:</span> <span>${merged.revenue || "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">מניות:</span> <span>${merged.sharesOut || "—"}</span></div>
      </div>
    </div>`;

  // Performance
  const pctHigh = hist10y?.high_10y ? ((q.price - hist10y.high_10y) / hist10y.high_10y * 100).toFixed(1) : null;
  const pctLow = hist10y?.low_10y ? ((q.price - hist10y.low_10y) / hist10y.low_10y * 100).toFixed(1) : null;
  const perfHTML = `
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
      <h4 style="color:var(--accent);margin-bottom:12px">📉 ביצועים</h4>
      <div class="scanner-grid">
        <div class="scanner-item"><span class="scanner-label">שינוי YTD:</span> <span class="${ytdChange > 0 ? 'positive' : 'negative'}">${ytdChange !== null ? ytdChange.toFixed(2) + "%" : "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">שינוי 12M:</span> <span class="${m12Change > 0 ? 'positive' : 'negative'}">${m12Change !== null ? m12Change.toFixed(2) + "%" : "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">מרחק משיא 10Y:</span> <span class="${pctHigh < 0 ? 'negative' : 'positive'}">${pctHigh ? pctHigh + "%" : "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">מרחק משפל 10Y:</span> <span class="positive">${pctLow ? "+" + pctLow + "%" : "—"}</span></div>
      </div>
    </div>`;

  // Historical financials (annual revenue + net income — up to 8 years)
  let finHTML = "";
  const fin = window._lastFinancials;
  if (fin && fin.years && fin.years.length > 1) {
    const fmtBig = v => {
      if (v == null || isNaN(v)) return "—";
      const n = parseFloat(v);
      const abs = Math.abs(n);
      if (abs >= 1e9)  return (n / 1e9).toFixed(2) + "B";
      if (abs >= 1e6)  return (n / 1e6).toFixed(1) + "M";
      if (abs >= 1e3)  return (n / 1e3).toFixed(1) + "K";
      return n.toFixed(0);
    };
    const yrHeader = fin.years.map(y => `<th>${y}</th>`).join("");
    const revRow   = fin.revenue.map(v => `<td>${fmtBig(v)}</td>`).join("");
    const niRow    = fin.netIncome.map(v => {
      const n = parseFloat(v);
      const cls = isNaN(n) ? "" : (n >= 0 ? "positive" : "negative");
      return `<td class="${cls}">${fmtBig(v)}</td>`;
    }).join("");
    // Profit margin row
    const marginRow = fin.revenue.map((r, i) => {
      const ni = parseFloat(fin.netIncome[i]), rv = parseFloat(r);
      if (isNaN(ni) || isNaN(rv) || rv === 0) return `<td>—</td>`;
      const m = (ni / rv * 100);
      const cls = m >= 0 ? "positive" : "negative";
      return `<td class="${cls}">${m.toFixed(1)}%</td>`;
    }).join("");
    finHTML = `
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
        <h4 style="color:var(--accent);margin-bottom:12px">💰 נתונים פיננסיים היסטוריים (שנתי)</h4>
        <div class="table-wrap" style="overflow-x:auto">
          <table class="fin-hist-table">
            <thead><tr><th>שנה</th>${yrHeader}</tr></thead>
            <tbody>
              <tr><td class="label">הכנסות (Revenue)</td>${revRow}</tr>
              <tr><td class="label">רווח נקי (Net Income)</td>${niRow}</tr>
              <tr><td class="label">שולי רווח %</td>${marginRow}</tr>
            </tbody>
          </table>
        </div>
        <div style="font-size:10px;color:var(--text-ghost);margin-top:6px">מקור: ${fin.source}</div>
      </div>`;
  }

  // Corporate actions
  let corpHTML = "";
  if (cashflow.buybackTTM || cashflow.sbcTTM) {
    corpHTML = `
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
        <h4 style="color:var(--accent);margin-bottom:12px">🏢 פעולות חברה</h4>
        <div class="scanner-grid">
          <div class="scanner-item"><span class="scanner-label">רכישה עצמית (TTM):</span> <span>${cashflow.buybackTTM || "—"}</span></div>
          <div class="scanner-item"><span class="scanner-label">תגמול מבוסס מניות:</span> <span>${cashflow.sbcTTM || "—"}</span></div>
          <div class="scanner-item"><span class="scanner-label">דיבידנדים ששולמו:</span> <span>${cashflow.dividendsPaid || "—"}</span></div>
        </div>
      </div>`;
  }

  resultDiv.innerHTML = `
    <div class="scanner-card">
      <div class="scanner-header">
        <div>
          <div class="scanner-symbol">${sym}</div>
          ${q.name ? `<div class="scanner-name">${q.name}</div>` : ""}
          <div style="font-size:11px;color:var(--text-faint);margin-top:4px">מקור: ${source}${sym.includes('.TA') ? ' + Bizportal' : ''}</div>
        </div>
        <div class="scanner-price-block">
          <div class="scanner-price">${sym.includes('.TA') ? '₪' : '$'}${q.price.toFixed(2)}</div>
          <div class="scanner-change ${changeClass}">${sign}${q.change_pct.toFixed(2)}%</div>
        </div>
      </div>
      <div class="scanner-grid">
        <div class="scanner-item"><span class="scanner-label">פתיחה:</span> <span>${sym.includes('.TA') ? '₪' : '$'}${q.open?.toFixed(2) || "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">גבוה:</span> <span>${sym.includes('.TA') ? '₪' : '$'}${q.high?.toFixed(2) || "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">נמוך:</span> <span>${sym.includes('.TA') ? '₪' : '$'}${q.low?.toFixed(2) || "—"}</span></div>
        <div class="scanner-item"><span class="scanner-label">מחזור:</span> <span>${q.volume?.toLocaleString() || "—"}</span></div>
      </div>
      ${fundHTML}
      ${finHTML}
      ${perfHTML}
      ${analystHTML}
      ${corpHTML}
      <div class="scanner-actions" style="flex-wrap:wrap;gap:6px">
        <button class="btn btn-success btn-small" onclick="addFromScanner('${sym}', '${(q.name || "").replace(/'/g, "")}')">+ הוסף לתיק</button>
        <a href="https://finance.yahoo.com/quote/${sym}/profile" target="_blank" class="btn btn-outline" title="על החברה — תיאור, מנכ״ל, מגזר, מספר עובדים">🏢 פרופיל חברה</a>
        <a href="https://finance.yahoo.com/quote/${sym}" target="_blank" class="btn btn-outline">📊 Yahoo Finance</a>
        <a href="https://finance.yahoo.com/quote/${sym}/holders" target="_blank" class="btn btn-outline" title="בעלי מניות ומחזיקים עיקריים">👥 בעלי מניות</a>
        <a href="https://stockanalysis.com/stocks/${sym.toLowerCase()}/" target="_blank" class="btn btn-outline">📈 Stock Analysis</a>
        <a href="https://stockanalysis.com/stocks/${sym.toLowerCase()}/financials/" target="_blank" class="btn btn-outline" title="דוחות כספיים 10+ שנים">📒 דוחות כספיים</a>
        <a href="https://finviz.com/quote.ashx?t=${sym}" target="_blank" class="btn btn-outline">📉 Finviz</a>
        <a href="https://www.google.com/finance/quote/${sym}:NASDAQ" target="_blank" class="btn btn-outline">🔎 Google Finance</a>
        <a href="https://seekingalpha.com/symbol/${sym}" target="_blank" class="btn btn-outline">🔬 Seeking Alpha</a>
        <a href="https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent((q.name || sym).split(' ').slice(0,3).join(' '))}" target="_blank" class="btn btn-outline" title="ויקיפדיה — היסטוריית החברה, בעלות, ופעילות">📖 ויקיפדיה</a>
        ${sym.includes('.TA') ? `
        <a href="https://www.bizportal.co.il/capitalmarket/quote/generalview/${sym.replace('.TA','')}" target="_blank" class="btn btn-outline">🇮🇱 Bizportal</a>
        <a href="https://www.tase.co.il/he/market_data/security/${sym.replace('.TA','')}" target="_blank" class="btn btn-outline">🏛 הבורסה</a>
        <a href="https://maya.tase.co.il/company/${sym.replace('.TA','')}?view=reports" target="_blank" class="btn btn-outline">📄 דו״חות (מאי״ה)</a>
        ` : `
        <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${sym}&type=10-K&dateb=&owner=include&count=10" target="_blank" class="btn btn-outline">📄 SEC EDGAR</a>
        `}
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
