// ═══════════════════════════════════════════════════════════════════════════════
// DATA DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const REGIONS = [
  { key: "US", name: "ארה״ב", flag: "🇺🇸" },
  { key: "EU", name: "אירופה", flag: "🇪🇺" },
  { key: "JP", name: "יפן", flag: "🇯🇵" },
  { key: "CN", name: "סין", flag: "🇨🇳" },
  { key: "IN", name: "הודו", flag: "🇮🇳" },
  { key: "IL", name: "ישראל", flag: "🇮🇱" },
  { key: "EM", name: "שווקים מתפתחים", flag: "🌐" },
];

const MACRO_FIELDS = [
  { key: "gdp_growth", label: "צמיחת GDP %", manual: true },
  { key: "inflation", label: "אינפלציה %", manual: false },
  { key: "interest_rate", label: "ריבית %", manual: false },
  { key: "unemployment", label: "אבטלה %", manual: false },
  { key: "pmi", label: "PMI", manual: true },
  { key: "debt_to_gdp", label: "חוב/תמ״ג %", manual: true },
  { key: "bond_10y", label: "תשואת אג״ח 10Y", manual: false },
];

const INDICES = [
  { sym: "SPY", key: "SPY", name: "S&P 500 (SPY)", region: "🇺🇸" },
  { sym: "QQQ", key: "QQQ", name: "Nasdaq 100 (QQQ)", region: "🇺🇸" },
  { sym: "DIA", key: "DIA", name: "Dow Jones (DIA)", region: "🇺🇸" },
  { sym: "IWM", key: "IWM", name: "Russell 2000 (IWM)", region: "🇺🇸" },
  { sym: "VGK", key: "VGK", name: "Europe (VGK)", region: "🇪🇺" },
  { sym: "EWJ", key: "EWJ", name: "Japan (EWJ)", region: "🇯🇵" },
  { sym: "FXI", key: "FXI", name: "China (FXI)", region: "🇨🇳" },
  { sym: "INDA", key: "INDA", name: "India (INDA)", region: "🇮🇳" },
  { sym: "EIS", key: "EIS", name: "Israel (EIS)", region: "🇮🇱" },
  { sym: "^TA125.TA", key: "TA125", name: "ת״א 125", region: "🇮🇱" },
  { sym: "TA35.TA", key: "TA35", name: "ת״א 35", region: "🇮🇱" },
  { sym: "EEM", key: "EEM", name: "MSCI EM (EEM)", region: "🌐" },
];

const INDEX_FIELDS = [
  { key: "price", label: "מחיר", color: false },
  { key: "ytd", label: "שינוי יומי % (מ-Close אתמול)", color: true },
  { key: "pe_current", label: "P/E נוכחי", color: false },
  { key: "pe_forward", label: "P/E עתידי", color: false, manual: true },
  { key: "shiller_cape", label: "Shiller CAPE", color: false, manual: true },
  { key: "div_yield", label: "תשואת דיב׳ %", color: false, manual: true },
];

const SECTORS = [
  "Technology","Healthcare","Financials","Energy","Consumer Discretionary",
  "Consumer Staples","Industrials","Materials","Real Estate","Utilities","Communication Services"
];

const SECTOR_ETFS = {
  "Technology": "XLK", "Healthcare": "XLV", "Financials": "XLF", "Energy": "XLE",
  "Consumer Discretionary": "XLY", "Consumer Staples": "XLP", "Industrials": "XLI",
  "Materials": "XLB", "Real Estate": "XLRE", "Utilities": "XLU", "Communication Services": "XLC"
};

const SECTOR_FIELDS = [
  { key: "ytd", label: "שינוי יומי % (מ-Close אתמול)", color: true },
  { key: "pe", label: "P/E", color: false },
  { key: "weight_sp500", label: "משקל S&P500 %", color: false, manual: true },
];

