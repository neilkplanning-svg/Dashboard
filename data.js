// ═══════════════════════════════════════════════════════════════════════════════
// DATA DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Auth & API Key Config ─────────────────────────────────────────────────
const NK_PASS = "920122";
const NK_KEYS = {
  td: "fac984fd95b643279e8a6d507a389886",
  fmp: "g5MmG673ei75anACkt6zBI1mZAjcn58b",
  fred: "ff008bbe0b491957a71206022b84b166",
  av: "QNE64AX0O0JJWO9V",
  polygon: "cAw24Z7RRQJeCjoUYqni0WpfTT2L1apN",
};

// ── API Sources Registry ───────────────────────────────────────────────────
// tier: "auto" = no key / always on | "free" = free key | "paid" = paid
const API_SOURCES = [
  // ── Auto (no key needed) ──────────────────────────────────────────────
  {
    id: "yahoo", tier: "auto", name: "Yahoo Finance", priority: 10,
    url: "https://finance.yahoo.com",
    signupUrl: null,
    desc: "מחירים, מדדים, סחורות, מט״ח, P/E, היסטוריה",
    uses: "מדדים · סחורות · מטבעות · תיק · פחד",
    stateKey: null,
  },
  {
    id: "boi", tier: "auto", name: "בנק ישראל", priority: 9,
    url: "https://boi.org.il/he/economic-roles/financial-markets/exchange-rates/",
    signupUrl: null,
    desc: "שערי מטבע יציגים רשמיים (USD, EUR, GBP…)",
    uses: "מטבעות",
    stateKey: null,
  },
  {
    id: "wb", tier: "auto", name: "World Bank", priority: 8,
    url: "https://data.worldbank.org",
    signupUrl: null,
    desc: "GDP, אינפלציה, אבטלה, חוב/תמ״ג — שנתי",
    uses: "מאקרו",
    stateKey: null,
  },
  {
    id: "sa", tier: "auto", name: "Stock Analysis", priority: 7,
    url: "https://stockanalysis.com",
    signupUrl: null,
    desc: "P/E, מכפילים, ETFs, אנליסטים, מאזן",
    uses: "מדדים · סקרינר",
    stateKey: null,
  },
  {
    id: "multpl", tier: "auto", name: "multpl.com", priority: 6,
    url: "https://www.multpl.com",
    signupUrl: null,
    desc: "Shiller CAPE, P/E S&P500 היסטורי",
    uses: "מדדים · פחד",
    stateKey: null,
  },
  {
    id: "te", tier: "auto", name: "Trading Economics", priority: 5,
    url: "https://tradingeconomics.com/matrix",
    signupUrl: null,
    desc: "ריביות מרכזיות, אינפלציה, מאקרו גלובלי",
    uses: "מאקרו",
    stateKey: null,
  },
  // ── Free with key ─────────────────────────────────────────────────────
  {
    id: "fred", tier: "free", name: "FRED", priority: 4,
    url: "https://fred.stlouisfed.org",
    signupUrl: "https://fred.stlouisfed.org/docs/api/api_key.html",
    desc: "ריבית פד, אג״ח 10Y/2Y, CPI, מאקרו ארה״ב ועולמי",
    uses: "מאקרו · פחד · אג״ח",
    stateKey: "fredApiKey",
    placeholder: "הזן FRED API Key חינמי",
  },
  {
    id: "td", tier: "free", name: "Twelve Data", priority: 3,
    url: "https://twelvedata.com",
    signupUrl: "https://twelvedata.com/pricing",
    desc: "מחירים בזמן אמת, היסטוריה, מניות ו-ETF — 800 req/day",
    uses: "מדדים · סחורות (גיבוי)",
    stateKey: "tdApiKey",
    placeholder: "Twelve Data API Key",
  },
  {
    id: "av", tier: "free", name: "Alpha Vantage", priority: 2,
    url: "https://www.alphavantage.co",
    signupUrl: "https://www.alphavantage.co/support/#api-key",
    desc: "מניות, forex, technical indicators — 25 req/day",
    uses: "סקרינר (עתידי)",
    stateKey: "avApiKey",
    placeholder: "Alpha Vantage API Key",
  },
  {
    id: "polygon", tier: "free", name: "Polygon.io", priority: 1,
    url: "https://polygon.io",
    signupUrl: "https://polygon.io/dashboard/signup",
    desc: "מניות US, אופציות, crypto — Starter חינמי (delayed)",
    uses: "מדדים · סקרינר (עתידי)",
    stateKey: "polygonApiKey",
    placeholder: "Polygon.io API Key",
  },
  // ── Paid ──────────────────────────────────────────────────────────────
  {
    id: "fmp", tier: "paid", name: "FMP", priority: 0,
    url: "https://financialmodelingprep.com",
    signupUrl: "https://financialmodelingprep.com/developer/docs",
    desc: "פיננסים מלאים, סקטורים, DCF, SEC filings, income statement",
    uses: "סקטורים · סקרינר",
    stateKey: "apiKey",
    placeholder: "FMP API Key",
  },
  {
    id: "iex", tier: "paid", name: "IEX Cloud", priority: 0,
    url: "https://iexcloud.io",
    signupUrl: "https://iexcloud.io/pricing/",
    desc: "מניות US real-time, fundamentals, news — גם sandbox חינמי",
    uses: "מדדים · סקרינר (עתידי)",
    stateKey: "iexApiKey",
    placeholder: "IEX Cloud API Key",
  },
  {
    id: "nasdaq", tier: "paid", name: "NASDAQ Data Link", priority: 0,
    url: "https://data.nasdaq.com",
    signupUrl: "https://data.nasdaq.com/sign-up",
    desc: "נתונים כלכליים, commodities, אלטרנטיב דאטה",
    uses: "מאקרו (עתידי)",
    stateKey: "nasdaqApiKey",
    placeholder: "Quandl/NASDAQ API Key",
  },
  {
    id: "refinitiv", tier: "paid", name: "Refinitiv (LSEG)", priority: 0,
    url: "https://www.lseg.com/en/data-analytics/financial-data",
    signupUrl: "https://developers.refinitiv.com",
    desc: "Eikon, Workspace — נתוני מוסד מקצועיים",
    uses: "עתידי",
    stateKey: "refinitivApiKey",
    placeholder: "Refinitiv API Key",
  },
  {
    id: "bloomberg", tier: "paid", name: "Bloomberg API", priority: 0,
    url: "https://www.bloomberg.com/professional/",
    signupUrl: "https://www.bloomberg.com/professional/support/api-library/",
    desc: "Bloomberg Terminal API — Professional only",
    uses: "עתידי",
    stateKey: "bloombergApiKey",
    placeholder: "Bloomberg API Key",
  },
];

