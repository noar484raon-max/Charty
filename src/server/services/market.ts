import { generateMockData } from "@/lib/utils";

// ─── 기본 가격 (API 실패 시 mock fallback용) ───

const CRYPTO_BASES: Record<string, number> = {
  bitcoin: 70000, ethereum: 2800, solana: 140, ripple: 0.55, cardano: 0.45,
  dogecoin: 0.08, "avalanche-2": 35, chainlink: 15, polkadot: 7, polygon: 0.8,
};

const US_STOCK_BASES: Record<string, number> = {
  AAPL: 182, NVDA: 900, MSFT: 420, TSLA: 250, AMZN: 210, META: 580, GOOGL: 175,
  JPM: 230, V: 290, JNJ: 160, WMT: 175, MA: 470, PG: 165, DIS: 110, NFLX: 700,
  AMD: 160, INTC: 32, BA: 190, CRM: 290, UBER: 75, COST: 920, AVGO: 1700,
  LLY: 780, UNH: 520, HD: 380, ABBV: 175, MRK: 130, PEP: 170, KO: 62,
  TMO: 570, ADBE: 490, CSCO: 50, ACN: 340, MCD: 290, LIN: 450, ABT: 115,
  DHR: 250, TXN: 170, PM: 100, NEE: 75, QCOM: 170, RTX: 105, UPS: 150,
  ISRG: 400, AMAT: 195, SBUX: 95, GS: 470, BLK: 800, BKNG: 3700,
  GILD: 85, MDLZ: 75, ADP: 250, PYPL: 65, SQ: 75, SHOP: 80,
};

const KR_STOCK_BASES: Record<string, number> = {
  "005930": 72000, "000660": 180000, "373220": 380000, "207940": 750000,
  "005380": 250000, "000270": 120000, "068270": 190000, "035420": 210000,
  "035720": 42000, "051910": 340000, "006400": 380000, "028260": 130000,
  "105560": 75000, "055550": 52000, "034730": 170000, "003670": 250000,
  "012330": 230000, "066570": 95000, "003550": 80000, "032830": 65000,
};

// ─── 메모리 캐시 (API rate limit 대응) ───

type CacheEntry = { data: any[]; ts: number };
const cache = new Map<string, CacheEntry>();

function getCached(key: string, ttlMs: number): any[] | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return null;
}

function setCache(key: string, data: any[]) {
  cache.set(key, { data, ts: Date.now() });
  // 캐시 크기 제한 (최대 200개)
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

// ─── 암호화폐 (CoinGecko) ───

export async function fetchCryptoData(symbol: string, days: number) {
  const cacheKey = `crypto_${symbol}_${days}`;
  const cached = getCached(cacheKey, 60_000); // 1분 캐시
  if (cached) return cached;

  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/${symbol}/market_chart?vs_currency=usd&days=${days}`,
      { next: { revalidate: 60 } }
    );
    if (!r.ok) throw new Error(`CoinGecko API error: ${r.status}`);
    const d = await r.json();
    const result = (d.prices || []).map(([t, v]: [number, number], i: number) => ({
      time: Math.floor(t / 1000),
      value: parseFloat(v.toFixed(2)),
      volume: d.total_volumes?.[i]?.[1] ?? 0,
    }));
    setCache(cacheKey, result);
    return result;
  } catch (e) {
    console.warn(`CoinGecko fallback for ${symbol}:`, e);
    return generateMockData(days, CRYPTO_BASES[symbol] || 100, symbol);
  }
}

// ─── 미국 주식 (Alpha Vantage) ───

/**
 * Alpha Vantage 함수 매핑:
 * - 1D (days=1)  → TIME_SERIES_INTRADAY (15분 간격)
 * - 1W~1Y       → TIME_SERIES_DAILY (일봉)
 * - 5Y          → TIME_SERIES_WEEKLY (주봉)
 * - ALL         → TIME_SERIES_MONTHLY (월봉)
 */
export async function fetchStockData(symbol: string, days: number) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return generateMockData(days, US_STOCK_BASES[symbol] || 180, symbol);
  }

  const cacheKey = `stock_${symbol}_${days}`;
  const cacheTTL = days <= 1 ? 60_000 : 5 * 60_000; // 1D: 1분, 나머지: 5분
  const cached = getCached(cacheKey, cacheTTL);
  if (cached) return cached;

  try {
    let url: string;
    let seriesKey: string;
    let sliceCount: number;

    if (days <= 1) {
      // 인트라데이 (15분봉)
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=15min&outputsize=compact&apikey=${apiKey}`;
      seriesKey = "Time Series (15min)";
      sliceCount = 96; // 하루 약 96개 (15분 × 24시간)
    } else if (days <= 365) {
      // 일봉
      const outputSize = days > 100 ? "full" : "compact";
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=${outputSize}&apikey=${apiKey}`;
      seriesKey = "Time Series (Daily)";
      sliceCount = days;
    } else if (days <= 1825) {
      // 주봉 (5Y)
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY&symbol=${symbol}&apikey=${apiKey}`;
      seriesKey = "Weekly Time Series";
      sliceCount = Math.ceil(days / 7);
    } else {
      // 월봉 (ALL)
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY&symbol=${symbol}&apikey=${apiKey}`;
      seriesKey = "Monthly Time Series";
      sliceCount = Math.ceil(days / 30);
    }

    const r = await fetch(url, { next: { revalidate: cacheTTL / 1000 } });
    if (!r.ok) throw new Error(`Alpha Vantage HTTP ${r.status}`);
    const d = await r.json();

    // API rate limit 에러 체크
    if (d["Note"] || d["Information"]) {
      console.warn("Alpha Vantage rate limit:", d["Note"] || d["Information"]);
      return generateMockData(days, US_STOCK_BASES[symbol] || 180, symbol);
    }

    const series = d[seriesKey];
    if (!series) throw new Error("No series data");

    const entries = Object.entries(series).slice(0, sliceCount);
    const result = entries
      .reverse()
      .map(([date, vals]: [string, any]) => ({
        time: Math.floor(new Date(date).getTime() / 1000),
        value: parseFloat(vals["4. close"]),
        volume: parseInt(vals["5. volume"] || "0"),
      }));

    if (result.length > 0) {
      setCache(cacheKey, result);
    }
    return result.length > 0 ? result : generateMockData(days, US_STOCK_BASES[symbol] || 180, symbol);
  } catch (e) {
    console.warn(`Alpha Vantage fallback for ${symbol}:`, e);
    return generateMockData(days, US_STOCK_BASES[symbol] || 180, symbol);
  }
}

// ─── 한국 주식 (mock — 향후 KRX/Naver API 연동 예정) ───

export async function fetchKrStockData(symbol: string, days: number) {
  return generateMockData(days, KR_STOCK_BASES[symbol] || 100000, symbol);
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
