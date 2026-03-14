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

interface AppState {
  // Asset
  assetType: AssetType;
  currentAsset: AssetInfo;
  setAssetType: (type: AssetType) => void;
  setCurrentAsset: (asset: AssetInfo) => void;

  // Range
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
  { period: 5, color: "#f59e0b", enabled: true },
  { period: 20, color: "#3b82f6", enabled: true },
  { period: 60, color: "#a855f7", enabled: false },
  { period: 120, color: "#ef4444", enabled: false },
];

export const useAppStore = create<AppState>((set) => ({
  assetType: "us_stock",
  currentAsset: ASSETS[0],
  setAssetType: (type) => {
    const firstOfType = ASSETS.find((a) => a.type === type) || ASSETS[0];
    set({ assetType: type, currentAsset: firstOfType, crosshair: null, pinPoint: null });
  },
  setCurrentAsset: (asset) => set({ currentAsset: asset, assetType: asset.type, crosshair: null, pinPoint: null }),

  range: 7,
  setRange: (days) => set({ range: days }),

  crosshair: null,
  setCrosshair: (point) => set({ crosshair: point }),
  pinPoint: null,
  setPinPoint: (point) => set({ pinPoint: point }),

  detailedChart: false,
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
