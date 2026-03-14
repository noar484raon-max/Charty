"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { ASSETS, type AssetInfo } from "@/lib/assets";
import { useAppStore } from "@/stores/app-store";

export default function Navbar() {
  const { setCurrentAsset } = useAppStore();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return ASSETS.filter(
      (a) => a.name.toLowerCase().includes(q) || a.ticker.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query]);

  const handleSelect = (asset: AssetInfo) => {
    setCurrentAsset(asset);
    setQuery("");
    setOpen(false);
  };

  return (
    <header className="flex items-center justify-between py-3 mb-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Chart<span className="text-accent">y</span>
        </h1>
        <span className="hidden sm:block text-xs text-zinc-500">
          차트 위에 인사이트를 핀하세요
        </span>
      </div>

      {/* Search */}
      <div className="relative w-64 max-w-[50%]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <input
          className="w-full bg-surface border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20 placeholder:text-zinc-600"
          placeholder="종목 검색..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {open && results.length > 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-surface border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
            {results.map((a) => (
              <button
                key={a.symbol}
                className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-surface-2 transition-colors"
                onMouseDown={() => handleSelect(a)}
              >
                <span className="text-sm font-semibold w-14">{a.ticker}</span>
                <span className="text-sm text-zinc-400 flex-1 truncate">{a.name}</span>
                <span className="text-[10px] text-zinc-600 bg-surface-3 px-2 py-0.5 rounded">
                  {a.type === "crypto" ? "암호화폐" : "주식"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
