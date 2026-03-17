"use client";

import { useState, useEffect } from "react";

interface GaugeData {
  value: number;
  label: string;
  prevValue: number;
}

function getLabel(value: number): string {
  if (value <= 20) return "극도의 공포";
  if (value <= 40) return "공포";
  if (value <= 60) return "중립";
  if (value <= 80) return "탐욕";
  return "극도의 탐욕";
}

function getColor(value: number): string {
  if (value <= 20) return "#ef4444";
  if (value <= 40) return "#f97316";
  if (value <= 60) return "#eab308";
  if (value <= 80) return "#84cc16";
  return "#22c55e";
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
        <div className="relative h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${value}%`, backgroundColor: color }}
          />
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

function GaugeSkeleton() {
  return <div className="flex-1 h-16 bg-white/[0.04] rounded-xl animate-pulse" />;
}

function GaugeError({ title, emoji }: { title: string; emoji: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <span className="text-lg opacity-40">{emoji}</span>
      <div className="flex-1">
        <span className="text-[11px] text-zinc-500">{title}</span>
        <div className="text-[10px] text-zinc-600 mt-1">데이터를 불러올 수 없습니다</div>
      </div>
    </div>
  );
}

// CNN Fear & Greed - 클라이언트에서 직접 호출 (CNN은 브라우저 요청만 허용)
async function fetchCNNFromClient(): Promise<GaugeData | null> {
  try {
    const res = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const score = data?.fear_and_greed?.score;
    const prevClose = data?.fear_and_greed?.previous_close;
    if (score == null) return null;
    const value = Math.round(score);
    return {
      value,
      label: getLabel(value),
      prevValue: Math.round(prevClose ?? score),
    };
  } catch {
    return null;
  }
}

// Crypto Fear & Greed - 서버 API를 통해 호출
async function fetchCryptoFromAPI(): Promise<GaugeData | null> {
  try {
    const res = await fetch("/api/fear-greed");
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.crypto) return null;
    return {
      value: data.crypto.value,
      label: data.crypto.label,
      prevValue: data.crypto.previousValue,
    };
  } catch {
    return null;
  }
}

export default function FearGreedBar() {
  const [stock, setStock] = useState<GaugeData | null>(null);
  const [crypto, setCrypto] = useState<GaugeData | null>(null);
  const [stockLoading, setStockLoading] = useState(true);
  const [cryptoLoading, setCryptoLoading] = useState(true);

  useEffect(() => {
    // CNN은 클라이언트(브라우저)에서 직접 호출
    fetchCNNFromClient()
      .then(setStock)
      .finally(() => setStockLoading(false));

    // 크립토는 서버 API 경유
    fetchCryptoFromAPI()
      .then(setCrypto)
      .finally(() => setCryptoLoading(false));
  }, []);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {stockLoading ? (
        <GaugeSkeleton />
      ) : stock ? (
        <Gauge
          value={stock.value}
          label={stock.label}
          title="CNN 공포·탐욕"
          prevValue={stock.prevValue}
          emoji="📊"
        />
      ) : (
        <GaugeError title="CNN 공포·탐욕" emoji="📊" />
      )}

      {cryptoLoading ? (
        <GaugeSkeleton />
      ) : crypto ? (
        <Gauge
          value={crypto.value}
          label={crypto.label}
          title="크립토 공포·탐욕"
          prevValue={crypto.prevValue}
          emoji="₿"
        />
      ) : (
        <GaugeError title="크립토 공포·탐욕" emoji="₿" />
      )}
    </div>
  );
}
