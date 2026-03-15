// ─── Finnhub + Yahoo Finance 재무 데이터 서비스 ───
// Finnhub: 무료 60req/min, PER/PBR/PSR/시가총액 등 제공
// Yahoo Finance v8 chart meta: 52주 범위 fallback

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";

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

function toFinnhubSymbol(symbol: string, type: "us_stock" | "crypto"): string {
  if (type === "crypto") {
    const CRYPTO_MAP: Record<string, string> = {
      bitcoin: "BINANCE:BTCUSDT", ethereum: "BINANCE:ETHUSDT", solana: "BINANCE:SOLUSDT",
      ripple: "BINANCE:XRPUSDT", cardano: "BINANCE:ADAUSDT", dogecoin: "BINANCE:DOGEUSDT",
      "avalanche-2": "BINANCE:AVAXUSDT", chainlink: "BINANCE:LINKUSDT",
      polkadot: "BINANCE:DOTUSDT", polygon: "BINANCE:MATICUSDT",
    };
    return CRYPTO_MAP[symbol] || "";
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

// ─── Finnhub API 호출 (재시도 로직 포함) ───

async function finnhubFetch(endpoint: string, retries = 2): Promise<any> {
  if (!FINNHUB_KEY) {
    console.warn(`[Finnhub] API key not set`);
    return null;
  }
  const url = `https://finnhub.io/api/v1${endpoint}${endpoint.includes("?") ? "&" : "?"}token=${FINNHUB_KEY}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });

      if (r.status === 429) {
        // Rate limit — 잠시 후 재시도
        console.warn(`[Finnhub] Rate limited on ${endpoint}, attempt ${attempt + 1}`);
        if (attempt < retries) {
          await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
          continue;
        }
        return null;
      }

      if (!r.ok) {
        console.warn(`[Finnhub] ${endpoint}: HTTP ${r.status}`);
        if (attempt < retries) {
          await new Promise(res => setTimeout(res, 500));
          continue;
        }
        return null;
      }

      const data = await r.json();
      return data;
    } catch (e) {
      console.warn(`[Finnhub] Error on ${endpoint}, attempt ${attempt + 1}:`, e);
      if (attempt < retries) {
        await new Promise(res => setTimeout(res, 500));
        continue;
      }
      return null;
    }
  }
  return null;
}

// 회사 프로필: 섹터, 산업, 시가총액, 로고 등
async function fetchFinnhubProfile(symbol: string): Promise<any> {
  return finnhubFetch(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`);
}

// 기본 재무 지표: PE, PB, PS, 52주 범위, ROE, 배당 등
async function fetchFinnhubMetrics(symbol: string): Promise<any> {
  return finnhubFetch(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`);
}

// 현재 시세
async function fetchFinnhubQuote(symbol: string): Promise<any> {
  return finnhubFetch(`/quote?symbol=${encodeURIComponent(symbol)}`);
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

  const yahooSymbol = toYahooSymbol(symbol, type);

  try {
    if (isCrypto) {
      // 암호화폐: Yahoo Finance chart meta만 사용
      const chartMeta = await fetchChartMeta(yahooSymbol);
      if (!chartMeta) return emptyResult;

      const currentPrice = chartMeta.regularMarketPrice ?? null;
      const high52 = chartMeta.fiftyTwoWeekHigh ?? null;
      const low52 = chartMeta.fiftyTwoWeekLow ?? null;
      let pos52: number | null = null;
      if (currentPrice && high52 && low52 && high52 !== low52) {
        pos52 = Math.max(0, Math.min(100, Math.round(((currentPrice - low52) / (high52 - low52)) * 100)));
      }

      const data: FundamentalData = {
        ...emptyResult,
        currentPrice,
        fiftyTwoWeekHigh: high52,
        fiftyTwoWeekLow: low52,
        fiftyTwoWeekRange: high52 && low52 ? `$${low52.toLocaleString()} – $${high52.toLocaleString()}` : null,
        fiftyTwoWeekPosition: pos52,
      };
      setCache(cacheKey, data);
      return data;
    }

    // 미국 주식: Finnhub API 사용
    const finnhubSymbol = symbol; // US stocks는 그대로

    // 병렬로 Finnhub 프로필 + 지표 + 시세 + Yahoo fallback 가져오기
    const [profile, metrics, quote, chartMeta] = await Promise.all([
      fetchFinnhubProfile(finnhubSymbol),
      fetchFinnhubMetrics(finnhubSymbol),
      fetchFinnhubQuote(finnhubSymbol),
      fetchChartMeta(yahooSymbol),
    ]);

    const m = metrics?.metric || {};

    // 현재가
    const currentPrice = quote?.c ?? chartMeta?.regularMarketPrice ?? null;

    // 52주 범위
    const high52 = m["52WeekHigh"] ?? chartMeta?.fiftyTwoWeekHigh ?? null;
    const low52 = m["52WeekLow"] ?? chartMeta?.fiftyTwoWeekLow ?? null;

    // 밸류에이션 지표
    const trailingPE = m.peBasicExclExtraTTM ?? m.peTTM ?? null;
    const forwardPE = m.peAnnual ?? null;
    const pb = m.pbQuarterly ?? m.pbAnnual ?? null;
    const ps = m.psAnnual ?? m.psTTM ?? null;
    const evEbitda = m["ev/ebitdaTTM"] ?? ((m.currentEv != null && m.ebitdTTM != null)
      ? m.currentEv / m.ebitdTTM : null);

    // 기업 정보
    const marketCap = profile?.marketCapitalization
      ? profile.marketCapitalization * 1e6 // Finnhub은 millions 단위
      : null;
    const sector = profile?.finnhubIndustry ?? null;
    const industry = profile?.finnhubIndustry ?? null;
    const beta = m.beta ?? null;

    // 수익성
    const profitMargin = m.netProfitMarginTTM != null ? m.netProfitMarginTTM / 100 : null;
    const roe = m.roeTTM != null ? m.roeTTM / 100 : null;
    const revGrowth = m.revenueGrowthQuarterlyYoy != null ? m.revenueGrowthQuarterlyYoy / 100 : null;
    const earnGrowth = m.epsGrowthQuarterlyYoy != null ? m.epsGrowthQuarterlyYoy / 100 : null;
    const divYield = m.dividendYieldIndicatedAnnual != null ? m.dividendYieldIndicatedAnnual / 100 : null;
    const eps = m.epsBasicExclExtraItemsTTM ?? m.epsTTM ?? null;
    const bookVal = m.bookValuePerShareQuarterly ?? null;

    // 52주 위치
    let pos52: number | null = null;
    if (currentPrice != null && high52 != null && low52 != null && high52 !== low52) {
      pos52 = Math.max(0, Math.min(100, Math.round(((currentPrice - low52) / (high52 - low52)) * 100)));
    }

    const peVal = assessPE(trailingPE, sector);
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
      enterpriseToEbitda: round2(typeof evEbitda === "number" ? evEbitda : null),
      marketCap,
      sector,
      industry,
      profitMargin,
      returnOnEquity: roe,
      revenueGrowth: revGrowth,
      earningsGrowth: earnGrowth,
      dividendYield: divYield,
      peValuation: peVal,
      pbValuation: pbVal,
      psValuation: psVal,
      overallValuation: overallAssessment(peVal, pbVal, psVal),
      fiftyTwoWeekPosition: pos52,
      isCrypto,
      epsTrailing: round2(eps),
      bookValue: round2(bookVal),
      beta: round2(beta),
    };

    const hasMetrics = metrics?.metric && Object.keys(metrics.metric).length > 0;
    const hasProfile = profile && Object.keys(profile).length > 0;
    const hasRealData = hasProfile || hasMetrics;

    if (hasRealData) {
      setCache(cacheKey, data);
      console.log(`[Fundamentals] ${symbol}: Finnhub success (profile=${!!hasProfile}, metrics=${!!hasMetrics}, PE=${trailingPE}, PB=${pb})`);
    } else {
      // 실패한 결과는 캐시하지 않음 — 다음 요청에서 다시 시도
      console.log(`[Fundamentals] ${symbol}: No Finnhub data (profile=${JSON.stringify(profile)?.slice(0,100)}, metrics keys=${Object.keys(m).length}), chartMeta=${!!chartMeta}. NOT caching.`);
    }

    return data;
  } catch (e) {
    console.warn(`Fundamentals fetch failed for ${symbol}:`, e);
    return emptyResult;
  }
}
