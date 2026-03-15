// ─── Yahoo Finance Fundamentals Service ───
// PER, PBR, PSR, 시가총액, 52주 범위 등 재무 데이터 조회
// v7/finance/quote API 사용 (crumb 불필요)

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
  // 추가 정보
  epsTrailing: number | null;
  bookValue: number | null;
  averageVolume: number | null;
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

// ─── Yahoo Finance v7 quote API ───
// v7은 crumb 인증 불필요, 대부분의 기본 지표를 한 번에 반환

async function fetchYahooQuote(yahooSymbol: string): Promise<any> {
  // 방법 1: v7/finance/quote (가장 안정적)
  const urls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,marketCap,trailingPE,forwardPE,priceToBook,priceToSalesTrailing12Months,enterpriseToEbitda,fiftyTwoWeekHigh,fiftyTwoWeekLow,trailingAnnualDividendYield,epsTrailingTwelveMonths,bookValue,averageVolume10days,sector,industry,profitMargins,returnOnEquity,revenueGrowth,earningsGrowth`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`,
    `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`,
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
        },
      });
      if (!r.ok) continue;
      const d = await r.json();
      const result = d?.quoteResponse?.result?.[0];
      if (result) return result;
    } catch {
      continue;
    }
  }

  // 방법 2: v8 chart API에서 meta 정보 추출 (fallback)
  try {
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`;
    const r = await fetch(chartUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    if (r.ok) {
      const d = await r.json();
      const meta = d?.chart?.result?.[0]?.meta;
      if (meta) {
        return {
          regularMarketPrice: meta.regularMarketPrice,
          fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
          _fromChart: true, // 차트에서 온 데이터임을 표시
        };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

// ─── 메인 함수 ───

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
    isCrypto, epsTrailing: null, bookValue: null, averageVolume: null,
  };

  try {
    const q = await fetchYahooQuote(yahooSymbol);
    if (!q) throw new Error("No quote data available");

    const currentPrice = q.regularMarketPrice ?? null;
    const high52 = q.fiftyTwoWeekHigh ?? null;
    const low52 = q.fiftyTwoWeekLow ?? null;
    const trailingPE = q.trailingPE ?? null;
    const forwardPE = q.forwardPE ?? null;
    const pb = q.priceToBook ?? null;
    const ps = q.priceToSalesTrailing12Months ?? null;
    const evEbitda = q.enterpriseToEbitda ?? null;
    const marketCap = q.marketCap ?? null;
    const sector = q.sector ?? null;
    const industry = q.industry ?? null;
    const profitMargin = q.profitMargins ?? null;
    const roe = q.returnOnEquity ?? null;
    const revGrowth = q.revenueGrowth ?? null;
    const earnGrowth = q.earningsGrowth ?? null;
    const divYield = q.trailingAnnualDividendYield ?? null;
    const eps = q.epsTrailingTwelveMonths ?? null;
    const bookVal = q.bookValue ?? null;
    const avgVol = q.averageVolume10days ?? q.averageDailyVolume10Day ?? null;

    const peVal = assessPE(trailingPE, isCrypto ? "Crypto" : sector);
    const pbVal = assessPB(pb);
    const psVal = assessPS(ps);

    let pos52: number | null = null;
    if (currentPrice != null && high52 != null && low52 != null && high52 !== low52) {
      pos52 = Math.round(((currentPrice - low52) / (high52 - low52)) * 100);
    }

    const round2 = (v: number | null) => v != null ? parseFloat(v.toFixed(2)) : null;

    const data: FundamentalData = {
      currentPrice,
      fiftyTwoWeekHigh: high52,
      fiftyTwoWeekLow: low52,
      fiftyTwoWeekRange: high52 != null && low52 != null ? `$${low52.toLocaleString()} – $${high52.toLocaleString()}` : null,
      trailingPE: round2(trailingPE),
      forwardPE: round2(forwardPE),
      priceToBook: round2(pb),
      priceToSales: round2(ps),
      enterpriseToEbitda: round2(evEbitda),
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
      averageVolume: avgVol,
    };

    setCache(cacheKey, data);
    return data;
  } catch (e) {
    console.warn(`Fundamentals fetch failed for ${symbol}:`, e);
    return emptyResult;
  }
}
