"use client";

import { useState, useMemo } from "react";
import { getLandDots } from "./land-dots";

export interface MapCountry {
  code: string;
  name: string;
  flag: string;
  lat: number;
  lng: number;
  sentiment: number;
  label: string;
  articleCount: number;
}

interface WorldMapProps {
  countries: MapCountry[];
  selectedCountry: string | null;
  onSelectCountry: (code: string) => void;
}

function project(lat: number, lng: number): [number, number] {
  const x = ((lng + 180) / 360) * 1000;
  const latRad = (lat * Math.PI) / 180;
  const mercY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = 500 - (mercY / Math.PI) * 400;
  return [Math.max(10, Math.min(990, x)), Math.max(20, Math.min(680, y))];
}

function sentimentColor(s: number): string {
  if (s >= 60) return "#22c55e";
  if (s >= 50) return "#eab308";
  return "#ef4444";
}

export default function WorldMap({ countries, selectedCountry, onSelectCountry }: WorldMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const landDots = useMemo(() => getLandDots(), []);

  return (
    <div className="relative w-full h-full">
      <svg viewBox="0 0 1000 700" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="mapBg" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#0e1525" />
            <stop offset="100%" stopColor="#060a14" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* 배경 */}
        <rect width="1000" height="700" fill="url(#mapBg)" />

        {/* 위도 그리드 */}
        {[-60, -30, 0, 30, 60].map((lat) => {
          const [, y] = project(lat, 0);
          return <line key={`la${lat}`} x1="30" y1={y} x2="970" y2={y}
            stroke="#1a2035" strokeWidth="0.5" strokeDasharray="4,8" />;
        })}
        {/* 경도 그리드 */}
        {[-150,-120,-90,-60,-30,0,30,60,90,120,150].map((lng) => {
          const [x] = project(0, lng);
          return <line key={`lo${lng}`} x1={x} y1="30" x2={x} y2="670"
            stroke="#1a2035" strokeWidth="0.5" strokeDasharray="4,8" />;
        })}

        {/* ★ 도트 매트릭스 대륙 ★ */}
        {landDots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r="1.8"
            fill="#1a5c4a" opacity="0.55" />
        ))}

        {/* 적도 강조 */}
        {(() => {
          const [, y] = project(0, 0);
          return <line x1="30" y1={y} x2="970" y2={y}
            stroke="#2a5060" strokeWidth="0.8" strokeDasharray="6,4" />;
        })()}

        {/* 지역 라벨 */}
        {[
          { l: "NORTH AMERICA", lat: 52, lng: -105 },
          { l: "SOUTH AMERICA", lat: -30, lng: -58 },
          { l: "EUROPE", lat: 56, lng: 15 },
          { l: "AFRICA", lat: 5, lng: 22 },
          { l: "ASIA", lat: 48, lng: 85 },
          { l: "OCEANIA", lat: -22, lng: 140 },
        ].map((r) => {
          const [x, y] = project(r.lat, r.lng);
          return (
            <text key={r.l} x={x} y={y} textAnchor="middle" fontSize="10"
              fill="#1e3548" fontFamily="system-ui" fontWeight="700" letterSpacing="3">
              {r.l}
            </text>
          );
        })}

        {/* 국가 마커 */}
        {countries.map((c) => {
          const [x, y] = project(c.lat, c.lng);
          const sel = c.code === selectedCountry;
          const hov = c.code === hovered;
          const col = sentimentColor(c.sentiment);
          const hasNews = c.articleCount > 0;
          const r = sel ? 14 : hov ? 12 : hasNews ? 9 : 5;

          return (
            <g key={c.code}
              onClick={() => onSelectCountry(c.code)}
              onMouseEnter={() => setHovered(c.code)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            >
              {/* 펄스 */}
              {(hasNews || sel) && (
                <>
                  <circle cx={x} cy={y} r={r} fill="none" stroke={col} strokeWidth="1" opacity="0">
                    <animate attributeName="r" from={r} to={r * 3} dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.5" to="0" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={x} cy={y} r={r} fill="none" stroke={col} strokeWidth="0.8" opacity="0">
                    <animate attributeName="r" from={r} to={r * 2.5} dur="2.5s" begin="0.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.3" to="0" dur="2.5s" begin="0.8s" repeatCount="indefinite" />
                  </circle>
                </>
              )}

              {/* 글로우 */}
              <circle cx={x} cy={y} r={r * 2} fill={col} opacity="0.08" filter="url(#glow)" />

              {/* 메인 도트 */}
              <circle cx={x} cy={y} r={r} fill={col}
                stroke={sel ? "#fff" : hov ? "#ffffff60" : "none"}
                strokeWidth={sel ? 2.5 : hov ? 1.5 : 0}
                opacity={sel ? 1 : hasNews ? 0.85 : 0.4}
              />

              {/* 라벨 */}
              {(hov || sel) && (
                <g>
                  <rect x={x - 50} y={y - r - 32}
                    width={100} height="28" rx="6"
                    fill="#141b2d" stroke="#2a3550" strokeWidth="1" opacity="0.95" />
                  <text x={x} y={y - r - 18} textAnchor="middle"
                    fontSize="11" fill="#e4e4e7" fontWeight="700" fontFamily="system-ui">
                    {c.flag} {c.name}
                  </text>
                  <text x={x} y={y - r - 7} textAnchor="middle"
                    fontSize="9" fill={col} fontWeight="600" fontFamily="system-ui">
                    {c.label} · {c.sentiment}점 · {c.articleCount}건
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* 범례 */}
      <div className="absolute bottom-3 right-3 bg-surface/80 backdrop-blur-sm border border-white/[0.06] rounded-lg px-2.5 py-2 text-[10px]">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-zinc-400">긍정</span>
        </div>
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2 h-2 rounded-full bg-yellow-500" /><span className="text-zinc-400">중립</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" /><span className="text-zinc-400">부정</span>
        </div>
      </div>
    </div>
  );
}
