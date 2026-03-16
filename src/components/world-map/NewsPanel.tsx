"use client";

import { useState, useEffect, useCallback } from "react";
import type { RegionNewsResult, GlobalNewsItem } from "@/server/services/global-news";

interface NewsPanelProps {
  countryCode: string | null;
}

const BADGE: Record<string, string> = {
  positive: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  negative: "bg-red-500/15 text-red-400 border-red-500/20",
  neutral: "bg-zinc-500/15 text-zinc-500 border-zinc-500/20",
};
const LABEL_KO: Record<string, string> = {
  positive: "긍정", negative: "부정", neutral: "중립",
};

function SentimentBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = clamped >= 60 ? "#22c55e" : clamped >= 50 ? "#eab308" : "#ef4444";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${clamped}%`, backgroundColor: color }} />
      </div>
      <span className="text-[14px] font-bold font-mono" style={{ color }}>{clamped}</span>
    </div>
  );
}

function NewsRow({ article }: { article: GlobalNewsItem }) {
  const dateStr = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString("ko-KR", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";

  return (
    <a href={article.url} target="_blank" rel="noopener noreferrer"
      className="block py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors group">
      <div className="flex items-start gap-3">
        {article.imageUrl && (
          <img src={article.imageUrl} alt="" className="w-16 h-12 rounded-lg object-cover flex-shrink-0 bg-surface-2"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-zinc-200 font-medium leading-snug line-clamp-2 group-hover:text-white transition-colors">
            {article.title}
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] text-zinc-500">{article.source}</span>
            <span className="text-[10px] text-zinc-600">·</span>
            <span className="text-[10px] text-zinc-500">{dateStr}</span>
            <span className={`inline-flex items-center px-1.5 py-0 rounded text-[9px] font-semibold border ${BADGE[article.sentiment]}`}>
              {LABEL_KO[article.sentiment]}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}

export default function NewsPanel({ countryCode }: NewsPanelProps) {
  const [data, setData] = useState<RegionNewsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!countryCode) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/global-news?country=${countryCode}`);
      const json = await res.json();
      if (json?.region) setData(json);
    } catch { setData(null); }
    setLoading(false);
  }, [countryCode]);

  useEffect(() => { load(); }, [load]);

  if (!countryCode) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
        <div className="text-4xl mb-3">🌍</div>
        <div className="text-[15px] font-bold text-zinc-300 mb-1">지역을 선택하세요</div>
        <div className="text-[12px] text-zinc-500 max-w-[240px]">
          지도에서 지역 마커를 클릭하면 해당 지역의 실시간 비즈니스 뉴스와 감성 분석을 볼 수 있습니다
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 gap-2">
        <div className="w-4 h-4 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
        <span className="text-sm text-zinc-400">뉴스 분석 중...</span>
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-12 text-sm text-zinc-500">뉴스를 불러올 수 없습니다</div>;
  }

  const sentColor = data.overallSentiment >= 60
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : data.overallSentiment >= 45
    ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
    : "bg-red-500/15 text-red-400 border-red-500/30";

  return (
    <div className="h-full overflow-y-auto">
      {/* 지역 헤더 */}
      <div className="sticky top-0 bg-surface/95 backdrop-blur-sm border-b border-white/[0.06] px-4 py-3 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{data.region.flag}</span>
            <div>
              <div className="text-[15px] font-bold text-zinc-100">{data.region.name}</div>
              <div className="text-[11px] text-zinc-500">{data.region.nameEn} · 비즈니스 뉴스</div>
            </div>
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${sentColor}`}>
            {data.sentimentLabel}
          </span>
        </div>
        <div className="mt-2">
          <SentimentBar score={data.overallSentiment} />
        </div>
      </div>

      {/* 뉴스 목록 */}
      <div className="px-4 py-2">
        {data.articles.length === 0 ? (
          <div className="text-center py-8 text-sm text-zinc-500">최근 뉴스가 없습니다</div>
        ) : (
          data.articles.map((article, i) => <NewsRow key={i} article={article} />)
        )}
      </div>

      <div className="px-4 pb-4">
        <div className="text-[9px] text-zinc-600 text-center mt-2">
          NewsAPI.org 제공 · 키워드 기반 감성 분석 · 투자 참고용
        </div>
      </div>
    </div>
  );
}
