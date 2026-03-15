// ─── Yahoo Finance Fundamentals Service ───
// 여러 방법으로 PER, PBR, PSR, 시가총액 등 재무 데이터 조회

type CacheEntry = { data: any; ts: number };
const fCache = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60_000; // 10분

let crumbCache: { crumb: string; cookie: string; ts: number } | null = null;
const CRUMB_TTL = 30 * 60_000;

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

const SECTOR_AVG_PER: Record<string, number> = {
  Technology: 30, "Financial Services": 14, Healthcare: 22,
  "Consumer Cyclical": 25, "Consumer Defensive": 22,
  Industrials: 20, "Communication Services": 18,
  Energy: 12, Utilities: 16, "Real Estate": 35,
  "Basic Materials": 15, Crypto: 0,
};

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

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─── 방법 1: Yahoo Finance 페이지에서 JSON 추출 ───

async function fetchFromYahooPage(yahooSymbol: string): Promise<any> {
  try {
    const url = `https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol)}/`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!r.ok) return null;
    const html = await r.text();

    // 방법 A: __NEXT_DATA__ 에서 추출
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        // Next.js 구조에서 quote 데이터 찾기
        const pageProps = nextData?.props?.pageProps;
        if (pageProps) {
          // 다양한 경로에서 데이터 탐색
          const quoteSummary = pageProps?.quoteSummary?.result?.[0];
          if (quoteSummary) return { _source: "nextdata_summary", ...quoteSummary };

          const quoteData = pageProps?.quote;
          if (quoteData) return { _source: "nextdata_quote", ...quoteData };
        }
      } catch { /* parse error, try next method */ }
    }

    // 방법 B: root.App.main 에서 추출 (이전 Yahoo Finance 버전)
    const appMainMatch = html.match(/root\.App\.main\s*=\s*({[\s\S]*?});\s*\n/);
    if (appMainMatch) {
      try {
        const appData = JSON.parse(appMainMatch[1]);
        const stores = appData?.context?.dispatcher?.stores;
        const quoteSummaryStore = stores?.QuoteSummaryStore;
        if (quoteSummaryStore) return { _source: "appmain", ...quoteSummaryStore };
      } catch { /* parse error */ }
    }

    // 방법 C: JSON-LD 에서 기본 정보 추출
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
      try {
        const ld = JSON.parse(jsonLdMatch[1]);
        if (ld?.mainEntity) return { _source: "jsonld", ...ld.mainEntity };
      } catch { /* ignore */ }
    }

    return null;
  } catch (e) {
    console.warn("Yahoo page fetch failed:", e);
    return null;
  }
}

// ─── 방법 2: Crumb 인증으로 API 호출 ───

function extractCookies(response: Response): string {
  const cookies: string[] = [];
  // 방법 A: getSetCookie (Node 20+)
  try {
    const setCookies = (response.headers as any).getSetCookie?.();
    if (setCookies && setCookies.length > 0) {
      for (const c of setCookies) {
        cookies.push(c.split(";")[0]);
      }
      return cookies.join("; ");
    }
  } catch { /* not available */ }

  // 방법 B: raw headers에서 추출
  try {
    const raw = (response.headers as any).raw?.();
    if (raw?.["set-cookie"]) {
      for (const c of raw["set-cookie"]) {
        cookies.push(c.split(";")[0]);
      }
      return cookies.join("; ");
    }
  } catch { /* not available */ }

  // 방법 C: get('set-cookie') 파싱
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    // 여러 쿠키가 , 로 구분될 수 있음
    const parts = setCookie.split(/,(?=[^ ])/);
    for (const part of parts) {
      cookies.push(part.trim().split(";")[0]);
    }
    return cookies.join("; ");
  }

  return "";
}

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (crumbCache && Date.now() - crumbCache.ts < CRUMB_TTL) {
    return { crumb: crumbCache.crumb, cookie: crumbCache.cookie };
  }

  try {
    // Step 1: Yahoo consent 페이지로 쿠키 받기
    const initRes = await fetch("https://fc.yahoo.com/", {
      redirect: "manual",
      headers: { "User-Agent": UA },
    });
    let cookieStr = extractCookies(initRes);

    // Step 1b: 쿠키가 없으면 finance.yahoo.com에서 시도
    if (!cookieStr) {
      const altRes = await fetch("https://finance.yahoo.com/", {
        redirect: "manual",
        headers: { "User-Agent": UA },
      });
      cookieStr = extractCookies(altRes);
    }

    if (!cookieStr) {
      console.warn("No cookies obtained from Yahoo");
      return null;
    }

    // Step 2: crumb 받기
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, "Cookie": cookieStr },
    });
    if (!crumbRes.ok) return null;

    const crumb = await crumbRes.text();
    if (!crumb || crumb.length > 50 || crumb.includes("<")) return null;

    crumbCache = { crumb, cookie: cookieStr, ts: Date.now() };
    return { crumb, cookie: cookieStr };
  } catch (e) {
    console.warn("Crumb fetch error:", e);
    return null;
  }
}

