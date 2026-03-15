import { generateMockData } from "@/lib/utils";

// ─── 타입 ───

export type ChartInterval = "daily" | "weekly" | "monthly" | "yearly";

// ─── Yahoo Finance 심볼 변환 ───

function toYahooSymbol(symbol: string, type: "us_stock" | "crypto"): string {
  if (type === "crypto") {
    const CRYPTO_MAP: Record<string, string> = {
      bitcoin: "BTC-USD",
      ethereum: "ETH-USD",
      solana: "SOL-USD",
      ripple: "XRP-USD",
      cardano: "ADA-USD",
      dogecoin: "DOGE-USD",
      "avalanche-2": "AVAX-USD",
      chainlink: "LINK-USD",
      polkadot: "DOT-USD",
      polygon: "MATIC-USD",
    };
    return CRYPTO_MAP[symbol] || `${symbol.toUpperCase()}-USD`;
  }
  return symbol; // US stock은 그대로
}

// ─── 인터벌별 Yahoo Finance 파라미터 ───
// 토스증권 방식: 캔들 타입에 따라 적절한 기간의 데이터를 가져옴

function getYahooParamsForInterval(
  interval: ChartInterval,
  subRange?: string
): { range: string; interval: string } {
  switch (interval) {
    case "daily":
      return { range: subRange || "1y", interval: "1d" };
    case "weekly":
      return { range: subRange || "max", interval: "1wk" };
    case "monthly":
      return { range: subRange || "max", interval: "1mo" };
    case "yearly":
      // Yahoo에는 연봉 인터벌이 없으므로 월봉으로 가져온 후 집계
      return { range: "max", interval: "1mo" };
  }
}

// ─── 레거시: 기간(days) 기반 Yahoo Finance 파라미터 ───

function getYahooParams(days: number): { range: string; interval: string } {
  if (days <= 1) return { range: "1d", interval: "5m" };
  if (days <= 7) return { range: "5d", interval: "15m" };
  if (days <= 30) return { range: "1mo", interval: "1h" };
  if (days <= 90) return { range: "3mo", interval: "1d" };
  if (days <= 365) return { range: "1y", interval: "1d" };
  if (days <= 1825) return { range: "5y", interval: "1wk" };
  return { range: "max", interval: "1mo" };
}

// ─── 연봉 데이터 집계 (월봉 → 연봉, OHLC 포함) ───

function aggregateToYearly(data: ChartDataPoint[]): ChartDataPoint[] {
  const yearMap = new Map<
    number,
    { time: number; open: number; high: number; low: number; close: number; volume: number }
  >();

  for (const d of data) {
    const year = new Date(d.time * 1000).getFullYear();
    const existing = yearMap.get(year);

    if (!existing) {
      yearMap.set(year, {
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
      });
    } else {
      yearMap.set(year, {
        time: d.time,        // 마지막 시점
        open: existing.open,  // 첫 번째 달의 시가 유지
        high: Math.max(existing.high, d.high),
        low: Math.min(existing.low, d.low),
        close: d.close,       // 마지막 달의 종가
        volume: existing.volume + d.volume,
      });
    }
  }

  return Array.from(yearMap.values())
    .map((v) => ({
      time: v.time,
      value: v.close,
      open: v.open,
      high: v.high,
      low: v.low,
      close: v.close,
      volume: v.volume,
    }))
    .sort((a, b) => a.time - b.time);
}

// ─── 메모리 캐시 ───

type CacheEntry = { data: any[]; ts: number };
const cache = new Map<string, CacheEntry>();

function getCached(key: string, ttlMs: number): any[] | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return null;
}

