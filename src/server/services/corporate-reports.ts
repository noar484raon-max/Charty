/**
 * Corporate Reports Service — Finnhub 기반
 * - Earnings Calendar: 실적 발표 일정 및 실적 서프라이즈
 * - Price Target: 애널리스트 목표가 컨센서스
 * - Company News: 기업별 뉴스 (실적/목표가 관련)
 */

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const BASE = "https://finnhub.io/api/v1";

// ─── 타입 ───

export interface EarningsEvent {
  symbol: string;
  date: string;          // YYYY-MM-DD
  hour: "bmo" | "amc" | "dmh" | "";  // before market open / after market close
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  surprise: number | null;        // EPS surprise %
  surpriseLabel: "beat" | "miss" | "meet" | "upcoming";
  quarter: number;
  year: number;
}

export interface PriceTarget {
  symbol: string;
  targetHigh: number;
  targetLow: number;
  targetMean: number;
  targetMedian: number;
  lastUpdated: string;
}

export interface CompanyNewsItem {
  id: number;
  symbol: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
  image: string;
  category: string;
}

export interface CorporateReportData {
  earnings: EarningsEvent[];
  watchlistEarnings: EarningsEvent[];
  news: CompanyNewsItem[];
  fetchedAt: number;
}

// ─── 캐시 ───

const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15분

function getCached<T>(key: string): T | null {
  const c = cache.get(key);
  if (c && Date.now() < c.expiry) return c.data as T;
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// ─── Finnhub API 호출 ───

async function finnhubFetch<T>(path: string): Promise<T | null> {
  if (!FINNHUB_KEY) {
    console.warn("[CorporateReports] FINNHUB_API_KEY not set");
    return null;
  }

  try {
    const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}token=${FINNHUB_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      console.error(`[CorporateReports] HTTP ${res.status} for ${path}`);
      return null;
    }

    return await res.json();
  } catch (e) {
    console.error(`[CorporateReports] Fetch error for ${path}:`, e);
    return null;
  }
}

// ─── 실적 캘린더 ───

export async function fetchEarningsCalendar(from?: string, to?: string): Promise<EarningsEvent[]> {
  const today = new Date();
  const fromDate = from || today.toISOString().split("T")[0];
  const toDate = to || new Date(today.getTime() + 14 * 86400000).toISOString().split("T")[0];

  const cacheKey = `earnings_${fromDate}_${toDate}`;
  const cached = getCached<EarningsEvent[]>(cacheKey);
  if (cached) return cached;

  const data = await finnhubFetch<any>(`/calendar/earnings?from=${fromDate}&to=${toDate}`);
  if (!data?.earningsCalendar) return [];

  const events: EarningsEvent[] = data.earningsCalendar
    .filter((e: any) => e.symbol)
    .map((e: any) => {
      const surprise = e.epsActual != null && e.epsEstimate != null && e.epsEstimate !== 0
        ? ((e.epsActual - e.epsEstimate) / Math.abs(e.epsEstimate)) * 100
        : null;

      let surpriseLabel: "beat" | "miss" | "meet" | "upcoming" = "upcoming";
      if (e.epsActual != null && e.epsEstimate != null) {
        if (surprise !== null && surprise > 2) surpriseLabel = "beat";
        else if (surprise !== null && surprise < -2) surpriseLabel = "miss";
        else surpriseLabel = "meet";
      }

      return {
        symbol: e.symbol,
        date: e.date,
        hour: e.hour || "",
        epsEstimate: e.epsEstimate ?? null,
        epsActual: e.epsActual ?? null,
        revenueEstimate: e.revenueEstimate ?? null,
        revenueActual: e.revenueActual ?? null,
        surprise: surprise !== null ? Math.round(surprise * 100) / 100 : null,
        surpriseLabel,
        quarter: e.quarter || 0,
        year: e.year || new Date().getFullYear(),
      };
    });

  setCache(cacheKey, events);
  return events;
}

// ─── 관심종목 실적 필터 ───

export async function fetchWatchlistEarnings(symbols: string[]): Promise<EarningsEvent[]> {
  if (symbols.length === 0) return [];

  const cacheKey = `watchlist_earnings_${symbols.sort().join(",")}`;
  const cached = getCached<EarningsEvent[]>(cacheKey);
  if (cached) return cached;

  // 앞으로 30일 실적 가져옴
  const today = new Date();
  const to = new Date(today.getTime() + 30 * 86400000);
  const allEarnings = await fetchEarningsCalendar(
    today.toISOString().split("T")[0],
    to.toISOString().split("T")[0]
  );

  const upperSymbols = new Set(symbols.map((s) => s.toUpperCase()));
  const filtered = allEarnings.filter((e) => upperSymbols.has(e.symbol.toUpperCase()));

  setCache(cacheKey, filtered);
  return filtered;
}

// ─── 애널리스트 목표가 ───

export async function fetchPriceTarget(symbol: string): Promise<PriceTarget | null> {
  const cacheKey = `pt_${symbol}`;
  const cached = getCached<PriceTarget>(cacheKey);
  if (cached) return cached;

  const data = await finnhubFetch<any>(`/stock/price-target?symbol=${symbol}`);
  if (!data || !data.targetMean) return null;

  const result: PriceTarget = {
    symbol: data.symbol || symbol,
    targetHigh: data.targetHigh || 0,
    targetLow: data.targetLow || 0,
    targetMean: data.targetMean || 0,
    targetMedian: data.targetMedian || 0,
    lastUpdated: data.lastUpdated || "",
  };

  setCache(cacheKey, result);
  return result;
}

// ─── 기업 뉴스 ───

export async function fetchCompanyNews(symbol: string, days: number = 7): Promise<CompanyNewsItem[]> {
  const cacheKey = `cnews_${symbol}_${days}`;
  const cached = getCached<CompanyNewsItem[]>(cacheKey);
  if (cached) return cached;

  const to = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

  const data = await finnhubFetch<any[]>(`/company-news?symbol=${symbol}&from=${from}&to=${to}`);
  if (!data || !Array.isArray(data)) return [];

  const news: CompanyNewsItem[] = data
    .filter((n: any) => n.headline)
    .slice(0, 15)
    .map((n: any) => ({
      id: n.id,
      symbol,
      headline: n.headline,
      summary: n.summary || "",
      source: n.source || "Unknown",
      url: n.url,
      datetime: n.datetime,
      image: n.image || "",
      category: n.category || "general",
    }));

  setCache(cacheKey, news);
  return news;
}

// ─── 종합 리포트 (메인 페이지용) ───

export async function fetchCorporateOverview(watchlistSymbols: string[]): Promise<CorporateReportData> {
  const cacheKey = `overview_${watchlistSymbols.sort().join(",")}`;
  const cached = getCached<CorporateReportData>(cacheKey);
  if (cached) return cached;

  // 병렬 호출
  const [earnings, watchlistEarnings] = await Promise.all([
    fetchEarningsCalendar(),
    fetchWatchlistEarnings(watchlistSymbols),
  ]);

  // 주요 종목 뉴스 (관심종목 중 최대 5개)
  const topSymbols = watchlistSymbols.slice(0, 5);
  const newsArrays = await Promise.all(
    topSymbols.map((s) => fetchCompanyNews(s, 3))
  );
  const allNews = newsArrays.flat().sort((a, b) => b.datetime - a.datetime).slice(0, 20);

  const result: CorporateReportData = {
    earnings: earnings.slice(0, 50),
    watchlistEarnings,
    news: allNews,
    fetchedAt: Date.now(),
  };

  setCache(cacheKey, result);
  return result;
}
