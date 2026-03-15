import { NextRequest, NextResponse } from "next/server";
import {
  fetchCryptoData,
  fetchStockData,
  fetchChartByInterval,
  searchAssets,
} from "@/server/services/market";
import type { ChartInterval } from "@/server/services/market";

const VALID_INTERVALS: ChartInterval[] = ["daily", "weekly", "monthly", "yearly"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const symbol = searchParams.get("symbol") || "";
  const days = parseInt(searchParams.get("days") || "7");
  const query = searchParams.get("q") || "";
  const interval = searchParams.get("interval") as ChartInterval | null;
  const subRange = searchParams.get("subRange") || undefined;

  try {
    // 검색
    if (type === "search") {
      const results = await searchAssets(query);
      return NextResponse.json(results);
    }

    // 새로운 인터벌 기반 API (토스 방식)
    if (interval && VALID_INTERVALS.includes(interval)) {
      const assetType = type === "crypto" ? "crypto" : "us_stock";
      const data = await fetchChartByInterval(symbol, assetType, interval, subRange);
      return NextResponse.json(data);
    }

    // 레거시: days 기반
    if (type === "crypto") {
      const data = await fetchCryptoData(symbol, days);
      return NextResponse.json(data);
    }

    if (type === "us_stock" || type === "stock") {
      const data = await fetchStockData(symbol, days);
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (e) {
    console.error("Market API error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