const COMMODITIES = [
  { sym: "USO", key: "CL", name: "נפט (USO ETF)", unit: "$/מנייה" },
  { sym: "GLD", key: "GC", name: "זהב (GLD ETF)", unit: "$/מנייה" },
  { sym: "SLV", key: "SI", name: "כסף (SLV ETF)", unit: "$/מנייה" },
  { sym: "CPER", key: "HG", name: "נחושת (CPER ETF)", unit: "$/מנייה" },
  { sym: "UNG", key: "NG", name: "גז טבעי (UNG ETF)", unit: "$/מנייה" },
  { sym: "DBA", key: "AG", name: "תוצרת חקלאית (DBA)", unit: "$/מנייה" },
  { sym: "BITO", key: "BTC", name: "ביטקוין (BITO ETF)", unit: "$/מנייה" },
];

const CURRENCIES = [
  { sym: "USDILS", yahoo: "USDILS=X", key: "USD/ILS", name: "דולר/שקל" },
  { sym: "EURUSD", yahoo: "EURUSD=X", key: "EUR/USD", name: "אירו/דולר" },
  { sym: "USDJPY", yahoo: "USDJPY=X", key: "USD/JPY", name: "דולר/ין" },
  { sym: "USDCNY", yahoo: "USDCNY=X", key: "USD/CNY", name: "דולר/יואן" },
  { sym: "GBPUSD", yahoo: "GBPUSD=X", key: "GBP/USD", name: "ליש״ט/דולר" },
  { sym: "EURILS", yahoo: "EURILS=X", key: "EUR/ILS", name: "אירו/שקל" },
];

const FEAR_INDICATORS = [
  { key: "vix", label: "VIX (מדד הפחד)", desc: "<20 רגוע, 20-30 חשש, >30 פאניקה · מתעדכן דרך VIXY ETF", type: "vix" },
  { key: "fear_greed", label: "Fear & Greed Index", desc: "0=פחד קיצוני, 100=חמדנות קיצונית · cnn.com/markets/fear-and-greed", type: "bar", manual: true },
  { key: "put_call", label: "Put/Call Ratio", desc: ">1 דובי, <0.7 שורי · cboe.com", type: "plain", manual: true },
  { key: "yield_10y_us", label: "תשואת 10Y US", desc: "ריבית ארוכה · cnbc.com/bonds", type: "plain", manual: true },
  { key: "yield_spread", label: "פער 10Y-2Y US", desc: "שלילי = אזהרת מיתון · fred.stlouisfed.org/series/T10Y2Y", type: "spread", manual: true },
  { key: "credit_spread", label: "Credit Spread (HY)", desc: "גבוה = סיכון מוגבר · fred.stlouisfed.org/series/BAMLH0A0HYM2", type: "plain", manual: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// FRED SERIES
// ═══════════════════════════════════════════════════════════════════════════════

const FRED_SERIES = {
  // US macro
  US_interest: "FEDFUNDS",
  US_inflation: "CPIAUCSL",
  US_unemployment: "UNRATE",
  // Israel macro
  IL_interest: "IRSTCB01ILM156N",
  IL_inflation: "ISRCPIALLMINMEI",
  // Europe
  EU_interest: "ECBMRRFR",
  EU_inflation: "EA19CPALTT01GYM",
  EU_unemployment: "LRHUTTTTEZM156S",
  // Japan
  JP_interest: "IRSTCB01JPM156N",
  JP_inflation: "JPNCPIALLMINMEI",
  JP_unemployment: "LRHUTTTTJPM156S",
  // China
  CN_interest: "IRSTCB01CNM156N",
  CN_inflation: "CHNCPIALLMINMEI",
};

const FRED_BOND_10Y = {
  US: "DGS10",
  EU: "IRLTLT01DEM156N",  // Germany 10Y as EU proxy
  JP: "IRLTLT01JPM156N",
  CN: "IRLTLT01CNM156N",
  IN: "INDIRLTLT01STM",
  IL: "ISRIRLTLT01STM",
};

// ═══════════════════════════════════════════════════════════════════════════════
// WORLD BANK
// ═══════════════════════════════════════════════════════════════════════════════

const WB_COUNTRIES = "USA;EUU;JPN;CHN;IND;ISR";
const WB_COUNTRY_MAP = { US: "US", EU: "EU", JP: "JP", CN: "CN", IN: "IN", IL: "IL" };
const WB_INDICATORS = {
  gdp_growth: "NY.GDP.MKTP.KD.ZG",
  inflation: "FP.CPI.TOTL.ZG",
  unemployment: "SL.UEM.TOTL.ZS",
};
