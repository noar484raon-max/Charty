"use client";

import { useState, useEffect, useCallback } from "react";
import type { FundamentalData, ValuationLevel } from "@/server/services/fundamentals";

interface ValuationCardProps {
  symbol: string;
  type: "us_stock" | "crypto";
  assetName: string;
}

function formatMarketCap(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

function formatPct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function formatNum(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2);
}

const BADGE_STYLES: Record<ValuationLevel, string> = {
  "저평가": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "적정": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "고평가": "bg-red-500/15 text-red-400 border-red-500/30",
  "N/A": "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
};

const LEVEL_EMOJI: Record<ValuationLevel, string> = {
  "저평가": "🟢",
  "적정": "🔵",
  "고평가": "🔴",
  "N/A": "⚪",
};

function ValuationBadge({ level }: { level: ValuationLevel }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${BADGE_STYLES[level]}`}>
      {LEVEL_EMOJI[level]} {level}
    </span>
  );
}

function MetricRow({ label, value, valuation }: { label: string; value: string; valuation?: ValuationLevel }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-[12px] text-zinc-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-mono font-medium text-zinc-200">{value}</span>
        {valuation && <ValuationBadge level={valuation} />}
      </div>
    </div>
  );
}

function FiftyTwoWeekBar({ position }: { position: number | null }) {
  if (position == null) return null;
  const clamped = Math.max(0, Math.min(100, position));
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
        <span>52주 최저</span>
        <span>52주 최고</span>
      </div>
      <div className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-red-500/60 via-yellow-500/40 to-emerald-500/60" style={{ width: "100%" }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-accent shadow-lg shadow-accent/30"
          style={{ left: `calc(${clamped}% - 6px)` }}
        />
      </div>
      <div className="text-center text-[10px] text-zinc-400 mt-1">
        현재 위치: 하위 {clamped}%
      </div>
    </div>
  );
}

export default function ValuationCard({ symbol, type, assetName }: ValuationCardProps) {
  const [data, setData] = useState<FundamentalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fundamentals?symbol=${symbol}&type=${type}`);
      const json = await res.json();
      setData(json);

      // 주식인데 핵심 지표가 비어있으면 자동 재시도 (Finnhub 간헐적 실패 대응)
      const isMissingData = type !== "crypto" &&
        json.trailingPE == null &&
        json.priceToBook == null &&
        json.marketCap == null;

      if (isMissingData && retryCount < MAX_RETRIES) {
        console.log(`[ValuationCard] ${symbol}: 데이터 비어있음, ${retryCount + 1}/${MAX_RETRIES} 재시도 예정...`);
        setTimeout(() => {
          setRetryCount((prev) => prev + 1);
        }, 3000 * (retryCount + 1)); // 3초, 6초 후 재시도
      }
    } catch {
      setData(null);
      if (retryCount < MAX_RETRIES) {
        setTimeout(() => {
          setRetryCount((prev) => prev + 1);
        }, 3000 * (retryCount + 1));
      }
    }
    setLoading(false);
  }, [symbol, type, retryCount]);

  // symbol 변경 시 재시도 카운트 리셋
  useEffect(() => { setRetryCount(0); }, [symbol]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-surface p-4">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <div className="w-4 h-4 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
          재무 데이터 분석 중...
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isCrypto = data.isCrypto;
  const hasValuation = data.overallValuation !== "N/A";

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-[14px]">
            📊
          </div>
          <div className="text-left">
            <div className="text-[13px] font-bold text-zinc-200">
              {assetName} 밸류에이션 분석
            </div>
            <div className="text-[11px] text-zinc-500">
              {isCrypto ? "시가총액 · 52주 범위" : "PER · PBR · PSR · 시가총액"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasValuation && <ValuationBadge level={data.overallValuation} />}
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
          {/* 시가총액 & 섹터 */}
          <div className="grid grid-cols-2 gap-3 mt-3 mb-3">
            <div className="rounded-xl bg-surface-2 border border-white/[0.04] p-3">
              <div className="text-[10px] text-zinc-500 mb-0.5">시가총액</div>
              <div className="text-[16px] font-bold font-mono">{formatMarketCap(data.marketCap)}</div>
            </div>
            {!isCrypto && data.sector && (
              <div className="rounded-xl bg-surface-2 border border-white/[0.04] p-3">
                <div className="text-[10px] text-zinc-500 mb-0.5">섹터</div>
                <div className="text-[13px] font-semibold truncate">{data.sector}</div>
                {data.industry && <div className="text-[10px] text-zinc-500 truncate">{data.industry}</div>}
              </div>
            )}
            {isCrypto && (
              <div className="rounded-xl bg-surface-2 border border-white/[0.04] p-3">
                <div className="text-[10px] text-zinc-500 mb-0.5">52주 범위</div>
                <div className="text-[12px] font-mono">{data.fiftyTwoWeekRange || "—"}</div>
              </div>
            )}
          </div>

          {/* 52주 위치 바 */}
          <FiftyTwoWeekBar position={data.fiftyTwoWeekPosition} />

          {/* 밸류에이션 지표 */}
          {!isCrypto && (
            <div className="mt-4">
              <div className="text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">밸류에이션 지표</div>
              <div className="rounded-xl border border-white/[0.04] px-3">
                <MetricRow label="PER (Trailing)" value={formatNum(data.trailingPE)} valuation={data.peValuation} />
                <MetricRow label="PER (Forward)" value={formatNum(data.forwardPE)} />
                <MetricRow label="PBR" value={formatNum(data.priceToBook)} valuation={data.pbValuation} />
                <MetricRow label="PSR" value={formatNum(data.priceToSales)} valuation={data.psValuation} />
                {data.enterpriseToEbitda && (
                  <MetricRow label="EV/EBITDA" value={formatNum(data.enterpriseToEbitda)} />
                )}
              </div>
            </div>
          )}

          {/* 수익성 지표 */}
          {!isCrypto && (data.profitMargin != null || data.returnOnEquity != null) && (
            <div className="mt-4">
              <div className="text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">수익성</div>
              <div className="rounded-xl border border-white/[0.04] px-3">
                {data.profitMargin != null && <MetricRow label="순이익률" value={formatPct(data.profitMargin)} />}
                {data.returnOnEquity != null && <MetricRow label="ROE" value={formatPct(data.returnOnEquity)} />}
                {data.revenueGrowth != null && <MetricRow label="매출 성장률" value={formatPct(data.revenueGrowth)} />}
                {data.earningsGrowth != null && <MetricRow label="이익 성장률" value={formatPct(data.earningsGrowth)} />}
                {data.dividendYield != null && <MetricRow label="배당 수익률" value={formatPct(data.dividendYield)} />}
              </div>
            </div>
          )}

          {/* 종합 분석 코멘트 */}
          {hasValuation && (
            <div className="mt-4 rounded-xl bg-surface-2 border border-white/[0.04] p-3">
              <div className="text-[11px] font-semibold text-zinc-400 mb-1.5">종합 분석</div>
              <div className="text-[12px] text-zinc-300 leading-relaxed">
                {data.overallValuation === "저평가" && (
                  <>
                    {assetName}은(는) 현재 주요 밸류에이션 지표 기준으로 <span className="text-emerald-400 font-semibold">저평가</span> 구간에 있습니다.
                    {data.fiftyTwoWeekPosition != null && data.fiftyTwoWeekPosition < 30 && " 52주 최저가 근처에서 거래되고 있어 매수 기회일 수 있습니다."}
                    {data.returnOnEquity != null && data.returnOnEquity > 0.15 && " ROE가 높아 자본 효율성이 우수합니다."}
                  </>
                )}
                {data.overallValuation === "적정" && (
                  <>
                    {assetName}은(는) 현재 <span className="text-blue-400 font-semibold">적정</span> 가치 수준에서 거래되고 있습니다.
                    {data.earningsGrowth != null && data.earningsGrowth > 0.1 && " 이익 성장률이 양호하여 긍정적인 신호입니다."}
                    {data.fiftyTwoWeekPosition != null && data.fiftyTwoWeekPosition > 80 && " 다만 52주 최고가 근처에서 거래되고 있어 단기 조정 가능성에 유의하세요."}
                  </>
                )}
                {data.overallValuation === "고평가" && (
                  <>
                    {assetName}은(는) 현재 밸류에이션 지표 기준 <span className="text-red-400 font-semibold">고평가</span> 구간에 있습니다.
                    {data.earningsGrowth != null && data.earningsGrowth > 0.2 && " 하지만 높은 이익 성장률이 프리미엄을 정당화할 수 있습니다."}
                    {data.fiftyTwoWeekPosition != null && data.fiftyTwoWeekPosition > 90 && " 52주 최고가 근처이므로 신규 진입 시 신중한 접근이 필요합니다."}
                  </>
                )}
              </div>
            </div>
          )}

          {isCrypto && (
            <div className="mt-3 text-[10px] text-zinc-600 text-center">
              암호화폐는 전통적 재무 지표(PER/PBR 등)가 적용되지 않습니다
            </div>
          )}

          <div className="mt-3 text-[9px] text-zinc-600 text-center">
            데이터 출처: Finnhub · 투자 판단의 참고자료이며, 투자 권유가 아닙니다
          </div>
        </div>
      )}
    </div>
  );
}
