"use client";

import { useState, useEffect, useCallback } from "react";
import type { SentimentResult, NewsItem } from "@/server/services/sentiment";

interface SentimentCardProps {
  symbol: string;
  assetName: string;
}

// ─── 감성 라벨 스타일 ───

type SentimentLabel = SentimentResult["overallLabel"];

const LABEL_STYLES: Record<SentimentLabel, { bg: string; text: string; border: string; emoji: string }> = {
  "매우 긍정": { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", emoji: "🟢" },
  "긍정":     { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", emoji: "🟢" },
  "중립":     { bg: "bg-blue-500/10",    text: "text-blue-400",    border: "border-blue-500/20",    emoji: "🔵" },
  "부정":     { bg: "bg-red-500/10",     text: "text-red-400",     border: "border-red-500/20",     emoji: "🔴" },
  "매우 부정": { bg: "bg-red-500/15",     text: "text-red-400",     border: "border-red-500/30",     emoji: "🔴" },
};

const NEWS_SENTIMENT_BADGE: Record<string, string> = {
  positive: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  negative: "bg-red-500/15 text-red-400 border-red-500/20",
  neutral:  "bg-zinc-500/15 text-zinc-500 border-zinc-500/20",
};

const NEWS_SENTIMENT_LABEL: Record<string, string> = {
  positive: "긍정",
  negative: "부정",
  neutral:  "중립",
};

// ─── 게이지 바 컴포넌트 ───

function SentimentGauge({ score }: { score: number }) {
  // score: 0~100, 50=중립
  const clamped = Math.max(0, Math.min(100, score));

  // 색상 그라디언트: 빨강(0) → 노랑(50) → 초록(100)
  const getColor = (s: number) => {
    if (s >= 65) return "#22c55e"; // 초록
    if (s >= 55) return "#84cc16"; // 라임
    if (s >= 45) return "#eab308"; // 노랑
    if (s >= 35) return "#f97316"; // 주황
    return "#ef4444"; // 빨강
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        <span>매우 부정</span>
        <span>중립</span>
        <span>매우 긍정</span>
      </div>
      <div className="relative h-3 rounded-full bg-white/[0.06] overflow-hidden">
        {/* 배경 그라디언트 */}
        <div
          className="absolute inset-0 rounded-full opacity-30"
          style={{
            background: "linear-gradient(to right, #ef4444, #f97316, #eab308, #84cc16, #22c55e)",
          }}
        />
        {/* 인디케이터 */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 shadow-lg transition-all duration-500"
          style={{
            left: `calc(${clamped}% - 8px)`,
            backgroundColor: getColor(clamped),
            borderColor: "white",
            boxShadow: `0 0 8px ${getColor(clamped)}80`,
          }}
        />
      </div>
      <div className="text-center">
        <span
          className="text-[22px] font-extrabold font-mono"
          style={{ color: getColor(clamped) }}
        >
          {clamped}
        </span>
        <span className="text-[11px] text-zinc-500 ml-1">/ 100</span>
      </div>
    </div>
  );
}

// ─── 뉴스 분포 바 ───

function DistributionBar({ positive, negative, neutral, total }: {
  positive: number; negative: number; neutral: number; total: number;
}) {
  if (total === 0) return null;

  const pPct = (positive / total) * 100;
  const nPct = (negative / total) * 100;
  const uPct = (neutral / total) * 100;

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-zinc-400">뉴스 감성 분포</div>
      <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
        {pPct > 0 && (
          <div
            className="bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${pPct}%` }}
          />
        )}
        {uPct > 0 && (
          <div
            className="bg-zinc-500 rounded-full transition-all duration-500"
            style={{ width: `${uPct}%` }}
          />
        )}
        {nPct > 0 && (
          <div
            className="bg-red-500 rounded-full transition-all duration-500"
            style={{ width: `${nPct}%` }}
          />
        )}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-zinc-400">긍정 {positive}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-zinc-500" />
          <span className="text-zinc-400">중립 {neutral}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-zinc-400">부정 {negative}</span>
        </div>
      </div>
    </div>
  );
}

// ─── 뉴스 아이템 ───

function NewsRow({ item }: { item: NewsItem }) {
  const dateStr = new Date(item.datetime * 1000).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] -mx-1 px-1 rounded-lg transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-zinc-200 font-medium leading-snug line-clamp-2 group-hover:text-white transition-colors">
          {item.headline}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-zinc-500">{item.source}</span>
          <span className="text-[10px] text-zinc-600">·</span>
          <span className="text-[10px] text-zinc-500">{dateStr}</span>
          <span
            className={`inline-flex items-center px-1.5 py-0 rounded text-[9px] font-semibold border ${NEWS_SENTIMENT_BADGE[item.sentiment]}`}
          >
            {NEWS_SENTIMENT_LABEL[item.sentiment]}
          </span>
        </div>
      </div>
      <svg className="w-3.5 h-3.5 text-zinc-600 mt-1 flex-shrink-0 group-hover:text-zinc-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M7 17L17 7M17 7H7M17 7V17" />
      </svg>
    </a>
  );
}

