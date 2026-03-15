"use client";

import { useState, useEffect, useCallback } from "react";
import WorldMap from "@/components/world-map/WorldMap";
import NewsPanel from "@/components/world-map/NewsPanel";
import type { CountrySummary } from "@/server/services/global-news";

const QUICK_SELECT = [
  { code: "us", flag: "🇺🇸", name: "미국" },
  { code: "gb", flag: "🇬🇧", name: "영국" },
  { code: "jp", flag: "🇯🇵", name: "일본" },
  { code: "kr", flag: "🇰🇷", name: "한국" },
  { code: "cn", flag: "🇨🇳", name: "중국" },
  { code: "de", flag: "🇩🇪", name: "독일" },
  { code: "fr", flag: "🇫🇷", name: "프랑스" },
  { code: "in", flag: "🇮🇳", name: "인도" },
];

export default function GlobalNewsPage() {
  const [countries, setCountries] = useState<CountrySummary[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSummaries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/global-news?mode=summary");
      const data = await res.json();
      if (Array.isArray(data)) setCountries(data);
    } catch {
      console.error("Failed to load country summaries");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSummaries(); }, [loadSummaries]);

  return (
    <main className="h-[100dvh] flex flex-col md:flex-row overflow-hidden">
      {/* 좌측: 지도 영역 */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* 헤더 */}
        <div className="px-4 md:px-6 pt-4 pb-2">
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">
              <span className="text-accent">Global</span> News Pulse
            </h1>
            <span className="hidden sm:block text-xs text-zinc-500 bg-surface border border-white/[0.06] rounded-full px-2.5 py-0.5">
              실시간 글로벌 뉴스 감성
            </span>
          </div>

          {/* 국가 빠른 선택 */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            {QUICK_SELECT.map((c) => (
              <button key={c.code}
                onClick={() => setSelectedCountry(c.code)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                  selectedCountry === c.code
                    ? "bg-accent text-black font-semibold"
                    : "bg-surface text-zinc-500 hover:text-zinc-300 border border-white/[0.06] hover:border-white/10"
                }`}
              >
                <span>{c.flag}</span>
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 세계지도 */}
        <div className="flex-1 min-h-0 relative">
          {loading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
                <span className="text-sm text-zinc-400">글로벌 뉴스 데이터 로딩 중...</span>
              </div>
            </div>
          ) : (
            <WorldMap
              countries={countries}
              selectedCountry={selectedCountry}
              onSelectCountry={setSelectedCountry}
            />
          )}
        </div>

        {/* 하단 국가 감성 요약 (데스크톱) */}
        <div className="hidden md:block px-6 pb-4">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {countries.filter((c) => c.articleCount > 0).map((c) => (
              <button key={c.code}
                onClick={() => setSelectedCountry(c.code)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all shrink-0 ${
                  selectedCountry === c.code
                    ? "bg-white/[0.08] border-accent/30"
                    : "bg-surface border-white/[0.06] hover:border-white/10"
                }`}
              >
                <span className="text-base">{c.flag}</span>
                <div className="text-left">
                  <div className="text-[11px] font-medium text-zinc-300">{c.name}</div>
                  <div className={`text-[10px] font-semibold ${
                    c.sentiment >= 60 ? "text-emerald-400"
                    : c.sentiment >= 45 ? "text-blue-400"
                    : "text-red-400"
                  }`}>
                    {c.label} · {c.sentiment}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 우측: 뉴스 패널 */}
      <div className={`
        md:w-[380px] lg:w-[420px] bg-surface border-l border-white/[0.06]
        ${selectedCountry ? "flex-1 md:flex-none" : "hidden md:block"}
        flex flex-col min-h-0
      `}>
        {selectedCountry && (
          <div className="md:hidden flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
            <button onClick={() => setSelectedCountry(null)}
              className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M15 19l-7-7 7-7" />
              </svg>
              지도로 돌아가기
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-hidden">
          <NewsPanel countryCode={selectedCountry} />
        </div>
      </div>
    </main>
  );
}
