// ═══════════════════════════════════════════════════════════════════════════════
// DATA DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Auth & API Key Config ─────────────────────────────────────────────────
const NK_PASS = "920122";
const NK_KEYS = {
  td: "fac984fd95b643279e8a6d507a389886",
  fmp: "g5MmG673ei75anACkt6zBI1mZAjcn58b",
  fred: "ff008bbe0b491957a71206022b84b166",
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

const MACRO_FIELDS = [
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
  { key: "buffett_indicator", label: "Buffett Indicator", desc: "Total Market Cap / GDP · >100% = שוק יקר · currentmarketvaluation.com", type: "plain", manual: true },
  { key: "fear_greed", label: "Fear & Greed Index", desc: "0=פחד קיצוני, 100=חמדנות קיצונית · cnn.com/markets/fear-and-greed", type: "bar", manual: true },
  { key: "yield_10y_us", label: "תשואת 10Y US", desc: "ריבית ארוכה · עולה = לחץ על מניות", type: "plain" },
  { key: "yield_spread", label: "פער 10Y-2Y US", desc: "שלילי = אזהרת מיתון · מחושב אוטומטית מ-FRED", type: "spread" },
  { key: "put_call", label: "Put/Call Ratio", desc: ">1 דובי, <0.7 שורי · cboe.com", type: "plain", manual: true },
  { key: "credit_spread", label: "Credit Spread (HY)", desc: "פער תשואה בין אג״ח זבל לממשלתי · גבוה = סיכון", type: "plain", manual: true },
  { key: "margin_debt", label: "Margin Debt / GDP", desc: "רמת מינוף בשוק · גבוה = סיכון בועה · finra.org", type: "plain", manual: true },
  { key: "sp500_above_200ma", label: "% מניות מעל MA200", desc: "מעל 70% = שוק חזק, מתחת ל-30% = חולשה · ^SPXA200R", type: "plain" },
  { key: "us_dollar_index", label: "מדד הדולר (DXY)", desc: "דולר חזק = לחץ על שווקים מתפתחים", type: "plain" },
];

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
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCRAPING SOURCES (fallback for missing data)
// ═══════════════════════════════════════════════════════════════════════════════

const STOCK_ANALYSIS_BASE = "https://stockanalysis.com";
