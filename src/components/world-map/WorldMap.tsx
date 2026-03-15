"use client";

import { useState } from "react";

export interface MapCountry {
  code: string;
  name: string;
  flag: string;
  lat: number;
  lng: number;
  sentiment: number; // 0~100
  label: string;
  articleCount: number;
}

interface WorldMapProps {
  countries: MapCountry[];
  selectedCountry: string | null;
  onSelectCountry: (code: string) => void;
}

// Mercator 투영
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

  return (
    <div className="relative w-full h-full">
      <svg viewBox="0 0 1000 700" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="bgGrad" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#101828" />
            <stop offset="100%" stopColor="#060a14" />
          </radialGradient>
          {/* 마커 글로우 필터 */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 배경 */}
        <rect width="1000" height="700" fill="url(#bgGrad)" />

        {/* 위도 그리드 */}
        {[-60, -30, 0, 30, 60].map((lat) => {
          const [, y] = project(lat, 0);
          return (
            <line key={`lat${lat}`} x1="30" y1={y} x2="970" y2={y}
              stroke="#1a2035" strokeWidth="0.5" strokeDasharray="4,6" />
          );
        })}
        {/* 경도 그리드 */}
        {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lng) => {
          const [x] = project(0, lng);
          return (
            <line key={`lng${lng}`} x1={x} y1="30" x2={x} y2="670"
              stroke="#1a2035" strokeWidth="0.5" strokeDasharray="4,6" />
          );
        })}

        {/* 적도 강조 */}
        {(() => {
          const [, y] = project(0, 0);
          return <line x1="30" y1={y} x2="970" y2={y} stroke="#1e3a50" strokeWidth="0.8" strokeDasharray="8,4" />;
        })()}

        {/* 지역 라벨 */}
        {[
          { label: "North America", lat: 48, lng: -100 },
          { label: "South America", lat: -15, lng: -60 },
          { label: "Europe", lat: 54, lng: 15 },
          { label: "Africa", lat: 5, lng: 20 },
          { label: "Asia", lat: 45, lng: 90 },
          { label: "Oceania", lat: -25, lng: 135 },
        ].map((r) => {
          const [x, y] = project(r.lat, r.lng);
          return (
            <text key={r.label} x={x} y={y} textAnchor="middle" fontSize="11"
              fill="#1e3040" fontFamily="system-ui" fontWeight="600" letterSpacing="2">
              {r.label.toUpperCase()}
            </text>
          );
        })}

        {/* 국가 마커들 */}
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
              {/* 펄스 애니메이션 (뉴스 있는 국가) */}
              {(hasNews || sel) && (
                <>
                  <circle cx={x} cy={y} r={r} fill="none" stroke={col} strokeWidth="1" opacity="0">
                    <animate attributeName="r" from={r} to={r * 3} dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.6" to="0" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={x} cy={y} r={r} fill="none" stroke={col} strokeWidth="0.8" opacity="0">
                    <animate attributeName="r" from={r} to={r * 2.5} dur="2.5s" begin="0.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.4" to="0" dur="2.5s" begin="0.8s" repeatCount="indefinite" />
                  </circle>
                </>
              )}

              {/* 글로우 배경 */}
              <circle cx={x} cy={y} r={r * 2} fill={col} opacity="0.08" filter="url(#glow)" />

              {/* 메인 도트 */}
              <circle cx={x} cy={y} r={r} fill={col}
                stroke={sel ? "#ffffff" : hov ? "#ffffff60" : "none"}
                strokeWidth={sel ? 2.5 : hov ? 1.5 : 0}
                opacity={sel ? 1 : hasNews ? 0.85 : 0.4}
              />

              {/* 국가 라벨 (호버/선택 시) */}
              {(hov || sel) && (
                <g>
                  <rect x={x + r + 6} y={y - 20} width={Math.max(90, c.name.length * 14 + 30)}
                    height="40" rx="8" fill="#141b2d" stroke="#2a3550" strokeWidth="1" />
                  <text x={x + r + 14} y={y - 3} fontSize="13" fill="#e4e4e7" fontWeight="700" fontFamily="system-ui">
                    {c.flag} {c.name}
                  </text>
                  <text x={x + r + 14} y={y + 13} fontSize="10.5" fill={col} fontWeight="600" fontFamily="system-ui">
                    {c.label} · {c.sentiment}점 · {c.articleCount}건
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
