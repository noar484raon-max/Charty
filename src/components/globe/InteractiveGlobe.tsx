"use client";

import { useState } from "react";

interface CountryPoint {
  code: string;
  name: string;
  flag: string;
  lat: number;
  lng: number;
  sentiment: number;
  label: string;
  articleCount: number;
}

interface InteractiveGlobeProps {
  countries: CountryPoint[];
  selectedCountry: string | null;
  onSelectCountry: (code: string) => void;
}

// Mercator 투영: 위도/경도 → SVG x,y (%)
function project(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng + 180) / 360) * 100;
  // Mercator y 보정
  const latRad = (lat * Math.PI) / 180;
  const mercY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = 50 - (mercY / (2 * Math.PI)) * 100 * 0.8;
  return { x: Math.max(1, Math.min(99, x)), y: Math.max(3, Math.min(97, y)) };
}

function sentimentColor(score: number): string {
  if (score >= 60) return "#22c55e";
  if (score >= 50) return "#eab308";
  return "#ef4444";
}

// ─── 간략화된 대륙 SVG 폴리곤 (Mercator) ───
const CONTINENT_PATHS = [
  // 북미
  "M 8,18 L 12,15 18,14 22,16 24,20 26,25 24,30 22,33 18,35 14,36 10,34 6,30 5,25 6,20 Z",
  // 중미
  "M 18,35 L 20,37 22,40 20,42 18,40 Z",
  // 남미
  "M 20,42 L 24,44 27,48 28,55 26,62 24,68 22,70 20,68 18,60 19,52 18,46 Z",
  // 유럽
  "M 46,15 L 48,13 52,12 56,14 58,16 56,20 54,22 50,24 48,22 46,20 44,18 Z",
  // 아프리카
  "M 46,28 L 50,26 54,28 56,32 58,38 56,48 54,54 50,58 48,56 44,48 42,40 44,34 Z",
  // 러시아/중앙아시아
  "M 56,10 L 60,8 70,7 80,8 88,10 92,12 90,16 86,18 80,18 72,16 64,16 58,14 Z",
  // 중동
  "M 56,22 L 60,20 64,22 66,26 64,30 60,28 56,26 Z",
  // 남아시아 (인도)
  "M 64,26 L 68,24 72,26 74,30 72,36 68,38 66,34 64,30 Z",
  // 동남아
  "M 74,32 L 78,30 82,32 84,38 80,40 76,38 74,36 Z",
  // 동아시아
  "M 76,16 L 80,14 84,16 86,20 84,24 80,26 76,24 74,20 Z",
  // 호주
  "M 80,52 L 86,48 92,50 94,56 90,60 84,58 80,56 Z",
];

export default function InteractiveGlobe({ countries, selectedCountry, onSelectCountry }: InteractiveGlobeProps) {
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      <svg
        viewBox="0 0 100 75"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* 배경 */}
        <rect width="100" height="75" fill="#080c18" rx="0.5" />

        {/* 그리드 라인 */}
        {[-60,-30,0,30,60].map((lat) => {
          const { y } = project(lat, 0);
          return <line key={`lat${lat}`} x1="0" y1={y} x2="100" y2={y} stroke="#1a1f30" strokeWidth="0.1" />;
        })}
        {[-120,-60,0,60,120].map((lng) => {
          const { x } = project(0, lng);
          return <line key={`lng${lng}`} x1={x} y1="0" x2={x} y2="75" stroke="#1a1f30" strokeWidth="0.1" />;
        })}

        {/* 대륙 실루엣 */}
        {CONTINENT_PATHS.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="#0f1a28"
            stroke="#1e3a4a"
            strokeWidth="0.15"
            opacity="0.8"
          />
        ))}

        {/* 적도선 강조 */}
        {(() => {
          const { y } = project(0, 0);
          return <line x1="0" y1={y} x2="100" y2={y} stroke="#1e3a4a" strokeWidth="0.15" strokeDasharray="0.5,0.5" />;
        })()}

        {/* 국가 마커 */}
        {countries.map((c) => {
          const { x, y } = project(c.lat, c.lng);
          const sel = c.code === selectedCountry;
          const hov = c.code === hoveredCountry;
          const col = sentimentColor(c.sentiment);
          const hasNews = c.articleCount > 0;
          const r = sel ? 1.8 : hov ? 1.5 : hasNews ? 1.1 : 0.6;

          return (
            <g
              key={c.code}
              onClick={() => onSelectCountry(c.code)}
              onMouseEnter={() => setHoveredCountry(c.code)}
              onMouseLeave={() => setHoveredCountry(null)}
              className="cursor-pointer"
            >
              {/* 펄스 링 (뉴스 있는 국가) */}
              {(hasNews || sel) && (
                <>
                  <circle cx={x} cy={y} r={r * 2.5} fill="none" stroke={col} strokeWidth="0.1" opacity="0.3">
                    <animate attributeName="r" from={r * 1.5} to={r * 3} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.4" to="0" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={x} cy={y} r={r * 1.8} fill="none" stroke={col} strokeWidth="0.15" opacity="0.2">
                    <animate attributeName="r" from={r * 1.2} to={r * 2.5} dur="2s" begin="0.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.3" to="0" dur="2s" begin="0.5s" repeatCount="indefinite" />
                  </circle>
                </>
              )}

              {/* 글로우 */}
              <circle cx={x} cy={y} r={r * 1.5} fill={col} opacity="0.15" />

              {/* 메인 마커 */}
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={col}
                stroke={sel ? "white" : "none"}
                strokeWidth={sel ? 0.3 : 0}
                opacity={sel ? 1 : hasNews ? 0.9 : 0.5}
                className="transition-all duration-200"
              />

              {/* 국가 라벨 (호버/선택 시) */}
              {(hov || sel) && (
                <g>
                  <rect
                    x={x + 2}
                    y={y - 3.5}
                    width={c.name.length * 1.8 + 4}
                    height="5"
                    rx="1"
                    fill="#1a1f2e"
                    stroke="#2a3040"
                    strokeWidth="0.15"
                    opacity="0.95"
                  />
                  <text
                    x={x + 3.5}
                    y={y - 0.5}
                    fontSize="2.2"
                    fill="white"
                    fontWeight="bold"
                    fontFamily="system-ui"
                  >
                    {c.flag} {c.name}
                  </text>
                  <text
                    x={x + 3.5}
                    y={y + 1.5}
                    fontSize="1.5"
                    fill={col}
                    fontFamily="system-ui"
                  >
                    {c.label} · {c.sentiment}점
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

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-zinc-600 pointer-events-none">
        국가 마커를 클릭하여 뉴스 보기
      </div>
    </div>
  );
}