// ── Macro Regions ─────────────────────────────────────────────────────────
const REGIONS = [
  { key: "US", name: "ארה״ב", flag: "🇺🇸" },
  { key: "GB", name: "בריטניה", flag: "🇬🇧" },
  { key: "DE", name: "גרמניה", flag: "🇩🇪" },
  { key: "FR", name: "צרפת", flag: "🇫🇷" },
  { key: "JP", name: "יפן", flag: "🇯🇵" },
  { key: "CN", name: "סין", flag: "🇨🇳" },
  { key: "IN", name: "הודו", flag: "🇮🇳" },
  { key: "IL", name: "ישראל", flag: "🇮🇱" },
  { key: "BR", name: "ברזיל", flag: "🇧🇷" },
  { key: "KR", name: "קוריאה", flag: "🇰🇷" },
  { key: "MX", name: "מקסיקו", flag: "🇲🇽" },
  { key: "TR", name: "טורקיה", flag: "🇹🇷" },
];

// ── Market trading hours (for live open/close indicator) ──────────────────
// times in local exchange timezone (HH:MM). Days: 0=Sun, 1=Mon, … 6=Sat.
// Israel's TASE runs Sunday-Thursday (unique); everyone else Mon-Fri.
const MARKET_HOURS = {
  US: { name: "NYSE/NASDAQ",   tz: "America/New_York",   open: "09:30", close: "16:00", days: [1,2,3,4,5] },
  GB: { name: "LSE",           tz: "Europe/London",      open: "08:00", close: "16:30", days: [1,2,3,4,5] },
  DE: { name: "XETRA",         tz: "Europe/Berlin",      open: "09:00", close: "17:30", days: [1,2,3,4,5] },
  FR: { name: "Euronext Paris",tz: "Europe/Paris",       open: "09:00", close: "17:30", days: [1,2,3,4,5] },
  JP: { name: "TSE",           tz: "Asia/Tokyo",         open: "09:00", close: "15:00", days: [1,2,3,4,5], lunch: ["11:30","12:30"] },
  CN: { name: "SSE",           tz: "Asia/Shanghai",      open: "09:30", close: "15:00", days: [1,2,3,4,5], lunch: ["11:30","13:00"] },
  IN: { name: "NSE",           tz: "Asia/Kolkata",       open: "09:15", close: "15:30", days: [1,2,3,4,5] },
  IL: { name: "TASE",          tz: "Asia/Jerusalem",     open: "09:45", close: "17:25", days: [0,1,2,3,4] }, // Sun-Thu
  BR: { name: "B3",            tz: "America/Sao_Paulo",  open: "10:00", close: "17:00", days: [1,2,3,4,5] },
  KR: { name: "KRX",           tz: "Asia/Seoul",         open: "09:00", close: "15:30", days: [1,2,3,4,5] },
  MX: { name: "BMV",           tz: "America/Mexico_City",open: "08:30", close: "15:00", days: [1,2,3,4,5] },
  TR: { name: "BIST",          tz: "Europe/Istanbul",    open: "10:00", close: "18:00", days: [1,2,3,4,5] },
};

const MACRO_FIELDS = [
  { key: "gdp_absolute", label: "תמ״ג (USD)", manual: false, fmt: "gdp" },
  { key: "gdp_per_capita", label: "תמ״ג לנפש (USD)", manual: false, fmt: "money" },
  { key: "gdp_growth", label: "צמיחת GDP %", manual: false },
  { key: "inflation", label: "אינפלציה %", manual: false },
  { key: "interest_rate", label: "ריבית %", manual: false },
  { key: "unemployment", label: "אבטלה %", manual: false },
  { key: "debt_to_gdp", label: "חוב/תמ״ג %", manual: false },
  { key: "bond_10y", label: "תשואת אג״ח 10Y", manual: false },
];

