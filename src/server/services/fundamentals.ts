// ─── Yahoo Finance Fundamentals Service ───
// crumb 인증 방식으로 PER, PBR, PSR, 시가총액, 52주 범위 등 재무 데이터 조회

type CacheEntry = { data: any; ts: number };
const fCache = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60_000; // 10분

// crumb/cookie 캐시
let crumbCache: { crumb: string; cookie: string; ts: number } | null = null;
const CRUMB_TTL = 30 * 60_000; // 30분

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

// ─── Yahoo Finance Crumb 인증 ───

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  // 캐시된 crumb이 있으면 재사용
  if (crumbCache && Date.now() - crumbCache.ts < CRUMB_TTL) {
    return { crumb: crumbCache.crumb, cookie: crumbCache.cookie };
  }

  try {
    // 1단계: Yahoo에서 쿠키 받기
    const initRes = await fetch("https://fc.yahoo.com/", {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const setCookies = initRes.headers.getSetCookie?.() || [];
    const cookieStr = setCookies.map(c => c.split(";")[0]).join("; ");

    if (!cookieStr) {
      console.warn("No cookies from Yahoo");
      return null;
    }

    // 2단계: crumb 받기
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": cookieStr,
      },
    });

    if (!crumbRes.ok) {
      console.warn("Failed to get crumb:", crumbRes.status);
      return null;
    }

    const crumb = await crumbRes.text();
    if (!crumb || crumb.length > 50) return null;

    crumbCache = { crumb, cookie: cookieStr, ts: Date.now() };
    return { crumb, cookie: cookieStr };
  } catch (e) {
    console.warn("Crumb fetch error:", e);
    return null;
  }
}

// ─── Yahoo Finance quoteSummary with crumb ───

async function fetchWithCrumb(yahooSymbol: string, modules: string): Promise<any> {
  const auth = await getYahooCrumb();
  if (!auth) return null;

  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=${modules}&crumb=${encodeURIComponent(auth.crumb)}`;

  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Cookie": auth.cookie,
    },
  });

  if (!r.ok) {
    // crumb이 만료되었을 수 있음 → 리셋 후 재시도
    if (r.status === 401 || r.status === 403) {
      crumbCache = null;
      const auth2 = await getYahooCrumb();
      if (!auth2) return null;

      const r2 = await fetch(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=${modules}&crumb=${encodeURIComponent(auth2.crumb)}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Cookie": auth2.cookie,
          },
        }
      );
      if (!r2.ok) return null;
      const d2 = await r2.json();
      return d2?.quoteSummary?.result?.[0] ?? null;
    }
    return null;
  }

  const d = await r.json();
  return d?.quoteSummary?.result?.[0] ?? null;
}

// ─── Fallback: v8 chart meta ───

async function fetchChartMeta(yahooSymbol: string): Promise<any> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=5d&interval=1d`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.chart?.result?.[0]?.meta ?? null;
  } catch {
    return null;
  }
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
    // 방법 1: crumb 인증으로 quoteSummary 호출
    const modules = isCrypto
      ? "price,summaryDetail"
      : "price,summaryDetail,defaultKeyStatistics,financialData,summaryProfile";

    let result = await fetchWithCrumb(yahooSymbol, modules);

    // 방법 2: chart meta fallback
    if (!result) {
      const meta = await fetchChartMeta(yahooSymbol);
      if (meta) {
        const currentPrice = meta.regularMarketPrice ?? null;
        const high52 = meta.fiftyTwoWeekHigh ?? null;
        const low52 = meta.fiftyTwoWeekLow ?? null;
        let pos52: number | null = null;
        if (currentPrice && high52 && low52 && high52 !== low52) {
          pos52 = Math.round(((currentPrice - low52) / (high52 - low52)) * 100);
        }
        const partialData: FundamentalData = {
          ...emptyResult,
          currentPrice,
          fiftyTwoWeekHigh: high52,
          fiftyTwoWeekLow: low52,
          fiftyTwoWeekRange: high52 && low52 ? `$${low52.toLocaleString()} – $${high52.toLocaleString()}` : null,
          fiftyTwoWeekPosition: pos52,
        };
        setCache(cacheKey, partialData);
        return partialData;
      }
      return emptyResult;
    }

    // quoteSummary 데이터 파싱
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
    const eps = keyStats.trailingEps?.raw ?? null;
    const bookVal = keyStats.bookValue?.raw ?? null;

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
      averageVolume: null,
    };

    setCache(cacheKey, data);
    return data;
  } catch (e) {
    console.warn(`Fundamentals fetch failed for ${symbol}:`, e);
    return emptyResult;
  }
}
