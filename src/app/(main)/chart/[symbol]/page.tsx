"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ASSETS } from "@/lib/assets";
import { useAppStore, SUB_RANGES } from "@/stores/app-store";
import type { ChartInterval } from "@/stores/app-store";
import { formatPrice, formatDate } from "@/lib/utils";
import Navbar from "@/components/layout/Navbar";
import PriceChart from "@/components/chart/PriceChart";
import MemoCard from "@/components/memo/MemoCard";
import MemoCreateModal from "@/components/memo/MemoCreateModal";
import ValuationCard from "@/components/analysis/ValuationCard";
import SentimentCard from "@/components/analysis/SentimentCard";

// 토스증권 방식: 캔들 타입 탭
const INTERVALS: { label: string; key: ChartInterval }[] = [
  { label: "일", key: "daily" },
  { label: "주", key: "weekly" },
  { label: "월", key: "monthly" },
  { label: "년", key: "yearly" },
];

export default function ChartDetailPage() {
  const params = useParams();
  const router = useRouter();
  const symbol = (params.symbol as string)?.toLowerCase();
  const asset = ASSETS.find((a) => a.symbol.toLowerCase() === symbol);

  const {
    chartInterval, subRange, crosshair, pinPoint, detailedChart, chartMode,
    setChartInterval, setSubRange, setCurrentAsset, setDetailedChart, setChartMode, openMemoModal,
  } = useAppStore();
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [memos, setMemos] = useState<any[]>([]);

  useEffect(() => {
    if (asset) setCurrentAsset(asset);
  }, [asset, setCurrentAsset]);

  const loadChart = useCallback(async () => {
    if (!asset) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: asset.type,
        symbol: asset.symbol,
        interval: chartInterval,
        subRange: subRange,
      });
      const res = await fetch(`/api/market?${params}`);
      const data = await res.json();
      setChartData(Array.isArray(data) ? data : []);
    } catch {
      setChartData([]);
    }
    setLoading(false);
  }, [asset, chartInterval, subRange]);

  useEffect(() => { loadChart(); }, [loadChart]);

  const priceInfo = useMemo(() => {
    if (!chartData.length) return { price: 0, change: 0, pct: 0 };
    const last = chartData[chartData.length - 1].value;
    const first = chartData[0].value;
    return { price: last, change: last - first, pct: (last - first) / first * 100 };
  }, [chartData]);

  const chartPins = useMemo(
    () => memos.map((m) => ({
      time: Math.floor(m.pinTimestamp / 1000),
      sentiment: m.sentiment,
      username: m.author?.username || "",
    })),
    [memos]
  );

  const handleSaveMemo = (data: any) => {
    setMemos((prev) => [{
      id: "m" + Date.now(),
      author: { username: "me", displayName: "me", image: null },
      pinPrice: data.pinPrice, pinTimestamp: data.pinTimestamp,
      content: data.content, sentiment: data.sentiment,
      likeCount: 0, commentCount: 0, liked: false, bookmarked: false,
      asset: asset?.symbol, comments: [],
    }, ...prev]);
  };

  const handleLike = (id: string) => {
    setMemos((prev) => prev.map((m) => m.id === id ? { ...m, liked: !m.liked, likeCount: m.liked ? m.likeCount - 1 : m.likeCount + 1 } : m));
  };
  const handleBookmark = (id: string) => {
    setMemos((prev) => prev.map((m) => m.id === id ? { ...m, bookmarked: !m.bookmarked } : m));
  };
  const handleComment = (id: string, text: string) => {
    setMemos((prev) => prev.map((m) => m.id === id ? {
      ...m, commentCount: m.commentCount + 1,
      comments: [...m.comments, { author: { username: "me", displayName: "me", image: null }, content: text }],
    } : m));
  };

  // 현재 인터벌에 해당하는 하위 기간 옵션
  const currentSubRanges = SUB_RANGES[chartInterval];

  if (!asset) {
    return (
      <main className="max-w-[960px] mx-auto px-4 md:px-8 pb-20">
        <Navbar />
        <div className="text-center py-20">
          <div className="text-3xl mb-2">404</div>
          <div className="text-sm text-zinc-500 mb-4">종목을 찾을 수 없습니다</div>
          <button onClick={() => router.push("/")} className="text-accent text-sm font-medium hover:underline">홈으로 돌아가기</button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-[960px] mx-auto px-4 md:px-8 pb-20">
      <Navbar />

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-zinc-500 mb-4">
        <button onClick={() => router.push("/")} className="hover:text-zinc-300 transition-colors">홈</button>
        <span>/</span>
        <span className="text-zinc-300">{asset.name}</span>
      </div>

      {/* 캔들 타입 탭 (토스 방식: 일/주/월/년) + 이동평균선 토글 */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="flex gap-0.5 bg-surface border border-white/[0.06] rounded-xl p-1 w-fit">
          {INTERVALS.map((iv) => (
            <button key={iv.key} onClick={() => setChartInterval(iv.key)}
              className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                chartInterval === iv.key ? "bg-accent text-black font-semibold" : "text-zinc-500 hover:text-zinc-300 hover:bg-surface-2"
              }`}>
              {iv.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setChartMode(chartMode === "candlestick" ? "line" : "candlestick")}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 ${
            chartMode === "candlestick"
              ? "bg-accent/10 border-accent/30 text-accent"
              : "bg-surface border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:border-white/10"
          }`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M9 4v4m0 4v8M9 8h.01M9 12h.01M15 4v8m0 4v4M15 12h.01M15 16h.01" />
          </svg>
          {chartMode === "candlestick" ? "캔들" : "라인"}
        </button>
        <button
          onClick={() => setDetailedChart(!detailedChart)}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 ${
            detailedChart
              ? "bg-accent/10 border-accent/30 text-accent"
              : "bg-surface border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:border-white/10"
          }`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 5-9" />
          </svg>
          이동평균선
        </button>
      </div>

      {/* 하위 기간 선택 */}
      {currentSubRanges.length > 1 && (
        <div className="flex gap-1 mb-4">
          {currentSubRanges.map((sr) => (
            <button key={sr.range} onClick={() => setSubRange(sr.range)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                subRange === sr.range
                  ? "bg-zinc-700 text-white font-semibold"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-surface-2"
              }`}>
              {sr.label}
            </button>
          ))}
        </div>
      )}

      {/* Price */}
      <div className="mb-3">
        <div className="text-[13px] text-zinc-400 font-medium mb-1">
          {asset.name} ({asset.ticker}) · USD
        </div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-[34px] font-extrabold font-mono tracking-tighter leading-none">
            {crosshair ? formatPrice(crosshair.value) : formatPrice(priceInfo.price)}
          </span>
          {!crosshair && priceInfo.change !== 0 && (
            <span className={`text-sm font-mono font-medium px-2 py-0.5 rounded-md ${
              priceInfo.change >= 0 ? "text-up bg-up/10" : "text-down bg-down/10"
            }`}>
              {priceInfo.change >= 0 ? "+" : ""}{formatPrice(Math.abs(priceInfo.change))} ({priceInfo.change >= 0 ? "+" : ""}{priceInfo.pct.toFixed(2)}%)
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="relative mb-3">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface rounded-2xl z-20 gap-2 text-sm text-zinc-400">
            <div className="w-4 h-4 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
            시세 불러오는 중...
          </div>
        )}
        {chartData.length > 0 && (
          <PriceChart data={chartData} pins={chartPins} chartInterval={chartInterval} />
        )}
      </div>

      {/* Valuation Analysis Card */}
      <div className="mb-3">
        <ValuationCard symbol={asset.symbol} type={asset.type} assetName={asset.name} />
      </div>

      {/* Sentiment Analysis Card */}
      {asset.type === "us_stock" && (
        <div className="mb-3">
          <SentimentCard symbol={asset.symbol} assetName={asset.name} />
        </div>
      )}

      {/* Pin bar */}
      <div className="flex items-center gap-3 bg-surface border border-white/[0.06] rounded-xl px-4 py-2.5 mb-6 min-h-[46px]">
        <div className={`flex-1 text-[13px] font-mono ${pinPoint ? "text-zinc-200" : "text-zinc-600"}`}>
          {pinPoint ? `📌 ${formatDate(pinPoint.time * 1000)}  ${formatPrice(pinPoint.value)}` : "차트를 클릭하여 핀 위치를 선택하세요"}
        </div>
        <button onClick={openMemoModal}
          className={`bg-accent text-black rounded-lg px-4 py-2 text-[13px] font-bold transition-all ${
            pinPoint ? "opacity-100 translate-y-0" : "opacity-0 pointer-events-none translate-y-0.5"
          }`}>
          + 메모 추가
        </button>
      </div>

      {/* Memo feed */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold">커뮤니티 메모</h2>
        {memos.length > 0 && (
          <span className="text-xs text-zinc-500 bg-surface-2 px-2 py-0.5 rounded-full">{memos.length}개</span>
        )}
      </div>

      {memos.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-2xl py-10 text-center">
          <div className="text-3xl mb-2">📌</div>
          <div className="text-sm font-semibold mb-1">아직 메모가 없어요</div>
          <div className="text-xs text-zinc-500">차트를 클릭하고 첫 번째 인사이트를 핀해보세요</div>
        </div>
      ) : (
        memos.map((m) => (
          <MemoCard key={m.id} memo={m} onLike={handleLike} onBookmark={handleBookmark} onComment={handleComment} />
        ))
      )}

      <MemoCreateModal onSave={handleSaveMemo} />
    </main>
  );
}