// ── Indices ───────────────────────────────────────────────────────────────
const INDICES = [
  { sym: "SPY",        key: "SPY",   name: "S&P 500 (SPY)",       region: "🇺🇸", sa: "spy", saType: "e" },
  { sym: "QQQ",        key: "QQQ",   name: "Nasdaq 100 (QQQ)",    region: "🇺🇸", sa: "qqq", saType: "e" },
  { sym: "DIA",        key: "DIA",   name: "Dow Jones (DIA)",      region: "🇺🇸", sa: "dia", saType: "e" },
  { sym: "IWM",        key: "IWM",   name: "Russell 2000 (IWM)",   region: "🇺🇸", sa: "iwm", saType: "e" },
  { sym: "EWU",        key: "EWU",   name: "UK (EWU)",             region: "🇬🇧", sa: "ewu", saType: "e" },
  { sym: "EWG",        key: "EWG",   name: "Germany (EWG)",        region: "🇩🇪", sa: "ewg", saType: "e" },
  { sym: "EWQ",        key: "EWQ",   name: "France (EWQ)",         region: "🇫🇷", sa: "ewq", saType: "e" },
  { sym: "EWJ",        key: "EWJ",   name: "Japan (EWJ)",          region: "🇯🇵", sa: "ewj", saType: "e" },
  { sym: "FXI",        key: "FXI",   name: "China (FXI)",          region: "🇨🇳", sa: "fxi", saType: "e" },
  { sym: "INDA",       key: "INDA",  name: "India (INDA)",         region: "🇮🇳", sa: "inda", saType: "e" },
  { sym: "EIS",        key: "EIS",   name: "Israel (EIS)",         region: "🇮🇱", sa: "eis", saType: "e" },
  { sym: "^TA125.TA",  key: "TA125", name: "ת״א 125",             region: "🇮🇱" },
  { sym: "TA35.TA",    key: "TA35",  name: "ת״א 35",              region: "🇮🇱" },
  { sym: "EEM",        key: "EEM",   name: "MSCI EM (EEM)",        region: "🌐", sa: "eem", saType: "e" },
];

// Tracking funds per index (ILS + USD)
const INDEX_FUNDS = {
  SPY:   { usd: ["VOO","IVV","SPLG"], ils: ["מגדל S&P500 1159218","הראל S&P500 1159226"] },
  QQQ:   { usd: ["QQQM","ONEQ"], ils: ["מגדל נאסדק 1159234"] },
  DIA:   { usd: ["DIA"], ils: [] },
  IWM:   { usd: ["VTWO","IWM"], ils: [] },
  EWU:   { usd: ["EWU","FLGB"], ils: [] },
  EWG:   { usd: ["EWG"], ils: [] },
  EWQ:   { usd: ["EWQ"], ils: [] },
  EWJ:   { usd: ["EWJ","DXJ"], ils: [] },
  FXI:   { usd: ["FXI","MCHI","KWEB"], ils: [] },
  INDA:  { usd: ["INDA","SMIN"], ils: [] },
  EIS:   { usd: ["EIS"], ils: [] },
  TA125: { usd: [], ils: ["תכלית ת״א 125","מגדל ת״א 125"] },
  TA35:  { usd: [], ils: ["תכלית ת״א 35","הראל ת״א 35"] },
  EEM:   { usd: ["EEM","VWO","IEMG"], ils: ["מגדל שווקים מתפתחים"] },
};

// Best-effort fallback long-term averages — used only when live source has no value.
// User can override any field (manual cells). Values are approximate market consensus
// (Bloomberg/MSCI/Siblis Research, late 2024–early 2026 era).
const INDEX_PE_DEFAULTS = {
  SPY:   { pe_historical_avg: "16.50", shiller_cape: "33.00", pe_forward: "21.50" },
  QQQ:   { pe_historical_avg: "25.00", shiller_cape: "37.00", pe_forward: "27.00" },
  DIA:   { pe_historical_avg: "17.00", shiller_cape: "27.00", pe_forward: "19.50" },
  IWM:   { pe_historical_avg: "22.00", shiller_cape: "25.00", pe_forward: "17.50" },
  EWU:   { pe_historical_avg: "14.00", shiller_cape: "17.00", pe_forward: "12.00" },
  EWG:   { pe_historical_avg: "14.00", shiller_cape: "18.00", pe_forward: "13.50" },
  EWQ:   { pe_historical_avg: "15.00", shiller_cape: "22.00", pe_forward: "14.00" },
  EWJ:   { pe_historical_avg: "16.00", shiller_cape: "22.00", pe_forward: "15.00" },
  FXI:   { pe_historical_avg: "12.00", shiller_cape: "12.00", pe_forward: "10.00" },
  INDA:  { pe_historical_avg: "20.00", shiller_cape: "26.00", pe_forward: "22.00" },
  EIS:   { pe_historical_avg: "14.00", shiller_cape: "18.00", pe_forward: "14.50" },
  TA125: { pe_historical_avg: "13.50", shiller_cape: "18.00", pe_forward: "12.50" },
  TA35:  { pe_historical_avg: "12.50", shiller_cape: "16.00", pe_forward: "11.50" },
  EEM:   { pe_historical_avg: "14.00", shiller_cape: "15.00", pe_forward: "12.50" },
};

