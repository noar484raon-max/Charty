// ─── Financial Modeling Prep (FMP) + Yahoo Finance Fallback ───
// FMP API: 무료 250req/day, PER/PBR/PSR/시가총액 등 제공
// Yahoo Finance v8 chart meta: 52주 범위 fallback

const FMP_KEY = process.env.FMP_API_KEY || "";

type CacheEntry = { data: any; ts: number };
const fCache = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60_000; // 10분

function getCached(key: string): any | null {
  const entry = fCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key: string, data: any) {
  fCache.set(key, { data, ts: Date.now() });
  if (fCache.size > 100) {
    const oldest = fCache.keys().next().value;
    if (oldest) fCache.delete(oldest);
  }
}

// ─── 심볼 변환 ───

function toFMPSymbol(symbol: string, type: "us_stock" | "crypto"): string {
  if (type === "crypto") {
    const CRYPTO_MAP: Record<string, string> = {
      bitcoin: "BTCUSD", ethereum: "ETHUSD", solana: "SOLUSD",
      ripple: "XRPUSD", cardano: "ADAUSD", dogecoin: "DOGEUSD",
      "avalanche-2": "AVAXUSD", chainlink: "LINKUSD",
      polkadot: "DOTUSD", polygon: "MATICUSD",
    };
    return CRYPTO_MAP[symbol] || `${symbol.toUpperCase()}USD`;
  }
  return symbol; // US stocks: AAPL, MSFT, etc.
}

function toYahooSymbol(symbol: string, type: "us_stock" | "crypto"): string {
  if (type === "crypto") {
    const CRYPTO_MAP: Record<string, string> = {
      bitcoin: "BTC-USD", ethereum: "ETH-USD", solana: "SOL-USD",
      ripple: "XRP-USD", cardano: "ADA-USD", dogecoin: "DOGE-USD",
      "avalanche-2": "AVAX-USD", chainlink: "LINK-USD",
      polkadot: "DOT-USD", polygon: "MATIC-USD",
    };
    return CRYPTO_MAP[symbol] || `${symbol.toUpperCase()}-USD`;
  }
  return symbol;
}

// ─── 섹터 평균 PER ───

const SECTOR_AVG_PER: Record<string, number> = {
  Technology: 30, "Financial Services": 14, Healthcare: 22,
  "Consumer Cyclical": 25, "Consumer Defensive": 22,
  Industrials: 20, "Communication Services": 18,
  Energy: 12, Utilities: 16, "Real Estate": 35,
  "Basic Materials": 15, Crypto: 0,
};

// ─── 밸류에이션 판단 ───

export type ValuationLevel = "저평가" | "적정" | "고평가" | "N/A";

export interface FundamentalData {
  currentPrice: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekRange: string | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  enterpriseToEbitda: number | null;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  profitMargin: number | null;
  returnOnEquity: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  dividendYield: number | null;
  peValuation: ValuationLevel;
  pbValuation: ValuationLevel;
  psValuation: ValuationLevel;
  overallValuation: ValuationLevel;
  fiftyTwoWeekPosition: number | null;
  isCrypto: boolean;
  epsTrailing: number | null;
  bookValue: number | null;
  beta: number | null;
}

function assessPE(pe: number | null, sector: string | null): ValuationLevel {
  if (pe == null || pe <= 0) return "N/A";
  const avg = SECTOR_AVG_PER[sector || ""] || 20;
  if (pe < avg * 0.7) return "저평가";
  if (pe < avg * 1.3) return "적정";
  return "고평가";
}

function assessPB(pb: number | null): ValuationLevel {
  if (pb == null || pb <= 0) return "N/A";
  if (pb < 1) return "저평가";
  if (pb < 3) return "적정";
  return "고평가";
}

function assessPS(ps: number | null): ValuationLevel {
  if (ps == null || ps <= 0) return "N/A";
  if (ps < 2) return "저평가";
  if (ps < 8) return "적정";
  return "고평가";
}

