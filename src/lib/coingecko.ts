import type { ChartPoint } from "@/lib/types";

export type MarketChartResponse = {
  prices: Array<[number, number]>;
};

export function toChartPoints(data: MarketChartResponse): ChartPoint[] {
  return (data.prices ?? []).map(([t, v]) => ({ t, v }));
}

