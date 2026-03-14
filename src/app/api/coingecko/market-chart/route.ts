import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const coinId = url.searchParams.get("coinId") ?? "bitcoin";
  const vsCurrency = url.searchParams.get("vsCurrency") ?? "usd";
  const days = url.searchParams.get("days") ?? "7";

  const upstream = new URL(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
      coinId
    )}/market_chart`
  );
  upstream.searchParams.set("vs_currency", vsCurrency);
  upstream.searchParams.set("days", days);

  const res = await fetch(upstream, {
    headers: {
      accept: "application/json"
    },
    next: { revalidate: 30 }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      {
        error: "upstream_error",
        status: res.status,
        details: text.slice(0, 500)
      },
      { status: 502 }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}

