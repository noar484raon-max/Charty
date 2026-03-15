import { NextRequest, NextResponse } from "next/server";
import { fetchFundamentals } from "@/server/services/fundamentals";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "";
  const type = (searchParams.get("type") || "us_stock") as "us_stock" | "crypto";

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  try {
    const data = await fetchFundamentals(symbol, type);
    // 디버깅: 주요 필드 로그
    console.log(`[API/fundamentals] ${symbol} (${type}): PE=${data.trailingPE}, PB=${data.priceToBook}, PS=${data.priceToSales}, price=${data.currentPrice}, sector=${data.sector}`);
    return NextResponse.json(data);
  } catch (e) {
    console.error("Fundamentals API error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
