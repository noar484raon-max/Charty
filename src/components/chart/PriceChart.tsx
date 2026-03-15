"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
} from "lightweight-charts";
import { useAppStore } from "@/stores/app-store";
import type { ChartInterval, ChartMode } from "@/stores/app-store";

type ChartDataPoint = {
  time: number;
  value: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume: number;
};
type PinMarker = { time: number; sentiment: string; username: string };

interface PriceChartProps {
  data: ChartDataPoint[];
  pins?: PinMarker[];
  chartInterval?: ChartInterval;
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
 * 토스증권 방식: 캔들 타입에 따른 MA 라벨
 */
function getMALabel(period: number, interval: ChartInterval): string {
  switch (interval) {
    case "daily": return `MA${period}일`;
    case "weekly": return `MA${period}주`;
    case "monthly": return `MA${period}월`;
    case "yearly": return `MA${period}년`;
  }
}

export default function PriceChart({
  data,
  pins = [],
  chartInterval = "daily",
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const { chartMode, detailedChart, maLines, setCrosshair, setPinPoint } = useAppStore();

  const showMA = detailedChart;
  const isCandlestick = chartMode === "candlestick";
  // OHLC 데이터가 있는지 확인 (CoinGecko는 OHLC가 없을 수 있음)
  const hasOHLC = data.length > 0 && data[0].open != null && data[0].open !== data[0].close;

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

    let mainSeries: any;

    if (isCandlestick && hasOHLC) {
      // ─── 캔들스틱 모드 ───
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });
      candleSeries.setData(
        data.map((d) => ({
          time: d.time as any,
          open: d.open ?? d.value,
          high: d.high ?? d.value,
          low: d.low ?? d.value,
          close: d.close ?? d.value,
        }))
      );
      mainSeries = candleSeries;
    } else {
      // ─── 라인(영역) 차트 모드 ───
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
      mainSeries = areaSeries;
    }

    // ─── 이동평균선 ───
    if (showMA) {
      const priceData = data.map((d) => ({ time: d.time, value: d.value }));
      const enabledMAs = maLines.filter((m) => m.enabled);

      for (const ma of enabledMAs) {
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

    // ─── 거래량 히스토그램 ───
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 }, drawTicks: false } as any);
    volSeries.setData(
      data.map((d, i) => ({
        time: d.time as any,
        value: d.volume,
        color: (d.close ?? d.value) >= (d.open ?? data[i - 1]?.value ?? d.value)
          ? "rgba(34,197,94,0.25)"
          : "rgba(239,68,68,0.25)",
      }))
    );

    // ─── 이벤트 ───
    chart.subscribeCrosshairMove((param: any) => {
      if (!param.time || !param.point) { setCrosshair(null); return; }
      const price = param.seriesData?.get(mainSeries);
      if (price) {
        // 캔들스틱은 close, 라인은 value
        const val = (price as any).close ?? (price as any).value;
        if (val != null) setCrosshair({ time: param.time as number, value: val });
      }
    });

    chart.subscribeClick((param: any) => {
      if (!param.time) return;
      const price = param.seriesData?.get(mainSeries);
      if (price) {
        const val = (price as any).close ?? (price as any).value;
        if (val != null) setPinPoint({ time: param.time as number, value: val });
      }
    });

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) chart.applyOptions({ width: e.contentRect.width, height: e.contentRect.height });
    });
    ro.observe(containerRef.current);
    chart.timeScale().fitContent();

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [data, pins, chartInterval, chartMode, showMA, maLines, setCrosshair, setPinPoint, isCandlestick, hasOHLC]);

  // 표시 가능한 MA 목록
  const visibleMAs = showMA
    ? maLines.filter((m) => m.enabled && m.period < data.length)
    : [];

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
              {getMALabel(ma.period, chartInterval)}
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
