import { generateMockData } from "@/lib/utils";

// ─── Yahoo Finance 심볼 변환 ───

function toYahooSymbol(symbol: string, type: "us_stock" | "kr_stock" | "crypto"): string {
  if (type === "kr_stock") return `${symbol}.KS`; // KOSPI
  if (type === "crypto") {
    // CoinGecko id → Yahoo ticker 매핑
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

// ─── 기간에 따른 Yahoo Finance 파라미터 ───

function getYahooParams(days: number): { range: string; interval: string } {
  if (days <= 1) return { range: "1d", interval: "5m" };
  if (days <= 7) return { range: "5d", interval: "15m" };
  if (days <= 30) return { range: "1mo", interval: "1h" };
  if (days <= 90) return { range: "3mo", interval: "1d" };
  if (days <= 365) return { range: "1y", interval: "1d" };
  if (days <= 1825) return { range: "5y", interval: "1wk" };
  return { range: "max", interval: "1mo" };
}

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
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

// ─── 기본 가격 (API 실패 시 mock fallback용) ───

const FALLBACK_BASES: Record<string, number> = {
  // US Stocks
  AAPL: 182, NVDA: 900, MSFT: 420, TSLA: 250, AMZN: 210, META: 580, GOOGL: 175,
  JPM: 230, V: 290, JNJ: 160, WMT: 175, MA: 470, PG: 165, DIS: 110, NFLX: 700,
  AMD: 160, INTC: 32, BA: 190, CRM: 290, UBER: 75, COST: 920, AVGO: 1700,
  LLY: 780, UNH: 520, HD: 380, ABBV: 175, MRK: 130, PEP: 170, KO: 62,
  TMO: 570, ADBE: 490, CSCO: 50, MCD: 290, LIN: 450, ABT: 115,
  QCOM: 170, RTX: 105, ISRG: 400, AMAT: 195, SBUX: 95, GS: 470, BLK: 800,
  BKNG: 3700, GILD: 85, PYPL: 65, SQ: 75, SHOP: 80, NEE: 75, NKE: 95,
  ORCL: 180,
  // Korean Stocks
  "005930": 72000, "000660": 180000, "373220": 380000, "207940": 750000,
  "005380": 250000, "000270": 120000, "068270": 190000, "035420": 210000,
  "035720": 42000, "051910": 340000, "006400": 380000, "028260": 130000,
  "105560": 75000, "055550": 52000, "034730": 170000, "003670": 250000,
  "012330": 230000, "066570": 95000, "003550": 80000, "032830": 65000,
  // Crypto
  bitcoin: 70000, ethereum: 2800, solana: 140, ripple: 0.55, cardano: 0.45,
  dogecoin: 0.08, "avalanche-2": 35, chainlink: 15, polkadot: 7, polygon: 0.8,
};

// ─── Yahoo Finance 통합 데이터 fetcher ───

async function fetchYahooFinance(
  symbol: string,
  type: "us_stock" | "kr_stock" | "crypto",
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: Math.floor(cacheTTL / 1000) },
    });

    if (!r.ok) throw new Error(`Yahoo Finance HTTP ${r.status}`);
    const d = await r.json();

    const result = d?.chart?.result?.[0];
    if (!result) throw new Error("No chart data");

    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};
    const closes = quotes.close || [];
    const volumes = quotes.volume || [];

    const data = timestamps
      .map((t: number, i: number) => ({
        time: t,
        value: closes[i] != null ? parseFloat(Number(closes[i]).toFixed(2)) : null,
        volume: volumes[i] || 0,
      }))
      .filter((p: any) => p.value !== null);

    if (data.length > 0) {
      setCache(cacheKey, data);
      return data;
    }
    throw new Error("Empty data after filtering");
  } catch (e) {
    console.warn(`Yahoo Finance fallback for ${symbol} (${type}):`, e);
    return generateMockData(days, FALLBACK_BASES[symbol] || 100, symbol);
  }
}

// ─── 공개 API 함수들 ───

export async function fetchCryptoData(symbol: string, days: number) {
  // CoinGecko를 1차로 시도 (암호화폐에 더 안정적), 실패시 Yahoo
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
    const result = (d.prices || []).map(([t, v]: [number, number], i: number) => ({
      time: Math.floor(t / 1000),
      value: parseFloat(v.toFixed(2)),
      volume: d.total_volumes?.[i]?.[1] ?? 0,
    }));
    if (result.length > 0) {
      setCache(cacheKey, result);
      return result;
    }
    throw new Error("Empty CoinGecko data");
  } catch {
    // CoinGecko 실패 시 Yahoo Finance로 fallback
    return fetchYahooFinance(symbol, "crypto", days);
  }
}

export async function fetchStockData(symbol: string, days: number) {
  return fetchYahooFinance(symbol, "us_stock", days);
}

export async function fetchKrStockData(symbol: string, days: number) {
  return fetchYahooFinance(symbol, "kr_stock", days);
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
