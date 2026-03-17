import { NextRequest, NextResponse } from "next/server";
import {
  fetchEarningsCalendar,
  fetchWatchlistEarnings,
  fetchPriceTarget,
  fetchCompanyNews,
  fetchCorporateOverview,
} from "@/server/services/corporate-reports";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode"); // overview | earnings | target | news
  const symbol = searchParams.get("symbol");
  const symbols = searchParams.get("symbols"); // comma-separated
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    // 종합 리포트
    if (mode === "overview") {
      const watchlist = symbols ? symbols.split(",").map((s) => s.trim()) : [];
      const data = await fetchCorporateOverview(watchlist);
      return NextResponse.json(data);
    }

    // 실적 캘린더
    if (mode === "earnings") {
      if (symbols) {
        const list = symbols.split(",").map((s) => s.trim());
        const data = await fetchWatchlistEarnings(list);
        return NextResponse.json(data);
      }
      const data = await fetchEarningsCalendar(from || undefined, to || undefined);
      return NextResponse.json(data);
    }

    // 목표가
    if (mode === "target" && symbol) {
      const data = await fetchPriceTarget(symbol);
      if (!data) return NextResponse.json({ error: "No data" }, { status: 404 });
      return NextResponse.json(data);
    }

    // 기업 뉴스
    if (mode === "news" && symbol) {
      const data = await fetchCompanyNews(symbol);
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Invalid params. Use mode=overview|earnings|target|news" }, { status: 400 });
  } catch (e) {
    console.error("[CorporateReports] API error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