const INDEX_FIELDS = [
  { key: "price", label: "מחיר", color: false },
  { key: "ytd", label: "שינוי יומי %", color: true, tooltip: "שינוי מ-Close אתמול" },
  { key: "change_ytd", label: "שינוי מתחילת שנה %", color: true },
  { key: "change_12m", label: "שינוי 12 חודשים %", color: true },
  { key: "pct_from_high_10y", label: "מרחק משיא 10Y %", color: true },
  { key: "pct_from_low_1y", label: "מרחק משפל שנתי %", color: true },
  { key: "pe_current", label: "P/E נוכחי", color: false },
  { key: "pe_forward", label: "P/E עתידי", color: false },
  { key: "pe_historical_avg", label: "P/E ממוצע היסטורי", color: false, manual: true },
  { key: "shiller_cape", label: "Shiller CAPE", color: false, manual: true },
  { key: "ref_change", label: "שינוי מרפרנס %", color: true, ref: true },
];

// ── Sectors by Region ─────────────────────────────────────────────────────
const SECTOR_REGIONS = {
  US: {
    label: "🇺🇸 ארה״ב",
    sectors: [
      { name: "Technology", etf: "XLK", funds: { usd: ["VGT","IYW"], ils: [] } },
      { name: "Healthcare", etf: "XLV", funds: { usd: ["VHT","IYH"], ils: [] } },
      { name: "Financials", etf: "XLF", funds: { usd: ["VFH","IYF"], ils: [] } },
      { name: "Energy", etf: "XLE", funds: { usd: ["VDE","IYE"], ils: [] } },
      { name: "Consumer Discretionary", etf: "XLY", funds: { usd: ["VCR"], ils: [] } },
      { name: "Consumer Staples", etf: "XLP", funds: { usd: ["VDC"], ils: [] } },
      { name: "Industrials", etf: "XLI", funds: { usd: ["VIS"], ils: [] } },
      { name: "Materials", etf: "XLB", funds: { usd: ["VAW"], ils: [] } },
      { name: "Real Estate", etf: "XLRE", funds: { usd: ["VNQ","IYR"], ils: [] } },
      { name: "Utilities", etf: "XLU", funds: { usd: ["VPU"], ils: [] } },
      { name: "Communication Services", etf: "XLC", funds: { usd: ["VOX"], ils: [] } },
    ],
  },
  EU: {
    label: "🇪🇺 אירופה",
    sectors: [
      { name: "Technology", etf: "IUIT.L", funds: { usd: ["IXN"], ils: [] } },
      { name: "Healthcare", etf: "IUHC.L", funds: { usd: [], ils: [] } },
      { name: "Financials", etf: "EUFN", funds: { usd: ["EUFN"], ils: [] } },
      { name: "Energy", etf: "IXC", funds: { usd: [], ils: [] } },
      { name: "Industrials", etf: "EXI", funds: { usd: [], ils: [] } },
      { name: "Consumer Staples", etf: "KXI", funds: { usd: [], ils: [] } },
      { name: "Real Estate", etf: "IFEU.L", funds: { usd: [], ils: [] } },
      { name: "Utilities", etf: "JXI", funds: { usd: [], ils: [] } },
    ],
  },
  IL: {
    label: "🇮🇱 ישראל",
    sectors: [
      { name: "בנקים", etf: "TA35.TA", funds: { usd: [], ils: ["תכלית בנקים","הראל בנקים"] } },
      { name: "טכנולוגיה", etf: "^TA125.TA", funds: { usd: [], ils: ["תכלית טכנולוגיה"] } },
      { name: "נדל״ן ובינוי", etf: "^TA125.TA", funds: { usd: [], ils: ["תכלית נדלן ובינוי"] } },
      { name: "נפט וגז", etf: "^TA125.TA", funds: { usd: [], ils: [] } },
      { name: "ביטוח", etf: "^TA125.TA", funds: { usd: [], ils: [] } },
      { name: "קמעונאות ומזון", etf: "^TA125.TA", funds: { usd: [], ils: [] } },
    ],
  },
  CN: {
    label: "🇨🇳 סין",
    sectors: [
      { name: "Technology", etf: "CQQQ", funds: { usd: ["CQQQ","KWEB"], ils: [] } },
      { name: "Financials", etf: "CHIX", funds: { usd: ["GXC"], ils: [] } },
      { name: "Consumer Discretionary", etf: "CHIQ", funds: { usd: ["CHIQ"], ils: [] } },
      { name: "Healthcare", etf: "CHIH", funds: { usd: [], ils: [] } },
      { name: "Real Estate", etf: "TAO", funds: { usd: ["TAO"], ils: [] } },
      { name: "Energy", etf: "CHIE", funds: { usd: [], ils: [] } },
      { name: "Industrials", etf: "CHII", funds: { usd: [], ils: [] } },
    ],
  },
};

// Active region for sector view (default: US)
let SECTOR_ACTIVE_REGION = "US";

// Computed — gets current region's sectors
function getCurrentSectors() {
  const region = SECTOR_REGIONS[SECTOR_ACTIVE_REGION];
  if (!region) return [];
  return region.sectors.map(s => ({ ...s, region: region.label }));
}

function getCurrentSectorETFs() {
  const result = {};
  const region = SECTOR_REGIONS[SECTOR_ACTIVE_REGION];
  if (!region) return result;
  region.sectors.forEach(s => { result[s.name] = s.etf; });
  return result;
}

// Legacy compat
const SECTORS = getCurrentSectors();
const SECTOR_ETFS = getCurrentSectorETFs();

