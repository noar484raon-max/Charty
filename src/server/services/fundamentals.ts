// ─── Yahoo Finance Fundamentals Service ───
// PER, PBR, PSR, 시가총액, 52주 범위 등 재무 데이터 조회

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

// ─── 섹터 평균 PER (대략적 기준) ───

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
  // 가격 정보
  currentPrice: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekRange: string | null;

  // 밸류에이션 지표
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  enterpriseToEbitda: number | null;

  // 기업 정보
  marketCap: number | null;
  sector: string | null;
  industry: string | null;

  // 수익성
  profitMargin: number | null;
  returnOnEquity: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;

  // 배당
  dividendYield: number | null;

  // 분석 결과
  peValuation: ValuationLevel;
  pbValuation: ValuationLevel;
  psValuation: ValuationLevel;
  overallValuation: ValuationLevel;
  fiftyTwoWeekPosition: number | null; // 0~100, 52주 범위 내 위치 %

  // 암호화폐 전용
  isCrypto: boolean;
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

// ─── Yahoo Finance quoteSummary fetcher ───

export async function fetchFundamentals(
  symbol: string,
  type: "us_stock" | "crypto"
): Promise<FundamentalData> {
  const isCrypto = type === "crypto";
  const yahooSymbol = toYahooSymbol(symbol, type);
  const cacheKey = `fundamentals_${yahooSymbol}`;
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
    isCrypto,
  };

  try {
    const modules = isCrypto
      ? "price,summaryDetail"
      : "price,summaryDetail,defaultKeyStatistics,financialData,summaryProfile";

    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=${modules}`;

    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!r.ok) throw new Error(`Yahoo Finance HTTP ${r.status}`);
    const d = await r.json();
    const result = d?.quoteSummary?.result?.[0];
    if (!result) throw new Error("No quoteSummary data");

    const price = result.price || {};
    const summary = result.summaryDetail || {};
    const keyStats = result.defaultKeyStatistics || {};
    const financial = result.financialData || {};
    const profile = result.summaryProfile || {};

    const currentPrice = price.regularMarketPrice?.raw ?? null;
    const high52 = summary.fiftyTwoWeekHigh?.raw ?? null;
    const low52 = summary.fiftyTwoWeekLow?.raw ?? null;
    const trailingPE = summary.trailingPE?.raw ?? keyStats.trailingPE?.raw ?? null;
    const forwardPE = keyStats.forwardPE?.raw ?? summary.forwardPE?.raw ?? null;
    const pb = keyStats.priceToBook?.raw ?? null;
    const ps = keyStats.priceToSalesTrailing12Months?.raw ?? summary.priceToSalesTrailing12Months?.raw ?? null;
    const evEbitda = keyStats.enterpriseToEbitda?.raw ?? null;
    const marketCap = price.marketCap?.raw ?? null;
    const sector = profile.sector ?? null;
    const industry = profile.industry ?? null;
    const profitMargin = financial.profitMargins?.raw ?? null;
    const roe = financial.returnOnEquity?.raw ?? null;
    const revGrowth = financial.revenueGrowth?.raw ?? null;
    const earnGrowth = financial.earningsGrowth?.raw ?? null;
    const divYield = summary.dividendYield?.raw ?? null;

    const peVal = assessPE(trailingPE, isCrypto ? "Crypto" : sector);
    const pbVal = assessPB(pb);
    const psVal = assessPS(ps);

    let pos52: number | null = null;
    if (currentPrice != null && high52 != null && low52 != null && high52 !== low52) {
      pos52 = Math.round(((currentPrice - low52) / (high52 - low52)) * 100);
    }

    const data: FundamentalData = {
      currentPrice,
      fiftyTwoWeekHigh: high52,
      fiftyTwoWeekLow: low52,
      fiftyTwoWeekRange: high52 && low52 ? `$${low52.toLocaleString()} – $${high52.toLocaleString()}` : null,
      trailingPE: trailingPE ? parseFloat(trailingPE.toFixed(2)) : null,
      forwardPE: forwardPE ? parseFloat(forwardPE.toFixed(2)) : null,
      priceToBook: pb ? parseFloat(pb.toFixed(2)) : null,
      priceToSales: ps ? parseFloat(ps.toFixed(2)) : null,
      enterpriseToEbitda: evEbitda ? parseFloat(evEbitda.toFixed(2)) : null,
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
    };

    setCache(cacheKey, data);
    return data;
  } catch (e) {
    console.warn(`Fundamentals fetch failed for ${symbol}:`, e);
    return emptyResult;
  }
}
