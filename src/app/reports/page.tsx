"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  EarningsEvent,
  PriceTarget,
  CompanyNewsItem,
} from "@/server/services/corporate-reports";

// ─── 탭 ───
type Tab = "earnings" | "news";

// ─── 기본 관심종목 (로그인 없이도 표시) ───
const DEFAULT_WATCHLIST = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META"];

// ─── 서프라이즈 배지 ───
function SurpriseBadge({ label, surprise }: { label: string; surprise: number | null }) {
  const styles: Record<string, string> = {
    beat: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    miss: "bg-red-500/15 text-red-400 border-red-500/25",
    meet: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    upcoming: "bg-zinc-500/15 text-zinc-500 border-zinc-500/25",
  };
  const labels: Record<string, string> = {
    beat: "서프라이즈 ↑",
    miss: "미스 ↓",
    meet: "부합",
    upcoming: "발표 예정",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles[label] || styles.upcoming}`}>
      {labels[label] || label}
      {surprise !== null && label !== "upcoming" && (
        <span className="font-mono">{surprise > 0 ? "+" : ""}{surprise.toFixed(1)}%</span>
      )}
    </span>
  );
}

// ─── 실적 캘린더 행 ───
function EarningsRow({ event, onSelectSymbol }: { event: EarningsEvent; onSelectSymbol: (s: string) => void }) {
  const hourLabel = event.hour === "bmo" ? "장전" : event.hour === "amc" ? "장후" : "";

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors">
      {/* 날짜 */}
      <div className="w-16 text-center shrink-0">
        <div className="text-[11px] text-zinc-500">
          {new Date(event.date + "T00:00:00").toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
        </div>
        {hourLabel && <div className="text-[9px] text-zinc-600">{hourLabel}</div>}
      </div>

      {/* 심볼 */}
      <button
        onClick={() => onSelectSymbol(event.symbol)}
        className="text-[14px] font-bold text-accent hover:underline w-16 text-left shrink-0"
      >
        {event.symbol}
      </button>

      {/* EPS */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-zinc-500">EPS 예상</span>
          <span className="text-zinc-300 font-mono">
            {event.epsEstimate !== null ? `$${event.epsEstimate.toFixed(2)}` : "-"}
          </span>
          {event.epsActual !== null && (
            <>
              <span className="text-zinc-600">→</span>
              <span className={`font-mono font-bold ${
                event.epsActual > (event.epsEstimate || 0) ? "text-emerald-400" : "text-red-400"
              }`}>
                ${event.epsActual.toFixed(2)}
              </span>
            </>
          )}
        </div>
        {event.revenueEstimate !== null && (
          <div className="flex items-center gap-2 text-[10px] mt-0.5">
            <span className="text-zinc-600">매출 예상</span>
            <span className="text-zinc-400 font-mono">
              {(event.revenueEstimate / 1e9).toFixed(1)}B
            </span>
            {event.revenueActual !== null && (
              <>
                <span className="text-zinc-700">→</span>
                <span className={`font-mono ${
                  event.revenueActual > event.revenueEstimate ? "text-emerald-400" : "text-red-400"
                }`}>
                  {(event.revenueActual / 1e9).toFixed(1)}B
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* 서프라이즈 */}
      <div className="shrink-0">
        <SurpriseBadge label={event.surpriseLabel} surprise={event.surprise} />
      </div>
    </div>
  );
}

// ─── 기업 뉴스 행 ───
function NewsRow({ item }: { item: CompanyNewsItem }) {
  const date = new Date(item.datetime * 1000).toLocaleDateString("ko-KR", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors group"
    >
      {item.image && (
        <img
          src={item.image}
          alt=""
          className="w-16 h-12 rounded-lg object-cover flex-shrink-0 bg-surface-2"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px] font-bold text-accent">{item.symbol}</span>
          <span className="text-[10px] text-zinc-600">·</span>
          <span className="text-[10px] text-zinc-500">{item.source}</span>
          <span className="text-[10px] text-zinc-600">·</span>
          <span className="text-[10px] text-zinc-500">{date}</span>
        </div>
        <div className="text-[13px] text-zinc-200 font-medium leading-snug line-clamp-2 group-hover:text-white transition-colors">
          {item.headline}
        </div>
      </div>
    </a>
  );
}

// ─── 목표가 카드 ───
function PriceTargetCard({ target }: { target: PriceTarget }) {
  return (
    <div className="bg-surface border border-white/[0.06] rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[14px] font-bold text-accent">{target.symbol}</span>
        <span className="text-[10px] text-zinc-500">{target.lastUpdated}</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-[9px] text-zinc-500 mb-0.5">최저</div>
          <div className="text-[12px] font-mono text-red-400">${target.targetLow}</div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-500 mb-0.5">평균</div>
          <div className="text-[12px] font-mono text-zinc-200 font-bold">${target.targetMean}</div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-500 mb-0.5">중간</div>
          <div className="text-[12px] font-mono text-zinc-300">${target.targetMedian}</div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-500 mb-0.5">최고</div>
          <div className="text-[12px] font-mono text-emerald-400">${target.targetHigh}</div>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ───
export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("earnings");
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [watchlistEarnings, setWatchlistEarnings] = useState<EarningsEvent[]>([]);
  const [news, setNews] = useState<CompanyNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [priceTarget, setPriceTarget] = useState<PriceTarget | null>(null);
  const [ptLoading, setPtLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const symbols = DEFAULT_WATCHLIST.join(",");
      const res = await fetch(`/api/corporate-reports?mode=overview&symbols=${symbols}`);
      const data = await res.json();
      if (data.earnings) setEarnings(data.earnings);
      if (data.watchlistEarnings) setWatchlistEarnings(data.watchlistEarnings);
      if (data.news) setNews(data.news);
    } catch {
      console.error("Failed to load corporate reports");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // 심볼 선택 시 목표가 로드
  const handleSelectSymbol = useCallback(async (symbol: string) => {
    setSelectedSymbol(symbol);
    setPtLoading(true);
    setPriceTarget(null);
    try {
      const res = await fetch(`/api/corporate-reports?mode=target&symbol=${symbol}`);
      if (res.ok) {
        const data = await res.json();
        setPriceTarget(data);
      }
    } catch { /* ignore */ }
    setPtLoading(false);
  }, []);

  return (
    <main className="h-[100dvh] flex flex-col md:flex-row overflow-hidden">
      {/* 좌측: 메인 콘텐츠 */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* 헤더 */}
        <div className="px-4 md:px-6 pt-4 pb-2">
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">
              <span className="text-accent">Corporate</span> Reports
            </h1>
            <span className="hidden sm:block text-xs text-zinc-500 bg-surface border border-white/[0.06] rounded-full px-2.5 py-0.5">
              실적 발표 · 목표가 · 기업 뉴스
            </span>
          </div>

          {/* 탭 */}
          <div className="flex gap-1">
            {[
              { key: "earnings" as Tab, label: "실적 캘린더", icon: "📊" },
              { key: "news" as Tab, label: "기업 뉴스", icon: "📰" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  tab === t.key
                    ? "bg-accent text-black font-semibold"
                    : "bg-surface text-zinc-500 hover:text-zinc-300 border border-white/[0.06]"
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 콘텐츠 영역 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 pb-20 md:pb-6">
          {loading ? (
            <div className="flex items-center justify-center h-40 gap-2">
              <div className="w-5 h-5 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
              <span className="text-sm text-zinc-400">데이터 로딩 중...</span>
            </div>
          ) : tab === "earnings" ? (
            <div>
              {/* 관심종목 실적 */}
              {watchlistEarnings.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-[13px] font-bold text-zinc-300 mb-2 flex items-center gap-1.5">
                    <span className="text-yellow-500">★</span> 관심종목 실적
                  </h2>
                  <div className="bg-surface border border-white/[0.06] rounded-xl p-3">
                    {watchlistEarnings.map((e, i) => (
                      <EarningsRow key={`${e.symbol}-${e.date}-${i}`} event={e} onSelectSymbol={handleSelectSymbol} />
                    ))}
                  </div>
                </div>
              )}

              {/* 전체 실적 캘린더 */}
              <h2 className="text-[13px] font-bold text-zinc-300 mb-2">
                향후 2주 실적 발표 일정
              </h2>
              {earnings.length === 0 ? (
                <div className="text-center py-12 text-sm text-zinc-500">예정된 실적 발표가 없습니다</div>
              ) : (
                <div className="bg-surface border border-white/[0.06] rounded-xl p-3">
                  {earnings.slice(0, 30).map((e, i) => (
                    <EarningsRow key={`${e.symbol}-${e.date}-${i}`} event={e} onSelectSymbol={handleSelectSymbol} />
                  ))}
                  {earnings.length > 30 && (
                    <div className="text-center py-2 text-[11px] text-zinc-500">
                      +{earnings.length - 30}개 더...
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              {news.length === 0 ? (
                <div className="text-center py-12 text-sm text-zinc-500">최근 기업 뉴스가 없습니다</div>
              ) : (
                <div className="bg-surface border border-white/[0.06] rounded-xl p-3">
                  {news.map((n) => (
                    <NewsRow key={n.id} item={n} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 우측: 목표가 패널 */}
      <div className={`
        md:w-[340px] lg:w-[380px] bg-surface border-l border-white/[0.06]
        ${selectedSymbol ? "flex-1 md:flex-none" : "hidden md:block"}
        flex flex-col min-h-0
      `}>
        {selectedSymbol && (
          <div className="md:hidden flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
            <button onClick={() => setSelectedSymbol(null)}
              className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M15 19l-7-7 7-7" />
              </svg>
              돌아가기
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {!selectedSymbol ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
              <div className="text-4xl mb-3">📋</div>
              <div className="text-[15px] font-bold text-zinc-300 mb-1">종목을 선택하세요</div>
              <div className="text-[12px] text-zinc-500 max-w-[240px]">
                실적 캘린더에서 종목을 클릭하면 애널리스트 목표가와 상세 정보를 볼 수 있습니다
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl font-extrabold text-accent">{selectedSymbol}</span>
                <span className="text-sm text-zinc-500">애널리스트 목표가</span>
              </div>

              {ptLoading ? (
                <div className="flex items-center gap-2 py-8 justify-center">
                  <div className="w-4 h-4 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
                  <span className="text-sm text-zinc-400">목표가 로딩...</span>
                </div>
              ) : priceTarget ? (
                <PriceTargetCard target={priceTarget} />
              ) : (
                <div className="text-center py-8 text-sm text-zinc-500">목표가 데이터가 없습니다</div>
              )}

              <div className="mt-4 text-[9px] text-zinc-600 text-center">
                Finnhub 제공 · 투자 참고용
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
