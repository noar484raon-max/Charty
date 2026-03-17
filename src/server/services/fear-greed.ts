/**
 * Fear & Greed Index Service
 * - CNN Fear & Greed Index: CNN 비공식 API
 * - Crypto Fear & Greed Index: alternative.me 무료 API
 */

// ─── 타입 ───

export interface FearGreedData {
  stock: {
    value: number;        // 0~100
    label: string;        // 극도의 공포 ~ 극도의 탐욕
    previousClose: number;
    weekAgo: number;
    updatedAt: string;
  };
  crypto: {
    value: number;        // 0~100
    label: string;
    previousValue: number;
    updatedAt: string;
  };
}

// ─── 라벨 ───

function getLabel(value: number): string {
  if (value <= 20) return "극도의 공포";
  if (value <= 40) return "공포";
  if (value <= 60) return "중립";
  if (value <= 80) return "탐욕";
  return "극도의 탐욕";
}

// ─── 캐시 ───

let fgCache: { data: FearGreedData | null; expiry: number } = { data: null, expiry: 0 };
const CACHE_TTL = 15 * 60 * 1000; // 15분

// ─── CNN Fear & Greed (비공식) ───

async function fetchCNNFearGreed(): Promise<{ value: number; previousClose: number; weekAgo: number } | null> {
  try {
    const res = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error(`[FearGreed] CNN API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const current = data?.fear_and_greed?.score;
    const previousClose = data?.fear_and_greed?.previous_close;
    const weekAgo = data?.fear_and_greed?.previous_1_week;

    if (current == null) return null;

    return {
      value: Math.round(current),
      previousClose: Math.round(previousClose || current),
      weekAgo: Math.round(weekAgo || current),
    };
  } catch (e) {
    console.error("[FearGreed] CNN fetch error:", e);
    return null;
  }
}

// ─── Crypto Fear & Greed (alternative.me - 무료) ───

async function fetchCryptoFearGreed(): Promise<{ value: number; previousValue: number } | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=2&format=json", {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error(`[FearGreed] Crypto API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const entries = data?.data;

    if (!entries || entries.length === 0) return null;

    return {
      value: parseInt(entries[0].value, 10),
      previousValue: entries.length > 1 ? parseInt(entries[1].value, 10) : parseInt(entries[0].value, 10),
    };
  } catch (e) {
    console.error("[FearGreed] Crypto fetch error:", e);
    return null;
  }
}

// ─── 종합 ───

export async function fetchFearGreedIndex(): Promise<FearGreedData> {
  if (fgCache.data && Date.now() < fgCache.expiry) {
    return fgCache.data;
  }

  const [stockData, cryptoData] = await Promise.all([
    fetchCNNFearGreed(),
    fetchCryptoFearGreed(),
  ]);

  const now = new Date().toISOString();

  const result: FearGreedData = {
    stock: {
      value: stockData?.value ?? 50,
      label: getLabel(stockData?.value ?? 50),
      previousClose: stockData?.previousClose ?? 50,
      weekAgo: stockData?.weekAgo ?? 50,
      updatedAt: now,
    },
    crypto: {
      value: cryptoData?.value ?? 50,
      label: getLabel(cryptoData?.value ?? 50),
      previousValue: cryptoData?.previousValue ?? 50,
      updatedAt: now,
    },
  };

  fgCache = { data: result, expiry: Date.now() + CACHE_TTL };
  return result;
}