function setCache(key: string, data: any[]) {
  cache.set(key, { data, ts: Date.now() });
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

// ─── Fallback 가격 ───

const FALLBACK_BASES: Record<string, number> = {
  AAPL: 182, NVDA: 900, MSFT: 420, TSLA: 250, AMZN: 210, META: 580, GOOGL: 175,
  JPM: 230, V: 290, JNJ: 160, WMT: 175, MA: 470, PG: 165, DIS: 110, NFLX: 700,
  AMD: 160, INTC: 32, BA: 190, CRM: 290, UBER: 75, COST: 920, AVGO: 1700,
  LLY: 780, UNH: 520, HD: 380, ABBV: 175, MRK: 130, PEP: 170, KO: 62,
  TMO: 570, ADBE: 490, CSCO: 50, MCD: 290, LIN: 450, ABT: 115,
  QCOM: 170, RTX: 105, ISRG: 400, AMAT: 195, SBUX: 95, GS: 470, BLK: 800,
  BKNG: 3700, GILD: 85, PYPL: 65, SQ: 75, SHOP: 80, NEE: 75, NKE: 95, ORCL: 180,
  bitcoin: 70000, ethereum: 2800, solana: 140, ripple: 0.55, cardano: 0.45,
  dogecoin: 0.08, "avalanche-2": 35, chainlink: 15, polkadot: 7, polygon: 0.8,
};

// ─── Yahoo Finance 공통 파싱 (OHLC 포함) ───

export type ChartDataPoint = {
  time: number;
  value: number;   // close 가격 (라인 차트용)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function parseYahooResponse(json: any): ChartDataPoint[] {
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps = result.timestamp || [];
  const quotes = result.indicators?.quote?.[0] || {};
  const opens = quotes.open || [];
  const highs = quotes.high || [];
  const lows = quotes.low || [];
  const closes = quotes.close || [];
  const volumes = quotes.volume || [];

  return timestamps
    .map((t: number, i: number) => {
      const c = closes[i];
      if (c == null) return null;
      const close = parseFloat(Number(c).toFixed(2));
      const open = opens[i] != null ? parseFloat(Number(opens[i]).toFixed(2)) : close;
      const high = highs[i] != null ? parseFloat(Number(highs[i]).toFixed(2)) : close;
      const low = lows[i] != null ? parseFloat(Number(lows[i]).toFixed(2)) : close;
      return {
        time: t,
        value: close,
        open,
        high,
        low,
        close,
        volume: volumes[i] || 0,
      };
    })
    .filter((p: any) => p !== null) as ChartDataPoint[];
}

// ─── 인터벌 기반 Yahoo Finance fetcher (새로운 방식) ───

async function fetchYahooByInterval(
  symbol: string,
  type: "us_stock" | "crypto",
  interval: ChartInterval,
  subRange?: string
): Promise<any[]> {
  const yahooSymbol = toYahooSymbol(symbol, type);
  const cacheKey = `yahoo_${yahooSymbol}_${interval}_${subRange || "default"}`;
  const cacheTTL = 5 * 60_000;
  const cached = getCached(cacheKey, cacheTTL);
  if (cached) return cached;

  try {
    const params = getYahooParamsForInterval(interval, subRange);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${params.range}&interval=${params.interval}&includePrePost=false`;

    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 300 },
    });

    if (!r.ok) throw new Error(`Yahoo Finance HTTP ${r.status}`);
    const json = await r.json();
    let data = parseYahooResponse(json);

    if (data.length === 0) throw new Error("Empty data");

    // 연봉은 월봉 데이터를 집계
    if (interval === "yearly") {
      data = aggregateToYearly(data);
    }

    setCache(cacheKey, data);
    console.log(
      `[Market] ${yahooSymbol} ${interval}(${subRange || "default"}): ${data.length} points`
    );
    return data;
  } catch (e) {
    console.warn(`[Market] Yahoo interval fetch failed for ${symbol} (${interval}):`, e);
    const fallbackDays =
      interval === "daily" ? 365 : interval === "weekly" ? 1825 : 3650;
    return generateMockData(fallbackDays, FALLBACK_BASES[symbol] || 100, symbol);
  }
}

// ─── 레거시: days 기반 Yahoo Finance fetcher ───

async function fetchYahooFinance(
  symbol: string,
  type: "us_stock" | "crypto",
  days: number
): Promise<any[]> {
  const yahooSymbol = toYahooSymbol(symbol, type);
  const cacheKey = `yahoo_${yahooSymbol}_${days}`;
  const cacheTTL = days <= 1 ? 60_000 : 5 * 60_000;
  const cached = getCached(cacheKey, cacheTTL);
  if (cached) return cached;

  try {
    const { range, interval } = getYahooParams(days);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=${interval}&includePrePost=false`;

    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: Math.floor(cacheTTL / 1000) },
    });

    if (!r.ok) throw new Error(`Yahoo Finance HTTP ${r.status}`);
    const json = await r.json();
    const data = parseYahooResponse(json);

    if (data.length > 0) {
      setCache(cacheKey, data);
      return data;
    }
    throw new Error("Empty data");
  } catch (e) {
    console.warn(`Yahoo Finance fallback for ${symbol} (${type}):`, e);
    return generateMockData(days, FALLBACK_BASES[symbol] || 100, symbol);
  }
}

