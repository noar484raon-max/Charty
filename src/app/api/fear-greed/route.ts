import { NextResponse } from "next/server";
import { fetchFearGreedIndex } from "@/server/services/fear-greed";

export async function GET() {
  try {
    const data = await fetchFearGreedIndex();
    return NextResponse.json(data);
  } catch (e) {
    console.error("[FearGreed] API error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
