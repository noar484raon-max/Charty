import { NextResponse } from "next/server";

// 크립토 공탐 지수만 서버에서 처리 (CNN은 클라이언트에서 직접 호출)

interface CryptoResponse {
  crypto: {
    value: number;
    label: string;
    previousValue: number;
    updatedAt: string;
  };
}

let cache: { data: CryptoResponse | null; expiry: number } = { data: null, expiry: 0 };
const CACHE_TTL = 15 * 60 * 1000;

function getLabel(value: number): string {
  if (value <= 20) return "극도의 공포";
  if (value <= 40) return "공포";
  if (value <= 60) return "중립";
  if (value <= 80) return "탐욕";
  return "극도의 탐욕";
}

export async function GET() {
  try {
    if (cache.data && Date.now() < cache.expiry) {
      return NextResponse.json(cache.data);
    }

    const res = await fetch("https://api.alternative.me/fng/?limit=2&format=json", {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Crypto API error" }, { status: 502 });
    }

    const data = await res.json();
    const entries = data?.data;

    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: "No data" }, { status: 502 });
    }

    const value = parseInt(entries[0].value, 10);
    const prevValue = entries.length > 1 ? parseInt(entries[1].value, 10) : value;

    const result: CryptoResponse = {
      crypto: {
        value,
        label: getLabel(value),
        previousValue: prevValue,
        updatedAt: new Date().toISOString(),
      },
    };

    cache = { data: result, expiry: Date.now() + CACHE_TTL };
    return NextResponse.json(result);
  } catch (e) {
    console.error("[FearGreed] API error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
