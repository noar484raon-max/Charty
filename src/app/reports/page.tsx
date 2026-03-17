"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  EarningsEvent,
  PriceTarget,
  CompanyNewsItem,
} from "@/server/services/corporate-reports";

// ─── 탭 ───
type Tab = "earnings" | "news";

const DEFAULT_WATCHLIST = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META"];

// ─── 날짜 유틸 ───
function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay(); // 0=Sun
  const totalDays = last.getDate();
  return { startDay, totalDays, first, last };
}

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTHS_KO = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

// ─── 서프라이즈 배지 ───
function SurpriseBadge({ label, surprise }: { label: string; surprise: number | null }) {
  const styles: Record<string, string> = {
    beat: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    miss: "bg-red-500/15 text-red-400 border-red-500/25",
    meet: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    upcoming: "bg-zinc-500/15 text-zinc-500 border-zinc-500/25",
  };
  const labels: Record<string, string> = {
    beat: "Beat",
    miss: "Miss",
    meet: "부합",
    upcoming: "예정",
  };
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[9px] font-bold border ${styles[label] || styles.upcoming}`}>
      {labels[label] || label}
      {surprise !== null && label !== "upcoming" && (
        <span className="font-mono">{surprise > 0 ? "+" : ""}{surprise.toFixed(1)}%</span>
      )}
    </span>
  );
}

// ─── 목표가 카드 ───
function PriceTargetCard({ target }: { target: PriceTarget }) {
  return (
    <div className="bg-surface border border-white/[0.06] rounded-xl p-4 mb-4">
      <h3 className="text-[12px] font-bold text-zinc-400 mb-3">애널리스트 목표가</h3>
      <div className="grid grid-cols-4 gap-3 text-center">
        {[
          { label: "최저", value: target.targetLow, color: "text-red-400" },
          { label: "평균", value: target.targetMean, color: "text-zinc-100 font-bold" },
          { label: "중간", value: target.targetMedian, color: "text-zinc-300" },
          { label: "최고", value: target.targetHigh, color: "text-emerald-400" },
        ].map((t) => (
          <div key={t.label}>
            <div className="text-[9px] text-zinc-600 mb-1">{t.label}</div>
            <div className={`text-[13px] font-mono ${t.color}`}>${t.value}</div>
          </div>
        ))}
      </div>
      {target.lastUpdated && (
        <div className="text-[9px] text-zinc-600 text-right mt-2">{target.lastUpdated} 기준</div>
      )}
    </div>
  );
}

// ─── 기업 뉴스 행 ───
function NewsRow({ item }: { item: CompanyNewsItem }) {
  const date = new Date(item.datetime * 1000).toLocaleDateString("ko-KR", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer"
      className="flex items-start gap-3 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors group">
      {item.image && (
        <img src={item.image} alt="" className="w-16 h-12 rounded-lg object-cover flex-shrink-0 bg-surface-2"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
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

// ─── 캘린더 컴포넌트 ───
function EarningsCalendar({
  earnings,
  selectedDate,
  onSelectDate,
  currentMonth,
  onChangeMonth,
}: {
  earnings: EarningsEvent[];
  selectedDate: string | null;
  onSelectDate: (d: string) => void;
  currentMonth: Date;
  onChangeMonth: (d: Date) => void;
}) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const { startDay, totalDays } = getMonthDays(year, month);
  const today = toDateStr(new Date());

  // 날짜별 실적 이벤트 맵
  const earningsByDate = useMemo(() => {
    const map = new Map<string, EarningsEvent[]>();
    for (const e of earnings) {
      const list = map.get(e.date) || [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [earnings]);

  const prevMonth = () => onChangeMonth(new Date(year, month - 1, 1));
  const nextMonth = () => onChangeMonth(new Date(year, month + 1, 1));

  // 달력 셀 생성
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-surface border border-white/[0.06] rounded-xl overflow-hidden">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.05] text-zinc-400 hover:text-zinc-200 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-[14px] font-bold text-zinc-200">{year}년 {MONTHS_KO[month]}</span>
        <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.05] text-zinc-400 hover:text-zinc-200 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-white/[0.04]">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className={`text-center text-[10px] font-medium py-2 ${i === 0 ? "text-red-400/60" : i === 6 ? "text-blue-400/60" : "text-zinc-600"}`}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e${idx}`} className="min-h-[72px] border-b border-r border-white/[0.03]" />;

          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const events = earningsByDate.get(dateStr) || [];
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const dayOfWeek = (startDay + day - 1) % 7;
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={`min-h-[72px] p-1 border-b border-r border-white/[0.03] text-left transition-colors relative group ${
                isSelected
                  ? "bg-accent/10 border-accent/20"
                  : events.length > 0
                  ? "hover:bg-white/[0.04] cursor-pointer"
                  : "hover:bg-white/[0.02]"
              }`}
            >
              {/* 날짜 번호 */}
              <div className={`text-[11px] font-medium mb-0.5 ${
                isToday
                  ? "text-accent font-bold"
                  : isWeekend
                  ? dayOfWeek === 0 ? "text-red-400/50" : "text-blue-400/50"
                  : "text-zinc-500"
              }`}>
                {isToday ? (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-black text-[10px] font-bold">
                    {day}
                  </span>
                ) : day}
              </div>

              {/* 실적 이벤트 티커들 */}
              <div className="flex flex-wrap gap-[2px]">
                {events.slice(0, 4).map((e, i) => (
                  <span
                    key={`${e.symbol}-${i}`}
                    className={`text-[8px] px-1 py-0 rounded font-bold leading-tight ${
                      e.surpriseLabel === "beat"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : e.surpriseLabel === "miss"
                        ? "bg-red-500/20 text-red-400"
                        : e.surpriseLabel === "upcoming"
                        ? "bg-zinc-500/15 text-zinc-400"
                        : "bg-blue-500/15 text-blue-400"
                    }`}
                  >
                    {e.symbol}
                  </span>
                ))}
                {events.length > 4 && (
                  <span className="text-[8px] text-zinc-600 font-medium">+{events.length - 4}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── 메인 페이지 ───
export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("earnings");
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [news, setNews] = useState<CompanyNewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 캘린더 상태
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 상세 패널
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [priceTarget, setPriceTarget] = useState<PriceTarget | null>(null);
  const [symbolNews, setSymbolNews] = useState<CompanyNewsItem[]>([]);
  const [ptLoading, setPtLoading] = useState(false);

  // 데이터 로드 (이번 달 + 다음 달)
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const y = currentMonth.getFullYear();
      const m = currentMonth.getMonth();
      const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const to = `${y}-${String(m + 1).padStart(2, "0")}-${lastDay}`;

      const [earningsRes, overviewRes] = await Promise.all([
        fetch(`/api/corporate-reports?mode=earnings&from=${from}&to=${to}`),
        fetch(`/api/corporate-reports?mode=overview&symbols=${DEFAULT_WATCHLIST.join(",")}`),
      ]);

      const earningsData = await earningsRes.json();
      if (Array.isArray(earningsData)) setEarnings(earningsData);

      const overviewData = await overviewRes.json();
      if (overviewData.news) setNews(overviewData.news);
    } catch {
      console.error("Failed to load corporate reports");
    }
    setLoading(false);
  }, [currentMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // 선택된 날짜의 실적 이벤트
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    return earnings.filter((e) => e.date === selectedDate);
  }, [earnings, selectedDate]);

  // 심볼 선택 → 목표가 + 뉴스 로드
  const handleSelectSymbol = useCallback(async (symbol: string) => {
    setSelectedSymbol(symbol);
    setPtLoading(true);
    setPriceTarget(null);
    setSymbolNews([]);

    const [ptRes, newsRes] = await Promise.all([
      fetch(`/api/corporate-reports?mode=target&symbol=${symbol}`).catch(() => null),
      fetch(`/api/corporate-reports?mode=news&symbol=${symbol}`).catch(() => null),
    ]);

    if (ptRes?.ok) setPriceTarget(await ptRes.json());
    if (newsRes?.ok) {
      const data = await newsRes.json();
      if (Array.isArray(data)) setSymbolNews(data);
    }
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

          <div className="flex gap-1">
            {([
              { key: "earnings" as Tab, label: "실적 캘린더", icon: "📊" },
              { key: "news" as Tab, label: "기업 뉴스", icon: "📰" },
            ]).map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  tab === t.key
                    ? "bg-accent text-black font-semibold"
                    : "bg-surface text-zinc-500 hover:text-zinc-300 border border-white/[0.06]"
                }`}>
                <span>{t.icon}</span><span>{t.label}</span>
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
              <EarningsCalendar
                earnings={earnings}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                currentMonth={currentMonth}
                onChangeMonth={setCurrentMonth}
              />

              {/* 선택된 날짜의 실적 목록 */}
              {selectedDate && (
                <div className="mt-4">
                  <h2 className="text-[13px] font-bold text-zinc-300 mb-2">
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} 실적 발표
                  </h2>
                  {selectedDateEvents.length === 0 ? (
                    <div className="bg-surface border border-white/[0.06] rounded-xl p-4 text-center text-sm text-zinc-500">
                      이 날짜에 예정된 실적 발표가 없습니다
                    </div>
                  ) : (
                    <div className="bg-surface border border-white/[0.06] rounded-xl divide-y divide-white/[0.04]">
                      {selectedDateEvents.map((e, i) => {
                        const hourLabel = e.hour === "bmo" ? "장전" : e.hour === "amc" ? "장후" : "";
                        return (
                          <button
                            key={`${e.symbol}-${i}`}
                            onClick={() => handleSelectSymbol(e.symbol)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors ${
                              selectedSymbol === e.symbol ? "bg-white/[0.05]" : ""
                            }`}
                          >
                            <div className="w-14 shrink-0">
                              <div className="text-[14px] font-bold text-accent">{e.symbol}</div>
                              {hourLabel && <div className="text-[9px] text-zinc-600">{hourLabel}</div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-[11px]">
                                <span className="text-zinc-500">EPS 예상</span>
                                <span className="text-zinc-300 font-mono">
                                  {e.epsEstimate !== null ? `$${e.epsEstimate.toFixed(2)}` : "-"}
                                </span>
                                {e.epsActual !== null && (
                                  <>
                                    <span className="text-zinc-600">→</span>
                                    <span className={`font-mono font-bold ${
                                      e.epsActual > (e.epsEstimate || 0) ? "text-emerald-400" : "text-red-400"
                                    }`}>
                                      ${e.epsActual.toFixed(2)}
                                    </span>
                                  </>
                                )}
                              </div>
                              {e.revenueEstimate !== null && (
                                <div className="flex items-center gap-2 text-[10px] mt-0.5">
                                  <span className="text-zinc-600">매출</span>
                                  <span className="text-zinc-400 font-mono">
                                    {(e.revenueEstimate / 1e9).toFixed(1)}B
                                  </span>
                                  {e.revenueActual !== null && (
                                    <>
                                      <span className="text-zinc-700">→</span>
                                      <span className={`font-mono ${
                                        e.revenueActual > e.revenueEstimate ? "text-emerald-400" : "text-red-400"
                                      }`}>
                                        {(e.revenueActual / 1e9).toFixed(1)}B
                                      </span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                            <SurpriseBadge label={e.surpriseLabel} surprise={e.surprise} />
                          </button>
                        );
                      })}
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
                  {news.map((n) => <NewsRow key={n.id} item={n} />)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 우측: 상세 패널 */}
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
                캘린더에서 날짜를 클릭한 후 종목을 선택하면 애널리스트 목표가와 관련 뉴스를 볼 수 있습니다
              </div>
            </div>
          ) : ptLoading ? (
            <div className="flex items-center gap-2 py-8 justify-center">
              <div className="w-4 h-4 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
              <span className="text-sm text-zinc-400">로딩 중...</span>
            </div>
          ) : (
            <div>
              {/* 심볼 헤더 */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl font-extrabold text-accent">{selectedSymbol}</span>
              </div>

              {/* 목표가 */}
              {priceTarget ? (
                <PriceTargetCard target={priceTarget} />
              ) : (
                <div className="bg-surface border border-white/[0.06] rounded-xl p-4 mb-4 text-center text-sm text-zinc-500">
                  목표가 데이터 없음
                </div>
              )}

              {/* 관련 뉴스 */}
              <h3 className="text-[12px] font-bold text-zinc-400 mb-2">관련 뉴스</h3>
              {symbolNews.length === 0 ? (
                <div className="text-center py-4 text-[12px] text-zinc-600">최근 뉴스 없음</div>
              ) : (
                <div className="space-y-0">
                  {symbolNews.slice(0, 8).map((n) => (
                    <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer"
                      className="block py-2 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] -mx-1 px-1 rounded transition-colors group">
                      <div className="text-[12px] text-zinc-300 leading-snug line-clamp-2 group-hover:text-white">
                        {n.headline}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[9px] text-zinc-500">{n.source}</span>
                        <span className="text-[9px] text-zinc-600">·</span>
                        <span className="text-[9px] text-zinc-500">
                          {new Date(n.datetime * 1000).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              <div className="mt-4 text-[9px] text-zinc-600 text-center">Finnhub 제공 · 투자 참고용</div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
