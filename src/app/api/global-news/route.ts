import { NextRequest, NextResponse } from "next/server";
import { fetchCountryNews, fetchAllCountrySummaries } from "@/server/services/global-news";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country");
  const mode = searchParams.get("mode"); // "summary" | null

  try {
    if (mode === "summary") {
      const summaries = await fetchAllCountrySummaries();
      return NextResponse.json(summaries);
    }

    if (!country) {
      return NextResponse.json({ error: "country parameter required" }, { status: 400 });
    }

    const data = await fetchCountryNews(country);
    if (!data) {
      return NextResponse.json({ error: "Unknown country code" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (e) {
    console.error("Global news API error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
