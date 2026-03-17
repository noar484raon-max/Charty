"use client";

import { useState, useEffect } from "react";

interface FearGreedData {
  stock: {
    value: number;
    label: string;
    previousClose: number;
    weekAgo: number;
    updatedAt: string;
  };
  crypto: {
    value: number;
    label: string;
    previousValue: number;
    updatedAt: string;
  };
}

function getColor(value: number): string {
  if (value <= 20) return "#ef4444"; // red-500
  if (value <= 40) return "#f97316"; // orange-500
  if (value <= 60) return "#eab308"; // yellow-500
  if (value <= 80) return "#84cc16"; // lime-500
  return "#22c55e"; // green-500
}

function getGradient(value: number): string {
  if (value <= 25) return "from-red-500/20 to-red-500/5";
  if (value <= 50) return "from-orange-500/20 to-orange-500/5";
  if (value <= 75) return "from-yellow-500/20 to-yellow-500/5";
  return "from-green-500/20 to-green-500/5";
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) return null;
  const isUp = diff > 0;
  return (
    <span className={`text-[10px] font-semibold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
      {isUp ? "▲" : "▼"} {Math.abs(diff)}
    </span>
  );
}

function Gauge({ value, label, title, prevValue, emoji }: {
  value: number;
  label: string;
  title: string;
  prevValue: number;
  emoji: string;
}) {
  const color = getColor(value);
  const gradient = getGradient(value);

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl bg-gradient-to-r ${gradient} border border-white/[0.06]`}>
      <span className="text-lg">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-medium text-zinc-400">{title}</span>
          <DeltaBadge current={value} previous={prevValue} />
        </div>
        {/* 바 */}
        <div className="relative h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${value}%`, backgroundColor: color }}
          />
          {/* 중앙 마커 */}
          <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-zinc-500">공포</span>
          <span className="text-xs font-bold" style={{ color }}>
            {value} · {label}
          </span>
          <span className="text-[10px] text-zinc-500">탐욕</span>
        </div>
      </div>
    </div>
  );
}

export default function FearGreedBar() {
  const [data, setData] = useState<FearGreedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/fear-greed")
      .then((r) => r.json())
      .then((d) => {
        if (d && d.stock && d.crypto) setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex gap-2 animate-pulse">
        <div className="flex-1 h-16 bg-white/[0.04] rounded-xl" />
        <div className="flex-1 h-16 bg-white/[0.04] rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Gauge
        value={data.stock.value}
        label={data.stock.label}
        title="주식 공포·탐욕"
        prevValue={data.stock.previousClose}
        emoji="📊"
      />
      <Gauge
        value={data.crypto.value}
        label={data.crypto.label}
        title="크립토 공포·탐욕"
        prevValue={data.crypto.previousValue}
        emoji="₿"
      />
    </div>
  );
}
