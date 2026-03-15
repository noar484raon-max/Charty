"use client";

import { useEffect, useRef } from "react";
import { createChart, AreaSeries, HistogramSeries, LineSeries } from "lightweight-charts";
import { useAppStore } from "@/stores/app-store";

type ChartDataPoint = { time: number; value: number; volume: number };
type PinMarker = { time: number; sentiment: string; username: string };

interface PriceChartProps {
  data: ChartDataPoint[];
  pins?: PinMarker[];
  range?: number;
  dailyData?: ChartDataPoint[];
}

/** 이동평균 계산 */
function calcMA(data: { time: number; value: number }[], period: number) {
  const result: { time: any; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].value;
    result.push({ time: data[i].time as any, value: sum / period });
  }
  return result;
}

/**
 * 시간대별 캔들 간격과 MA 라벨 매핑
 * 토스증권 방식: 각 시간대의 캔들 단위에 맞춰 MA 라벨 표시
 *
 * range(days)  → Yahoo interval  → 캔들 단위  → MA 라벨
 * 1 (1D)       → 5m             → 5분봉      → MA5, MA20, MA60, MA120 (캔들 기준)
 * 7 (1W)       → 15m            → 15분봉     → MA5, MA20, MA60, MA120
 * 30 (1M)      → 1h             → 시간봉     → MA5, MA20, MA60, MA120
 * 90 (3M)      → 1d             → 일봉       → MA5일, MA20일, MA60일, MA120일
 * 365 (1Y)     → 1d             → 일봉       → MA5일, MA20일, MA60일, MA120일
 * 1825 (5Y)    → 1wk            → 주봉       → MA5주, MA20주, MA60주, MA120주
 * 3650+ (ALL)  → 1mo            → 월봉       → MA5월, MA20월, MA60월, MA120월
 */
function getMALabel(period: number, rangeDays: number): string {
  if (rangeDays >= 3650) return `MA${period}월`;
  if (rangeDays >= 1825) return `MA${period}주`;
  if (rangeDays >= 90) return `MA${period}일`;
  if (rangeDays >= 30) return `MA${period}h`;
  if (rangeDays >= 7) return `MA${period}`;
  return `MA${period}`;
}

export default function PriceChart({ data, pins = [], range = 7 }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const { detailedChart, maLines, setCrosshair, setPinPoint } = useAppStore();

  // 자세한 차트 모드에서는 항상 MA 표시 가능
  const showMA = detailedChart;

  useEffect(() => {
    if (!containerRef.current || !data.length) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { type: "solid" as any, color: "#111114" },
        textColor: "#71717a",
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      crosshair: {
        vertLine: { color: "rgba(200,255,60,0.3)", width: 1 as any, style: 0, labelBackgroundColor: "#1a1a1f" },
        horzLine: { color: "rgba(200,255,60,0.3)", width: 1 as any, style: 0, labelBackgroundColor: "#1a1a1f" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.06)" },
      timeScale: { borderColor: "rgba(255,255,255,0.06)", timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });
    chartRef.current = chart;

    const isUp = data[data.length - 1].value >= data[0].value;
    const lineColor = isUp ? "#22c55e" : "#ef4444";

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor,
      lineWidth: 2,
      topColor: isUp ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
      bottomColor: isUp ? "rgba(34,197,94,0.01)" : "rgba(239,68,68,0.01)",
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderColor: lineColor,
      crosshairMarkerBackgroundColor: "#111114",
    });
    areaSeries.setData(data.map((d) => ({ time: d.time as any, value: d.value })));

    // 이동평균선 — 모든 시간대에서 표시 (데이터 포인트 충분할 때)
    if (showMA) {
      const priceData = data.map((d) => ({ time: d.time, value: d.value }));
      const enabledMAs = maLines.filter((m) => m.enabled);

      for (const ma of enabledMAs) {
        // 최소 period만큼의 데이터가 있어야 MA 계산 가능
        if (ma.period >= priceData.length) continue;

        const maData = calcMA(priceData, ma.period);
        if (maData.length > 0) {
          const maSeries = chart.addSeries(LineSeries, {
            color: ma.color,
            lineWidth: 1,
            crosshairMarkerVisible: false,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          maSeries.setData(maData);
        }
      }
    }

    // Volume histogram
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 }, drawTicks: false } as any);
    volSeries.setData(
      data.map((d, i) => ({
        time: d.time as any,
        value: d.volume,
        color: d.value >= (data[i - 1]?.value ?? d.value) ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)",
      }))
    );

    // Events
    chart.subscribeCrosshairMove((param: any) => {
      if (!param.time || !param.point) { setCrosshair(null); return; }
      const price = param.seriesData?.get(areaSeries);
      if (price) setCrosshair({ time: param.time as number, value: (price as any).value });
    });

    chart.subscribeClick((param: any) => {
      if (!param.time) return;
      const price = param.seriesData?.get(areaSeries);
      if (price) setPinPoint({ time: param.time as number, value: (price as any).value });
    });

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) chart.applyOptions({ width: e.contentRect.width, height: e.contentRect.height });
    });
    ro.observe(containerRef.current);
    chart.timeScale().fitContent();

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [data, pins, range, showMA, maLines, setCrosshair, setPinPoint]);

  // 표시 가능한 MA 목록 (데이터 포인트가 충분한 것만)
  const visibleMAs = showMA
    ? maLines.filter((m) => m.enabled && m.period < data.length)
    : [];

  // 데이터 부족으로 표시 못 하는 MA
  const hiddenMAs = showMA
    ? maLines.filter((m) => m.enabled && m.period >= data.length)
    : [];

  return (
    <div className="relative rounded-2xl border border-white/[0.06] bg-surface overflow-hidden">
      {pins.length > 0 && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-accent/10 border border-accent/25 px-2.5 py-1 text-[11px] font-semibold text-accent pointer-events-none">
          📌 {pins.length}개 핀
        </div>
      )}
      {visibleMAs.length > 0 && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap pointer-events-none">
          {visibleMAs.map((ma) => (
            <span
              key={ma.period}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-black/50 backdrop-blur-sm border border-white/[0.08]"
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ma.color }} />
              {getMALabel(ma.period, range)}
            </span>
          ))}
          {hiddenMAs.length > 0 && (
            <span className="rounded-full px-2 py-0.5 text-[9px] text-zinc-500 bg-black/50 backdrop-blur-sm border border-white/[0.08]">
              +{hiddenMAs.length} (데이터 부족)
            </span>
          )}
        </div>
      )}
      <div ref={containerRef} className="w-full h-[340px] md:h-[400px]" />
    </div>
  );
}
