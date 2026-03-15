import { NextRequest, NextResponse } from "next/server";
import { fetchSentiment } from "@/server/services/sentiment";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "";

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  try {
    const data = await fetchSentiment(symbol);
    console.log(`[API/sentiment] ${symbol}: score=${data.overallScore} (${data.overallLabel}), total=${data.total}`);
    return NextResponse.json(data);
  } catch (e) {
    console.error("Sentiment API error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
