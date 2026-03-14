import { NextRequest, NextResponse } from "next/server";
import { fetchCryptoData, fetchStockData, fetchKrStockData, searchAssets } from "@/server/services/market";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // crypto | stock | search
  const symbol = searchParams.get("symbol") || "";
  const days = parseInt(searchParams.get("days") || "7");
  const query = searchParams.get("q") || "";

  try {
    if (type === "search") {
      const results = await searchAssets(query);
      return NextResponse.json(results);
    }

    if (type === "crypto") {
      const data = await fetchCryptoData(symbol, days);
      return NextResponse.json(data);
    }

    if (type === "us_stock") {
      const data = await fetchStockData(symbol, days);
      return NextResponse.json(data);
    }

    if (type === "kr_stock") {
      const data = await fetchKrStockData(symbol, days);
      return NextResponse.json(data);
    }

    // backward compat
    if (type === "stock") {
      const data = await fetchStockData(symbol, days);
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (e) {
    console.error("Market API error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
