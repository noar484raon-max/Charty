import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1000) return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return "$" + value.toFixed(2);
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}일 전`;
  return formatDate(ts);
}

// 심볼 기반 시드 랜덤 — 같은 종목은 항상 같은 차트
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function strToSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

export function generateMockData(days: number, base: number, symbol = "default") {
  const n = days === 1 ? 96 : days <= 7 ? 168 : days <= 30 ? 720 : days <= 90 ? 720 : days <= 365 ? 365 : days <= 1825 ? 1200 : 2000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const anchor = today.getTime();
  const iv = (days * 86400000) / n;

  // 1) 심볼 전용 시드로 고정 현재가 결정 (기간 무관)
  const priceRand = seededRandom(strToSeed(symbol));
  const currentPrice = base * (0.9 + priceRand() * 0.2);

  // 2) 심볼+기간 시드로 차트 패턴 생성
  const walkRand = seededRandom(strToSeed(symbol + "_" + days));
  let v = base;
  const points = Array.from({ length: n }, (_, i) => {
    v *= 1 + (walkRand() - 0.48) * 0.02;
    return {
      time: Math.floor((anchor - (n - i) * iv) / 1000) as number,
      rawValue: v,
      volume: Math.floor(walkRand() * 50e6 + 5e6),
    };
  });

  // 3) 마지막 값을 고정 현재가에 맞춰 전체 스케일링
  const lastRaw = points[points.length - 1].rawValue;
  const scale = currentPrice / lastRaw;
  return points.map((p) => ({
    time: p.time,
    value: parseFloat((p.rawValue * scale).toFixed(2)),
    volume: p.volume,
  }));
}