async function fetchWithCrumb(yahooSymbol: string, modules: string): Promise<any> {
  const auth = await getYahooCrumb();
  if (!auth) return null;

  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=${modules}&crumb=${encodeURIComponent(auth.crumb)}`;

  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Cookie": auth.cookie },
  });

  if (r.status === 401 || r.status === 403) {
    crumbCache = null;
    const auth2 = await getYahooCrumb();
    if (!auth2) return null;
    const r2 = await fetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=${modules}&crumb=${encodeURIComponent(auth2.crumb)}`,
      { headers: { "User-Agent": UA, "Cookie": auth2.cookie } }
    );
    if (!r2.ok) return null;
    const d2 = await r2.json();
    return d2?.quoteSummary?.result?.[0] ?? null;
  }

  if (!r.ok) return null;
  const d = await r.json();
  return d?.quoteSummary?.result?.[0] ?? null;
}

// ─── 방법 3: v8 chart meta (기본 정보만) ───

async function fetchChartMeta(yahooSymbol: string): Promise<any> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=5d&interval=1d`;
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.chart?.result?.[0]?.meta ?? null;
  } catch { return null; }
}

// ─── quoteSummary 결과 파싱 ───

function parseQuoteSummary(result: any): {
  currentPrice: number | null; high52: number | null; low52: number | null;
  trailingPE: number | null; forwardPE: number | null; pb: number | null;
  ps: number | null; evEbitda: number | null; marketCap: number | null;
  sector: string | null; industry: string | null; profitMargin: number | null;
  roe: number | null; revGrowth: number | null; earnGrowth: number | null;
  divYield: number | null; eps: number | null; bookVal: number | null;
} {
  const price = result.price || {};
  const summary = result.summaryDetail || {};
  const keyStats = result.defaultKeyStatistics || {};
  const financial = result.financialData || {};
  const profile = result.summaryProfile || {};

  return {
    currentPrice: price.regularMarketPrice?.raw ?? null,
    high52: summary.fiftyTwoWeekHigh?.raw ?? null,
    low52: summary.fiftyTwoWeekLow?.raw ?? null,
    trailingPE: summary.trailingPE?.raw ?? keyStats.trailingPE?.raw ?? null,
    forwardPE: keyStats.forwardPE?.raw ?? summary.forwardPE?.raw ?? null,
    pb: keyStats.priceToBook?.raw ?? null,
    ps: keyStats.priceToSalesTrailing12Months?.raw ?? summary.priceToSalesTrailing12Months?.raw ?? null,
    evEbitda: keyStats.enterpriseToEbitda?.raw ?? null,
    marketCap: price.marketCap?.raw ?? null,
    sector: profile.sector ?? null,
    industry: profile.industry ?? null,
    profitMargin: financial.profitMargins?.raw ?? null,
    roe: financial.returnOnEquity?.raw ?? null,
    revGrowth: financial.revenueGrowth?.raw ?? null,
    earnGrowth: financial.earningsGrowth?.raw ?? null,
    divYield: summary.dividendYield?.raw ?? null,
    eps: keyStats.trailingEps?.raw ?? null,
    bookVal: keyStats.bookValue?.raw ?? null,
  };
}

// ─── Yahoo 페이지 데이터 파싱 ───

function parseYahooPageData(data: any): {
  currentPrice: number | null; high52: number | null; low52: number | null;
  trailingPE: number | null; forwardPE: number | null; pb: number | null;
  ps: number | null; evEbitda: number | null; marketCap: number | null;
  sector: string | null; industry: string | null; profitMargin: number | null;
  roe: number | null; revGrowth: number | null; earnGrowth: number | null;
  divYield: number | null; eps: number | null; bookVal: number | null;
} {
  const src = data._source;

  if (src === "nextdata_summary") {
    return parseQuoteSummary(data);
  }

  if (src === "appmain") {
    return parseQuoteSummary(data);
  }

  // nextdata_quote 또는 기타 flat 구조
  return {
    currentPrice: data.regularMarketPrice?.raw ?? data.regularMarketPrice ?? null,
    high52: data.fiftyTwoWeekHigh?.raw ?? data.fiftyTwoWeekHigh ?? null,
    low52: data.fiftyTwoWeekLow?.raw ?? data.fiftyTwoWeekLow ?? null,
    trailingPE: data.trailingPE?.raw ?? data.trailingPE ?? null,
    forwardPE: data.forwardPE?.raw ?? data.forwardPE ?? null,
    pb: data.priceToBook?.raw ?? data.priceToBook ?? null,
    ps: data.priceToSalesTrailing12Months?.raw ?? data.priceToSalesTrailing12Months ?? null,
    evEbitda: data.enterpriseToEbitda?.raw ?? data.enterpriseToEbitda ?? null,
    marketCap: data.marketCap?.raw ?? data.marketCap ?? null,
    sector: data.sector ?? null,
    industry: data.industry ?? null,
    profitMargin: data.profitMargins?.raw ?? data.profitMargins ?? null,
    roe: data.returnOnEquity?.raw ?? data.returnOnEquity ?? null,
    revGrowth: data.revenueGrowth?.raw ?? data.revenueGrowth ?? null,
    earnGrowth: data.earningsGrowth?.raw ?? data.earningsGrowth ?? null,
    divYield: data.dividendYield?.raw ?? data.trailingAnnualDividendYield?.raw ?? data.dividendYield ?? null,
    eps: data.epsTrailingTwelveMonths?.raw ?? data.trailingEps?.raw ?? data.epsTrailingTwelveMonths ?? null,
    bookVal: data.bookValue?.raw ?? data.bookValue ?? null,
  };
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
    let parsed: ReturnType<typeof parseQuoteSummary> | null = null;

    // 시도 1: crumb 인증 API
    const modules = isCrypto
      ? "price,summaryDetail"
      : "price,summaryDetail,defaultKeyStatistics,financialData,summaryProfile";

    const apiResult = await fetchWithCrumb(yahooSymbol, modules);
    if (apiResult) {
      parsed = parseQuoteSummary(apiResult);
      console.log(`[Fundamentals] ${yahooSymbol}: crumb API success`);
    }

    // 시도 2: Yahoo Finance 페이지 스크래핑
    if (!parsed || parsed.trailingPE == null) {
      const pageData = await fetchFromYahooPage(yahooSymbol);
      if (pageData) {
        const pageParsed = parseYahooPageData(pageData);
        // 더 많은 데이터가 있으면 교체
        if (pageParsed.trailingPE != null || pageParsed.marketCap != null) {
          parsed = pageParsed;
          console.log(`[Fundamentals] ${yahooSymbol}: page scrape success (${pageData._source})`);
        } else if (!parsed) {
          parsed = pageParsed;
        }
      }
    }

    // 시도 3: chart meta fallback (52주 범위만)
    if (!parsed || (parsed.currentPrice == null && parsed.high52 == null)) {
      const meta = await fetchChartMeta(yahooSymbol);
      if (meta) {
        console.log(`[Fundamentals] ${yahooSymbol}: chart meta fallback`);
        if (!parsed) {
          parsed = {
            currentPrice: meta.regularMarketPrice ?? null,
            high52: meta.fiftyTwoWeekHigh ?? null,
            low52: meta.fiftyTwoWeekLow ?? null,
            trailingPE: null, forwardPE: null, pb: null, ps: null,
            evEbitda: null, marketCap: null, sector: null, industry: null,
            profitMargin: null, roe: null, revGrowth: null, earnGrowth: null,
            divYield: null, eps: null, bookVal: null,
          };
        } else {
          // 부족한 데이터 보충
          if (!parsed.currentPrice) parsed.currentPrice = meta.regularMarketPrice ?? null;
          if (!parsed.high52) parsed.high52 = meta.fiftyTwoWeekHigh ?? null;
          if (!parsed.low52) parsed.low52 = meta.fiftyTwoWeekLow ?? null;
        }
      }
    }

    if (!parsed) return emptyResult;

    const peVal = assessPE(parsed.trailingPE, isCrypto ? "Crypto" : parsed.sector);
    const pbVal = assessPB(parsed.pb);
    const psVal = assessPS(parsed.ps);

    let pos52: number | null = null;
    if (parsed.currentPrice != null && parsed.high52 != null && parsed.low52 != null && parsed.high52 !== parsed.low52) {
      pos52 = Math.round(((parsed.currentPrice - parsed.low52) / (parsed.high52 - parsed.low52)) * 100);
    }

    const round2 = (v: number | null) => v != null ? parseFloat(v.toFixed(2)) : null;

    const data: FundamentalData = {
      currentPrice: parsed.currentPrice,
      fiftyTwoWeekHigh: parsed.high52,
      fiftyTwoWeekLow: parsed.low52,
      fiftyTwoWeekRange: parsed.high52 != null && parsed.low52 != null
        ? `$${parsed.low52.toLocaleString()} – $${parsed.high52.toLocaleString()}` : null,
      trailingPE: round2(parsed.trailingPE),
      forwardPE: round2(parsed.forwardPE),
      priceToBook: round2(parsed.pb),
      priceToSales: round2(parsed.ps),
      enterpriseToEbitda: round2(parsed.evEbitda),
      marketCap: parsed.marketCap,
      sector: parsed.sector,
      industry: parsed.industry,
      profitMargin: parsed.profitMargin,
      returnOnEquity: parsed.roe,
      revenueGrowth: parsed.revGrowth,
      earningsGrowth: parsed.earnGrowth,
      dividendYield: parsed.divYield,
      peValuation: peVal,
      pbValuation: pbVal,
      psValuation: psVal,
      overallValuation: overallAssessment(peVal, pbVal, psVal),
      fiftyTwoWeekPosition: pos52,
      isCrypto,
      epsTrailing: round2(parsed.eps),
      bookValue: round2(parsed.bookVal),
      averageVolume: null,
    };

    setCache(cacheKey, data);
    return data;
  } catch (e) {
    console.warn(`Fundamentals fetch failed for ${symbol}:`, e);
    return emptyResult;
  }
}