const SECTOR_FIELDS = [
  { key: "region", label: "אזור", color: false },
  { key: "ytd", label: "שינוי יומי %", color: true, tooltip: "שינוי מ-Close אתמול" },
  { key: "change_ytd", label: "שינוי מתחילת שנה %", color: true },
  { key: "change_12m", label: "שינוי 12 חודשים %", color: true },
  { key: "pe", label: "P/E", color: false },
  { key: "funds", label: "קרנות מחקות", color: false },
];

// ── Commodities ───────────────────────────────────────────────────────────
const COMMODITIES = [
  { sym: "USO", key: "CL", name: "נפט (USO ETF)", unit: "$/מנייה" },
  { sym: "GLD", key: "GC", name: "זהב (GLD ETF)", unit: "$/מנייה" },
  { sym: "SLV", key: "SI", name: "כסף (SLV ETF)", unit: "$/מנייה" },
  { sym: "CPER", key: "HG", name: "נחושת (CPER ETF)", unit: "$/מנייה" },
  { sym: "UNG", key: "NG", name: "גז טבעי (UNG ETF)", unit: "$/מנייה" },
  { sym: "DBA", key: "AG", name: "תוצרת חקלאית (DBA)", unit: "$/מנייה" },
  { sym: "BITO", key: "BTC", name: "ביטקוין (BITO ETF)", unit: "$/מנייה" },
];

// ── Currencies ────────────────────────────────────────────────────────────
const CURRENCIES = [
  { sym: "USDILS", yahoo: "USDILS=X", key: "USD/ILS", name: "דולר/שקל", direct: true },
  { sym: "EURILS", yahoo: "EURILS=X", key: "EUR/ILS", name: "אירו/שקל", direct: true },
  { sym: "GBPILS", yahoo: "GBPILS=X", key: "GBP/ILS", name: "ליש״ט/שקל", direct: true },
  { sym: "JPYILS", yahoo: null, key: "JPY/ILS", name: "ין/שקל (100 ין)", cross: ["USDJPY=X", "USDILS=X"], crossCalc: "ils_div_rate" },
  { sym: "CNYILS", yahoo: null, key: "CNY/ILS", name: "יואן/שקל", cross: ["USDCNY=X", "USDILS=X"], crossCalc: "ils_div_rate" },
  { sym: "CHFILS", yahoo: "CHFILS=X", key: "CHF/ILS", name: "פרנק שוויצרי/שקל", direct: true },
  { sym: "AUDILS", yahoo: null, key: "AUD/ILS", name: "דולר אוסטרלי/שקל", cross: ["AUDUSD=X", "USDILS=X"], crossCalc: "usd_mult" },
];

// ── Fear & Sentiment (Buffett-inspired) ───────────────────────────────────
const FEAR_INDICATORS = [
  { key: "vix", label: "VIX (מדד הפחד)", desc: "<20 רגוע, 20-30 חשש, >30 פאניקה", type: "vix" },
  { key: "buffett_indicator", label: "Buffett Indicator", desc: "Wilshire 5000 / GDP · >100% = שוק יקר · מחושב מ-FRED", type: "plain" },
  { key: "fear_greed", label: "Fear & Greed Index", desc: "0=פחד קיצוני, 100=חמדנות קיצונית · cnn.com/markets/fear-and-greed", type: "bar" },
  { key: "yield_10y_us", label: "תשואת 10Y US", desc: "ריבית ארוכה · עולה = לחץ על מניות", type: "plain" },
  { key: "yield_spread", label: "פער 10Y-2Y US", desc: "שלילי = אזהרת מיתון · מחושב אוטומטית מ-FRED", type: "spread" },
  { key: "put_call", label: "Put/Call Ratio", desc: ">1 דובי, <0.7 שורי · cboe.com", type: "plain", manual: true },
  { key: "credit_spread", label: "Credit Spread (HY)", desc: "פער תשואה בין אג״ח זבל לממשלתי · BAML HY OAS מ-FRED", type: "plain" },
  { key: "margin_debt", label: "Margin Debt / GDP", desc: "רמת מינוף בשוק · BOGZ1FL663067003Q / GDP מ-FRED", type: "plain" },
  { key: "sp500_above_200ma", label: "% מניות מעל MA200", desc: "מעל 70% = שוק חזק, מתחת ל-30% = חולשה · ^SPXA200R", type: "plain" },
  { key: "us_dollar_index", label: "מדד הדולר (DXY)", desc: "דולר חזק = לחץ על שווקים מתפתחים", type: "plain" },
];