// ─── 메인 컴포넌트 ───

export default function SentimentCard({ symbol, assetName }: SentimentCardProps) {
  const [data, setData] = useState<SentimentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showAllNews, setShowAllNews] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sentiment?symbol=${symbol}`);
      const json = await res.json();
      if (json && json.symbol) {
        setData(json);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    }
    setLoading(false);
  }, [symbol]);

  useEffect(() => {
    setShowAllNews(false);
    setExpanded(false);
  }, [symbol]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-surface p-4">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <div className="w-4 h-4 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
          뉴스 감성 분석 중...
        </div>
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-surface p-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-zinc-500/10 border border-zinc-500/20 flex items-center justify-center text-[14px]">
            📰
          </div>
          <div>
            <div className="text-[13px] font-bold text-zinc-200">뉴스 감성 분석</div>
            <div className="text-[11px] text-zinc-500">
              {!data ? "분석할 수 없습니다" : "최근 7일간 관련 뉴스가 없습니다"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const style = LABEL_STYLES[data.overallLabel];
  const visibleNews = showAllNews ? data.news : data.news.slice(0, 3);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-[14px]">
            📰
          </div>
          <div className="text-left">
            <div className="text-[13px] font-bold text-zinc-200">
              {assetName} 뉴스 감성 분석
            </div>
            <div className="text-[11px] text-zinc-500">
              최근 7일 · {data.total}개 뉴스 분석
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${style.bg} ${style.text} ${style.border}`}>
            {style.emoji} {data.overallLabel}
          </span>
          <svg
            className={`w-4 h-4 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-white/[0.04]">
          {/* 감성 점수 게이지 */}
          <div className="mt-3 mb-4">
            <SentimentGauge score={data.overallScore} />
          </div>

          {/* 뉴스 분포 */}
          <div className="mb-4">
            <DistributionBar
              positive={data.positive}
              negative={data.negative}
              neutral={data.neutral}
              total={data.total}
            />
          </div>

          {/* 최근 뉴스 */}
          {data.news.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">
                최근 뉴스
              </div>
              <div className="rounded-xl border border-white/[0.04] px-2">
                {visibleNews.map((item, i) => (
                  <NewsRow key={item.id || i} item={item} />
                ))}
              </div>
              {data.news.length > 3 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowAllNews(!showAllNews); }}
                  className="w-full mt-2 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showAllNews ? "접기" : `더 보기 (${data.news.length - 3}개)`}
                </button>
              )}
            </div>
          )}

          {/* 분석 코멘트 */}
          <div className="mt-4 rounded-xl bg-surface-2 border border-white/[0.04] p-3">
            <div className="text-[11px] font-semibold text-zinc-400 mb-1.5">AI 감성 요약</div>
            <div className="text-[12px] text-zinc-300 leading-relaxed">
              {data.overallScore >= 65 && (
                <>
                  {assetName}에 대한 최근 뉴스 감성이 <span className="text-emerald-400 font-semibold">긍정적</span>입니다.
                  {data.positive > data.negative * 2 && " 긍정 뉴스가 부정 뉴스 대비 압도적으로 많습니다."}
                  {" "}시장 심리가 우호적인 상태이며, 긍정적 모멘텀이 이어질 수 있습니다.
                </>
              )}
              {data.overallScore >= 45 && data.overallScore < 65 && (
                <>
                  {assetName}에 대한 시장 감성이 <span className="text-blue-400 font-semibold">중립</span> 수준입니다.
                  {" "}긍정과 부정 뉴스가 혼재되어 있으며, 뚜렷한 방향성은 없는 상태입니다.
                </>
              )}
              {data.overallScore < 45 && (
                <>
                  {assetName}에 대한 최근 뉴스 감성이 <span className="text-red-400 font-semibold">부정적</span>입니다.
                  {data.negative > data.positive * 2 && " 부정적 뉴스가 크게 우세합니다."}
                  {" "}단기적으로 하방 압력이 있을 수 있으니 주의가 필요합니다.
                </>
              )}
            </div>
          </div>

          <div className="mt-3 text-[9px] text-zinc-600 text-center">
            Finnhub 뉴스 기반 키워드 감성 분석 · 투자 판단의 참고자료이며, 투자 권유가 아닙니다
          </div>
        </div>
      )}
    </div>
  );
}