function overallAssessment(pe: ValuationLevel, pb: ValuationLevel, ps: ValuationLevel): ValuationLevel {
  const scores = { "저평가": 1, "적정": 2, "고평가": 3, "N/A": 0 };
  const vals = [pe, pb, ps].filter(v => v !== "N/A");
  if (vals.length === 0) return "N/A";
  const avg = vals.reduce((sum, v) => sum + scores[v], 0) / vals.length;
  if (avg < 1.5) return "저평가";
  if (avg < 2.5) return "적정";
  return "고평가";
}

// ─── FMP API: 회사 프로필 ───

async function fetchFMPProfile(fmpSymbol: string): Promise<any> {
  if (!FMP_KEY) return null;
  try {
    const url = `https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(fmpSymbol)}?apikey=${FMP_KEY}`;
    const r = await fetch(url);
    if (!r.ok) {
      console.warn(`FMP profile ${fmpSymbol}: HTTP ${r.status}`);
      return null;
    }
    const data = await r.json();
    return data?.[0] ?? null;
  } catch (e) {
    console.warn(`FMP profile error for ${fmpSymbol}:`, e);
    return null;
  }
}

// ─── FMP API: 밸류에이션 비율 (TTM) ───

async function fetchFMPRatios(fmpSymbol: string): Promise<any> {
  if (!FMP_KEY) return null;
  try {
    const url = `https://financialmodelingprep.com/api/v3/ratios-ttm/${encodeURIComponent(fmpSymbol)}?apikey=${FMP_KEY}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    return data?.[0] ?? null;
  } catch (e) {
    console.warn(`FMP ratios error for ${fmpSymbol}:`, e);
    return null;
  }
}

// ─── FMP API: 핵심 지표 (TTM) ───

async function fetchFMPKeyMetrics(fmpSymbol: string): Promise<any> {
  if (!FMP_KEY) return null;
  try {
    const url = `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${encodeURIComponent(fmpSymbol)}?apikey=${FMP_KEY}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    return data?.[0] ?? null;
  } catch (e) {
    console.warn(`FMP key-metrics error for ${fmpSymbol}:`, e);
    return null;
  }
}

// ─── Yahoo Finance v8 chart meta (fallback) ───