// ── Info modal content (click-to-explain) ─────────────────────────────────
const METRIC_INFO = {
  ev_ebitda: {
    title: "EV/EBITDA",
    what: "Enterprise Value ÷ EBITDA — מכפיל שווי עסקי (שווי שוק + חוב נטו) לרווח התפעולי לפני ריבית, מיסים, פחת והפחתות. אחד המדדים החשובים ביותר להערכת שווי של חברות תעשייתיות ובסיסיות.",
    how: "EV = שווי שוק + חוב כולל − מזומן. EBITDA = Earnings Before Interest, Taxes, Depreciation, and Amortization. הנתונים נשלפים מ-Yahoo Finance (enterpriseToEbitda) ו-stockanalysis.com.",
    range: "מתחת ל-10: זול (לפי ענף). 10–15: סביר. מעל 15: יקר. חברות טק בצמיחה גבוהה יכולות להיסחר ב-20–30. השווה תמיד מול חברות באותו סקטור.",
    use: "מדד מועדף על M&A ואנליסטי בנקי השקעות. לא מושפע ממבנה הון (חוב/הון) כמו P/E — ולכן טוב להשוות חברות עם רמות מינוף שונות. חלש עבור בנקים ופיננסים.",
    src: "Yahoo Finance · stockanalysis.com",
  },
  pe_forward: {
    title: "P/E עתידי (Forward P/E)",
    what: "יחס המחיר הנוכחי של המדד/המניה לרווח הצפוי ל-12 החודשים הבאים (EPS Forward), בהתבסס על תחזיות האנליסטים.",
    how: "Forward P/E = מחיר / ממוצע EPS אנליסטים ל-4 רבעונים הבאים. הנתון נשלף בזמן אמת מ-Yahoo Finance (v7/v10) ו-stockanalysis.com. עבור מדדים ללא נתון חי משתמשים בערכי ברירת מחדל (ניתן לעריכה ידנית).",
    range: "Forward P/E בדרך כלל נמוך מ-Trailing P/E כי הרווחים צפויים לעלות. טווחים אופייניים: 15–18 S&P 500; 22–27 Nasdaq 100 (QQQ); 10–13 שווקים מתפתחים.",
    use: "מעיד על מה השוק צופה קדימה — ציפיות גבוהות לצמיחה מיתרגמות ל-Forward P/E גבוה. אם Forward נמוך משמעותית מ-Trailing, האנליסטים מצפים לזינוק ברווחים. Forward גבוה מ-Trailing = ציפייה לירידת רווחים.",
    src: "Yahoo Finance · stockanalysis.com · אנליסטי Wall Street",
  },
  pe_historical_avg: {
    title: "P/E ממוצע היסטורי",
    what: "היחס הממוצע ארוך-טווח בין מחיר המדד לרווחי החברות המרכיבות אותו (Trailing 12M).",
    how: "עבור S&P 500 מחושב ונשלף בזמן אמת מ-multpl.com (Mean מאז 1871). עבור יתר המדדים מוצגים ערכי ברירת מחדל מבוססי קונצנזוס שוק (Bloomberg, MSCI, Siblis Research) לעשור האחרון — ניתן לעריכה ידנית.",
    range: "טווח אופייני: 14–18 לשוקי הון מפותחים; 11–14 לשווקים מתפתחים; 22–26 למדדי טכנולוגיה (QQQ).",
    use: "השוואת P/E נוכחי מול ממוצע היסטורי מספקת אינדיקציה גסה של זולות/יוקרה: נוכחי מעל הממוצע = יקר יחסית; מתחת = זול יחסית.",
    src: "multpl.com · Bloomberg · MSCI · ברירת מחדל לעריכה ידנית",
  },
  shiller_cape: {
    title: "Shiller CAPE (מכפיל שילר)",
    what: "Cyclically Adjusted P/E — מכפיל רווח מתואם מחזורית, שפיתח פרופ׳ רוברט שילר (זוכה פרס נובל 2013).",
    how: "מחושב כמחיר נוכחי של המדד (במונחים ריאליים) חלקי ממוצע הרווחים ל-10 שנים האחרונות, מתואם אינפלציה. הנוסחה מנטרלת תנודות מחזוריות ברווחי חברות.",
    range: "ממוצע היסטורי של S&P 500 מאז 1871: כ-17. מעל 25 נחשב יקר; מעל 30 אזהרה רצינית (2000: 44, 2007: 27, 2021: 38).",
    use: "מדד לא-טיימינג: לא מראה מתי השוק ייפול, אלא מה התשואה הריאלית הצפויה ל-10 שנים. CAPE גבוה ← תשואות נמוכות קדימה.",
    src: "multpl.com/shiller-pe · Yale / Robert Shiller",
  },
  vix: {
    title: "VIX — מדד התנודתיות",
    what: "‘Volatility Index’ של בורסת CBOE. המדד החשוב ביותר לפחד בשווקים — מכונה ‘מד הפחד’ של וול סטריט.",
    how: "מחושב ע״י CBOE מהתמחור של אופציות Call ו-Put על S&P 500 ל-30 יום קדימה, בנוסחה מתמטית המבטאת תנודתיות משתמעת (Implied Volatility).",
    range: "מתחת ל-15: שוק רגוע; 15–20: נורמלי; 20–30: דאגה; 30–40: פחד; מעל 40: פאניקה (קורונה 2020: 82, GFC 2008: 89).",
    use: "קורלציה שלילית עם S&P 500 — VIX עולה כשמניות יורדות. ערכים קיצוניים מעל 40 היוו היסטורית הזדמנויות קנייה.",
    src: "Yahoo Finance (^VIX) · CBOE",
  },
  buffett_indicator: {
    title: "Buffett Indicator",
    what: "היחס בין שווי השוק הכולל של מניות אמריקאיות (Wilshire 5000) לבין התוצר המקומי הגולמי (GDP). וורן באפט כינה אותו ‘המדד הטוב ביותר להערכת שוויו של השוק’.",
    how: "Wilshire 5000 Price Index (מייצג שווי שוק כולל) × 1.05 (התאמה) / GDP × 100. מחושב מנתוני FRED.",
    range: "היסטורית: 50–75 זול; 75–90 הוגן; 90–115 יקר; מעל 115 מאוד יקר (2000: 145, 2021: 200+, היסטורי מעל 30Y).",
    use: "‘מעל 100% — השוק יקר. מתחת ל-50% — הזדמנות של דור.’ — באפט. כלי ארוך-טווח, לא לטיימינג קצר.",
    src: "FRED: WILL5000PRFC / GDP",
  },
  fear_greed: {
    title: "Fear & Greed Index (CNN)",
    what: "מדד סנטימנט מורכב של CNN Business, משלב 7 מרכיבים למספר בודד 0–100 המבטא את מצב הרוח בשוק.",
    how: "7 מרכיבים: 1) מומנטום מחיר (S&P מול MA125), 2) חוזק מחיר (שיאים חדשים), 3) רוחב מחיר (אדוונסים/דיקליינים), 4) Put/Call ratio, 5) תנודתיות (VIX), 6) ביקוש ל-junk bonds, 7) ביקוש לסייף הייבן (אג״ח מול מניות).",
    range: "0–24 פחד קיצוני · 25–44 פחד · 45–55 ניטרלי · 56–74 חמדנות · 75–100 חמדנות קיצונית.",
    use: "Contrarian indicator — ערכי פחד קיצוני היסטורית היו הזדמנויות קנייה; חמדנות קיצונית הייתה סימן לצמצום סיכון.",
    src: "production.dataviz.cnn.io/index/fearandgreed",
  },
  yield_10y_us: {
    title: "תשואת אג״ח ממשלתי US 10Y",
    what: "הריבית השנתית שעל ארה״ב לשלם על אג״ח ממשלתיות ל-10 שנים. הבנצ׳מרק המרכזי לריביות ארוכות עולמיות.",
    how: "נשלף מ-Yahoo (^TNX) — המחיר של Treasury Note החדש ביותר. משתקף מ-CME ו-FRED (DGS10).",
    range: "שפל היסטורי 2020: 0.5%. ממוצע 50Y: כ-6%. רמה ‘נורמלית’ נוכחית: 3.5–4.5%.",
    use: "עלייה = לחץ על שוק מניות (חלופה מושכת יותר) + עלייה בעלויות מימון. ירידה = הקלה מוניטרית, סימן לחולשה כלכלית.",
    src: "Yahoo ^TNX · FRED DGS10",
  },
  yield_spread: {
    title: "פער תשואות 10Y-2Y (Yield Curve)",
    what: "ההפרש בין תשואת אג״ח ממשלתי US 10 שנים ובין 2 שנים. מדד קלאסי לציפיות למיתון.",
    how: "DGS10 − DGS2 מ-FRED. כשהערך שלילי (‘עקום הפוך’) — המשקיעים דורשים ריבית גבוהה יותר לטווח קצר מאשר ארוך.",
    range: "חיובי (טבעי): 1.0–2.5. אפס = סימן אזהרה. שלילי = אזהרת מיתון קלאסית (שמע הפוך ב-2000, 2006, 2019, 2022).",
    use: "כל עקום הפוך מאז 1955 חזה מיתון תוך 6–24 חודשים. כשהעקום חוזר להיות חיובי — לרוב המיתון כבר התחיל.",
    src: "FRED: DGS10 − DGS2",
  },
  put_call: {
    title: "Put/Call Ratio",
    what: "היחס בין נפח אופציות Put (הימור ירידה) לבין Call (הימור עלייה). נמדד ע״י CBOE יומית.",
    how: "חישוב: סה״כ נפח Puts יומי / סה״כ נפח Calls. מדווח נפרד למדדי שוק ולמניות.",
    range: "ממוצע: 0.7–0.9. מעל 1.0 = רוב הסוחרים דוביים; מתחת ל-0.5 = אופוריה/ביטחון מופרז.",
    use: "Contrarian: ערכים קיצוניים סימנים למהלך הפוך. שיא 2020 מרץ: 1.28 (קרקעית השוק). תחתיות יולי 2021: 0.40 (טרום ירידה).",
    src: "cboe.com/us/options/market_statistics (ידני)",
  },
  credit_spread: {
    title: "Credit Spread (HY)",
    what: "הפער בין תשואת אג״ח קונצרני High-Yield (‘אג״ח זבל’) לבין אג״ח ממשלתי. מדד מרכזי ללחצי אשראי.",
    how: "ICE BofA US High Yield Master II Option-Adjusted Spread (BAMLH0A0HYM2) מ-FRED. בנקודות אחוז מעל Treasury.",
    range: "תקופות רגיעה: 3–4.5% · לחץ: 5–7% · משבר: 10%+ (2008: 21%, קורונה מרץ 2020: 10.8%).",
    use: "עלייה חדה מסמנת שמשקיעים מחייבים פרמיית סיכון גבוהה יותר → תנאי אשראי נוקשים → לחץ על צמיחה וכלכלה.",
    src: "FRED BAMLH0A0HYM2",
  },
  margin_debt: {
    title: "Margin Debt / GDP",
    what: "היקף חוב המימון הזמין לקניית מניות של משקיעים קמעונאיים ומוסדיים, נרמל כאחוז מהתמ״ג.",
    how: "Nonfinancial Corporate Business Margin Debt (BOGZ1FL663067003Q) / GDP × 100 מ-FRED. רבעוני.",
    range: "שפל: 1.5%. ממוצע: 2.5%. שיאים היסטוריים: 3.5%+ (2000, 2007, 2021) — תמיד לפני תיקונים גדולים.",
    use: "‘סמן מוקדם’ של בועות. רמות גבוהות מסמנות מינוף מוגזם; ירידה חדה מסמנת margin calls ומכירות כפויות.",
    src: "FRED BOGZ1FL663067003Q / GDP",
  },
  sp500_above_200ma: {
    title: "% מניות S&P 500 מעל MA200",
    what: "אחוז מניות ה-S&P 500 הנסחרות מעל הממוצע הנע של 200 הימים האחרונים שלהן. מדד רוחב שוק (Market Breadth).",
    how: "Yahoo ^SPXA200R — נמדד יומית ע״י בורסת נאסד״ק/CBOE. מחושב כמספר מניות שסגרו מעל MA200 חלקי 500.",
    range: "מעל 70% = שוק בריא ורחב; 40–60% = ניטרלי; מתחת ל-30% = חולשה; מתחת ל-15% = oversold היסטורי.",
    use: "סימן לחוזק/חולשה אמיתי. שוק עולה עם רוחב נמוך (‘narrow rally’) = פגיעה; רוחב רחב = בריא.",
    src: "Yahoo ^SPXA200R · NYSE",
  },
  us_dollar_index: {
    title: "DXY — מדד הדולר האמריקאי",
    what: "מדד משוקלל של ערך הדולר מול סל 6 מטבעות של שותפות סחר עיקריות: EUR (57.6%), JPY (13.6%), GBP (11.9%), CAD (9.1%), SEK (4.2%), CHF (3.6%).",
    how: "מפורסם ע״י ICE. ערך בסיס 100 ב-1973. נשלף מ-Yahoo (DX-Y.NYB).",
    range: "50Y טווח: 70–120. ‘חלש’: מתחת ל-90. ‘חזק’: מעל 105. שיא 2022: 114.",
    use: "דולר חזק פוגע: 1) בחברות US exportות, 2) במטבעות EM ושווקים מתפתחים, 3) במחירי סחורות (מקובלות במט״ח); מחליש את רווחי החברות הגלובליות.",
    src: "Yahoo DX-Y.NYB · ICE",
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// FRED SERIES
// ═══════════════════════════════════════════════════════════════════════════════

const FRED_SERIES = {
  US_interest: "FEDFUNDS", US_inflation: "CPIAUCSL", US_unemployment: "UNRATE",
  IL_interest: "IRSTCB01ILM156N", IL_inflation: "ISRCPIALLMINMEI",
  GB_interest: "IRSTCB01GBM156N", GB_inflation: "GBRCPIALLMINMEI", GB_unemployment: "LRHUTTTTGBM156S",
  DE_inflation: "DEUCPIALLMINMEI", DE_unemployment: "LRHUTTTTDEM156S",
  FR_inflation: "FRACPIALLMINMEI", FR_unemployment: "LRHUTTTTFRM156S",
  JP_interest: "IRSTCB01JPM156N", JP_inflation: "JPNCPIALLMINMEI", JP_unemployment: "LRHUTTTTJPM156S",
  CN_interest: "IRSTCB01CNM156N", CN_inflation: "CHNCPIALLMINMEI",
  BR_interest: "IRSTCB01BRM156N", BR_inflation: "BRACPIALLMINMEI",
  KR_interest: "IRSTCB01KRM156N", KR_inflation: "KORCPIALLMINMEI",
  MX_interest: "IRSTCB01MXM156N", MX_inflation: "MEXCPIALLMINMEI",
  TR_interest: "IRSTCB01TRM156N", TR_inflation: "TURCPIALLMINMEI",
};

const FRED_BOND_10Y = {
  US: "DGS10",
  GB: "IRLTLT01GBM156N",
  DE: "IRLTLT01DEM156N",
  FR: "IRLTLT01FRM156N",
  JP: "IRLTLT01JPM156N",
  CN: "IRLTLT01CNM156N",
  IN: "INDIRLTLT01STM",
  IL: "ISRIRLTLT01STM",
  BR: "IRLTLT01BRM156N",
  KR: "IRLTLT01KRM156N",
  MX: "IRLTLT01MXM156N",
  TR: "IRLTLT01TRM156N",
};

// ═══════════════════════════════════════════════════════════════════════════════
// WORLD BANK
// ═══════════════════════════════════════════════════════════════════════════════

const WB_COUNTRIES = "USA;GBR;DEU;FRA;JPN;CHN;IND;ISR;BRA;KOR;MEX;TUR";
const WB_COUNTRY_MAP = { USA: "US", GBR: "GB", DEU: "DE", FRA: "FR", JPN: "JP", CHN: "CN", IND: "IN", ISR: "IL", BRA: "BR", KOR: "KR", MEX: "MX", TUR: "TR" };
const WB_INDICATORS = {
  gdp_growth: "NY.GDP.MKTP.KD.ZG",
  inflation: "FP.CPI.TOTL.ZG",
  unemployment: "SL.UEM.TOTL.ZS",
  debt_to_gdp: "GC.DOD.TOTL.GD.ZS",
  gdp_absolute: "NY.GDP.MKTP.CD",       // GDP current USD
  gdp_per_capita: "NY.GDP.PCAP.CD",     // GDP per capita current USD
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCRAPING SOURCES (fallback for missing data)
// ═══════════════════════════════════════════════════════════════════════════════

const STOCK_ANALYSIS_BASE = "https://stockanalysis.com";