// ─── 공개 API: 인터벌 기반 (새로운 방식) ───

export async function fetchChartByInterval(
  symbol: string,
  type: "us_stock" | "crypto",
  interval: ChartInterval,
  subRange?: string
): Promise<any[]> {
  // 암호화폐 일봉은 CoinGecko 우선 시도
  if (type === "crypto" && interval === "daily" && !subRange) {
    try {
      const cacheKey = `crypto_${symbol}_daily`;
      const cached = getCached(cacheKey, 60_000);
      if (cached) return cached;

      const r = await fetch(
        `https://api.coingecko.com/api/v3/coins/${symbol}/market_chart?vs_currency=usd&days=365`,
        { next: { revalidate: 60 } }
      );
      if (!r.ok) throw new Error(`CoinGecko API error: ${r.status}`);
      const d = await r.json();
      const result: ChartDataPoint[] = (d.prices || []).map(
        ([t, v]: [number, number], i: number) => {
          const price = parseFloat(v.toFixed(2));
          return {
            time: Math.floor(t / 1000),
            value: price,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: d.total_volumes?.[i]?.[1] ?? 0,
          };
        }
      );
      if (result.length > 0) {
        setCache(cacheKey, result);
        return result;
      }
    } catch {
      // CoinGecko 실패 → Yahoo Finance로 폴백
    }
  }

  return fetchYahooByInterval(symbol, type, interval, subRange);
}

// ─── 공개 API: 레거시 (days 기반) ───

export async function fetchCryptoData(symbol: string, days: number) {
  const cacheKey = `crypto_${symbol}_${days}`;
  const cached = getCached(cacheKey, 60_000);
  if (cached) return cached;

  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/${symbol}/market_chart?vs_currency=usd&days=${days}`,
      { next: { revalidate: 60 } }
    );
    if (!r.ok) throw new Error(`CoinGecko API error: ${r.status}`);
    const d = await r.json();
    const result: ChartDataPoint[] = (d.prices || []).map(
      ([t, v]: [number, number], i: number) => {
        const price = parseFloat(v.toFixed(2));
        return {
          time: Math.floor(t / 1000),
          value: price,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: d.total_volumes?.[i]?.[1] ?? 0,
        };
      }
    );
    if (result.length > 0) {
      setCache(cacheKey, result);
      return result;
    }
    throw new Error("Empty CoinGecko data");
  } catch {
    return fetchYahooFinance(symbol, "crypto", days);
  }
}

export async function fetchStockData(symbol: string, days: number) {
  return fetchYahooFinance(symbol, "us_stock", days);
}

// ─── 검색 ───

export async function searchAssets(query: string) {
  const q = query.toLowerCase();
  const { ASSETS } = await import("@/lib/assets");
  return ASSETS.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.ticker.toLowerCase().includes(q) ||
      a.symbol.toLowerCase().includes(q)
  ).slice(0, 10);
}
