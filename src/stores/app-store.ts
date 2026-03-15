import { create } from "zustand";
import type { AssetInfo, AssetType } from "@/lib/assets";
import { ASSETS } from "@/lib/assets";

type ChartPoint = {
  time: number;
  value: number;
};

export type MALine = {
  period: number;
  color: string;
  enabled: boolean;
};

// 토스증권 방식: 캔들 타입 (일봉/주봉/월봉/연봉)
export type ChartInterval = "daily" | "weekly" | "monthly" | "yearly";

// 각 캔들 타입별 하위 기간 옵션
export const SUB_RANGES: Record<ChartInterval, { label: string; range: string }[]> = {
  daily: [
    { label: "1개월", range: "1mo" },
    { label: "3개월", range: "3mo" },
    { label: "6개월", range: "6mo" },
    { label: "1년", range: "1y" },
    { label: "전체", range: "max" },
  ],
  weekly: [
    { label: "1년", range: "1y" },
    { label: "2년", range: "2y" },
    { label: "5년", range: "5y" },
    { label: "10년", range: "10y" },
    { label: "전체", range: "max" },
  ],
  monthly: [
    { label: "2년", range: "2y" },
    { label: "5년", range: "5y" },
    { label: "10년", range: "10y" },
    { label: "전체", range: "max" },
  ],
  yearly: [
    { label: "전체", range: "max" },
  ],
};

// 각 캔들 타입의 기본 하위 기간 — 토스처럼 전체 기간 기본값
const DEFAULT_SUB_RANGES: Record<ChartInterval, string> = {
  daily: "1y",
  weekly: "max",
  monthly: "max",
  yearly: "max",
};

interface AppState {
  // Asset
  assetType: AssetType;
  currentAsset: AssetInfo;
  setAssetType: (type: AssetType) => void;
  setCurrentAsset: (asset: AssetInfo) => void;

  // Chart interval (토스 방식: 캔들 타입)
  chartInterval: ChartInterval;
  setChartInterval: (interval: ChartInterval) => void;
  subRange: string;
  setSubRange: (range: string) => void;

  // Legacy range (하위 호환용)
  range: number;
  setRange: (days: number) => void;

  // Chart interaction
  crosshair: ChartPoint | null;
  setCrosshair: (point: ChartPoint | null) => void;
  pinPoint: ChartPoint | null;
  setPinPoint: (point: ChartPoint | null) => void;

  // Detailed chart mode
  detailedChart: boolean;
  setDetailedChart: (v: boolean) => void;

  // Moving average settings
  maLines: MALine[];
  setMALines: (lines: MALine[]) => void;
  toggleMA: (period: number) => void;
  updateMAPeriod: (index: number, period: number) => void;
  updateMAColor: (index: number, color: string) => void;
  addMALine: () => void;
  removeMALine: (index: number) => void;

  // Modal
  memoModalOpen: boolean;
  openMemoModal: () => void;
  closeMemoModal: () => void;
}

const DEFAULT_MA_LINES: MALine[] = [
  { period: 5, color: "#22c55e", enabled: true },   // 녹색
  { period: 20, color: "#ef4444", enabled: true },   // 빨간색
  { period: 60, color: "#f59e0b", enabled: true },   // 주황색
  { period: 120, color: "#a855f7", enabled: true },   // 보라색
];

export const useAppStore = create<AppState>((set) => ({
  assetType: "us_stock",
  currentAsset: ASSETS[0],
  setAssetType: (type) => {
    const firstOfType = ASSETS.find((a) => a.type === type) || ASSETS[0];
    set({ assetType: type, currentAsset: firstOfType, crosshair: null, pinPoint: null });
  },
  setCurrentAsset: (asset) => set({ currentAsset: asset, assetType: asset.type, crosshair: null, pinPoint: null }),

  // 토스 방식: 캔들 타입
  chartInterval: "daily",
  setChartInterval: (interval) => set({
    chartInterval: interval,
    subRange: DEFAULT_SUB_RANGES[interval],
    crosshair: null,
  }),
  subRange: "1y",
  setSubRange: (range) => set({ subRange: range, crosshair: null }),

  // 레거시
  range: 365,
  setRange: (days) => set({ range: days }),

  crosshair: null,
  setCrosshair: (point) => set({ crosshair: point }),
  pinPoint: null,
  setPinPoint: (point) => set({ pinPoint: point }),

  detailedChart: true,  // 기본값을 true로 변경 (항상 이동평균선 표시)
  setDetailedChart: (v) => set({ detailedChart: v }),

  maLines: DEFAULT_MA_LINES,
  setMALines: (lines) => set({ maLines: lines }),
  toggleMA: (period) => set((s) => ({
    maLines: s.maLines.map((l) => l.period === period ? { ...l, enabled: !l.enabled } : l),
  })),
  updateMAPeriod: (index, period) => set((s) => ({
    maLines: s.maLines.map((l, i) => i === index ? { ...l, period } : l),
  })),
  updateMAColor: (index, color) => set((s) => ({
    maLines: s.maLines.map((l, i) => i === index ? { ...l, color } : l),
  })),
  addMALine: () => set((s) => ({
    maLines: [...s.maLines, { period: 200, color: "#10b981", enabled: true }],
  })),
  removeMALine: (index) => set((s) => ({
    maLines: s.maLines.filter((_, i) => i !== index),
  })),

  memoModalOpen: false,
  openMemoModal: () => set({ memoModalOpen: true }),
  closeMemoModal: () => set({ memoModalOpen: false }),
}));