async function fetchChartMeta(yahooSymbol: string): Promise<any> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=5d&interval=1d`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.chart?.result?.[0]?.meta ?? null;
  } catch { return null; }
}

// ─── 메인 함수 ───

export async function fetchFundamentals(
  symbol: string,
  type: "us_stock" | "crypto"
): Promise<FundamentalData> {
  const isCrypto = type === "crypto";
  const cacheKey = `fundamentals_${symbol}_${type}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const emptyResult: FundamentalData = {
    currentPrice: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null,
    fiftyTwoWeekRange: null, trailingPE: null, forwardPE: null,
    priceToBook: null, priceToSales: null, enterpriseToEbitda: null,
    marketCap: null, sector: null, industry: null,
    profitMargin: null, returnOnEquity: null, revenueGrowth: null,
    earningsGrowth: null, dividendYield: null,
    peValuation: "N/A", pbValuation: "N/A", psValuation: "N/A",
    overallValuation: "N/A", fiftyTwoWeekPosition: null,
    isCrypto, epsTrailing: null, bookValue: null, beta: null,
  };

  try {
    const fmpSymbol = toFMPSymbol(symbol, type);
    const yahooSymbol = toYahooSymbol(symbol, type);

    // FMP 데이터와 Yahoo chart meta를 병렬로 가져오기
    const [profile, ratios, chartMeta] = await Promise.all([
      fetchFMPProfile(fmpSymbol),
      isCrypto ? Promise.resolve(null) : fetchFMPRatios(fmpSymbol),
      fetchChartMeta(yahooSymbol),
    ]);

    // FMP 프로필에서 기본 데이터 추출
    const currentPrice = profile?.price ?? chartMeta?.regularMarketPrice ?? null;
    const high52 = profile?.range ? parseFloat(profile.range.split("-")[1]) : chartMeta?.fiftyTwoWeekHigh ?? null;
    const low52 = profile?.range ? parseFloat(profile.range.split("-")[0]) : chartMeta?.fiftyTwoWeekLow ?? null;
    const marketCap = profile?.mktCap ?? null;
    const sector = profile?.sector ?? null;
    const industry = profile?.industry ?? null;
    const beta = profile?.beta ?? null;
    const divYield = profile?.lastDiv && currentPrice ? profile.lastDiv / currentPrice : null;

    // FMP ratios에서 밸류에이션 지표 추출 (주식만)
    const trailingPE = ratios?.peRatioTTM ?? null;
    const pb = ratios?.priceToBookRatioTTM ?? null;
    const ps = ratios?.priceToSalesRatioTTM ?? null;
    const forwardPE = ratios?.priceEarningsToGrowthRatioTTM ?? null; // PEG → forward PE 근사
    const evEbitda = ratios?.enterpriseValueOverEBITDATTM ?? null;
    const profitMargin = ratios?.netProfitMarginTTM ?? null;
    const roe = ratios?.returnOnEquityTTM ?? null;
    const eps = profile?.eps ?? null; // 일부 프로필에 EPS 있음

    // 52주 위치 계산
    let pos52: number | null = null;
    if (currentPrice != null && high52 != null && low52 != null && high52 !== low52) {
      pos52 = Math.max(0, Math.min(100, Math.round(((currentPrice - low52) / (high52 - low52)) * 100)));
    }

    const peVal = assessPE(trailingPE, isCrypto ? "Crypto" : sector);
    const pbVal = assessPB(pb);
    const psVal = assessPS(ps);
    const round2 = (v: number | null) => v != null && isFinite(v) ? parseFloat(v.toFixed(2)) : null;

    const data: FundamentalData = {
      currentPrice,
      fiftyTwoWeekHigh: high52,
      fiftyTwoWeekLow: low52,
      fiftyTwoWeekRange: high52 != null && low52 != null
        ? `$${low52.toLocaleString()} – $${high52.toLocaleString()}` : null,
      trailingPE: round2(trailingPE),
      forwardPE: round2(forwardPE),
      priceToBook: round2(pb),
      priceToSales: round2(ps),
      enterpriseToEbitda: round2(evEbitda),
      marketCap,
      sector,
      industry,
      profitMargin: profitMargin != null ? round2(profitMargin / 100) : null, // FMP는 %로 줌
      returnOnEquity: roe != null ? round2(roe / 100) : null,
      revenueGrowth: null, // FMP free tier에서 별도 호출 필요
      earningsGrowth: null,
      dividendYield: round2(divYield),
      peValuation: peVal,
      pbValuation: pbVal,
      psValuation: psVal,
      overallValuation: overallAssessment(peVal, pbVal, psVal),
      fiftyTwoWeekPosition: pos52,
      isCrypto,
      epsTrailing: round2(eps),
      bookValue: null,
      beta: round2(beta),
    };

    // FMP 데이터가 있으면 캐시 (없으면 짧게 캐시)
    if (profile || ratios) {
      setCache(cacheKey, data);
    } else if (chartMeta) {
      // Yahoo fallback만 사용 → 짧은 캐시
      fCache.set(cacheKey, { data, ts: Date.now() - CACHE_TTL + 2 * 60_000 }); // 2분
    }

    console.log(`[Fundamentals] ${symbol}: profile=${!!profile}, ratios=${!!ratios}, chartMeta=${!!chartMeta}`);
    return data;
  } catch (e) {
    console.warn(`Fundamentals fetch failed for ${symbol}:`, e);
    return emptyResult;
  }
}
