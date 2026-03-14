"use client";

import { useState } from "react";
import { Settings, Plus, Trash2 } from "lucide-react";
import { useAppStore } from "@/stores/app-store";

const COLOR_PRESETS = [
  "#f59e0b", "#3b82f6", "#a855f7", "#ef4444", "#10b981",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#8b5cf6",
];

export default function SettingsPage() {
  const { maLines, toggleMA, updateMAPeriod, updateMAColor, addMALine, removeMALine } = useAppStore();
  const [editingColor, setEditingColor] = useState<number | null>(null);

  return (
    <main className="max-w-[640px] mx-auto px-4 md:px-8 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-extrabold">설정</h1>
      </div>

      <div className="space-y-4">
        {/* Moving Average Settings */}
        <section className="bg-surface border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold">이동평균선 설정</h2>
            <span className="text-[11px] text-zinc-500">자세한 차트에서 표시됩니다</span>
          </div>
          <p className="text-xs text-zinc-600 mb-4">
            기간(일)과 색상을 자유롭게 설정하세요. 활성화된 이동평균선만 차트에 표시됩니다.
          </p>

          <div className="space-y-2.5">
            {maLines.map((ma, i) => (
              <div key={i} className="flex items-center gap-2.5 group">
                {/* Toggle */}
                <button
                  onClick={() => toggleMA(ma.period)}
                  className={`w-9 h-5 rounded-full relative shrink-0 transition-colors ${
                    ma.enabled ? "bg-accent" : "bg-surface-3 border border-white/10"
                  }`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                    ma.enabled ? "left-[18px]" : "left-0.5"
                  }`} />
                </button>

                {/* Color indicator + picker */}
                <div className="relative">
                  <button
                    onClick={() => setEditingColor(editingColor === i ? null : i)}
                    className="w-6 h-6 rounded-full border-2 border-white/10 shrink-0 hover:border-white/20 transition-colors"
                    style={{ backgroundColor: ma.color }}
                  />
                  {editingColor === i && (
                    <div className="absolute top-8 left-0 z-50 bg-surface-2 border border-white/[0.08] rounded-xl p-2 shadow-2xl">
                      <div className="grid grid-cols-5 gap-1.5">
                        {COLOR_PRESETS.map((c) => (
                          <button
                            key={c}
                            onClick={() => { updateMAColor(i, c); setEditingColor(null); }}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${
                              ma.color === c ? "border-white scale-110" : "border-transparent hover:border-white/30"
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Label */}
                <span className="text-xs text-zinc-400 font-medium w-8 shrink-0">MA</span>

                {/* Period input */}
                <input
                  type="number"
                  value={ma.period}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (v > 0 && v <= 500) updateMAPeriod(i, v);
                  }}
                  className="w-16 bg-surface-2 border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-center font-mono outline-none focus:border-accent/50 transition-colors"
                  min={1}
                  max={500}
                />
                <span className="text-[11px] text-zinc-600">일</span>

                {/* Remove */}
                {maLines.length > 1 && (
                  <button
                    onClick={() => removeMALine(i)}
                    className="ml-auto opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add new MA line */}
          {maLines.length < 6 && (
            <button
              onClick={addMALine}
              className="flex items-center gap-1.5 mt-3 text-xs text-zinc-500 hover:text-accent transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              이동평균선 추가
            </button>
          )}
        </section>

        {/* Theme */}
        <section className="bg-surface border border-white/[0.06] rounded-2xl p-5">
          <h2 className="text-sm font-bold mb-3">테마</h2>
          <div className="flex gap-2">
            <button className="flex-1 py-2.5 rounded-xl bg-accent text-black text-xs font-semibold">다크 모드</button>
            <button className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-white/[0.06] text-xs text-zinc-500 cursor-not-allowed">라이트 모드 (준비 중)</button>
          </div>
        </section>

        {/* Notifications */}
        <section className="bg-surface border border-white/[0.06] rounded-2xl p-5">
          <h2 className="text-sm font-bold mb-3">알림</h2>
          <div className="space-y-3">
            {["새 댓글 알림", "좋아요 알림", "팔로우 알림"].map((label, i) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">{label}</span>
                <div className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${
                  i !== 1 ? "bg-accent" : "bg-surface-3 border border-white/10"
                }`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                    i !== 1 ? "left-[18px]" : "left-0.5"
                  }`} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* App info */}
        <section className="bg-surface border border-white/[0.06] rounded-2xl p-5">
          <h2 className="text-sm font-bold mb-2">앱 정보</h2>
          <div className="text-xs text-zinc-500 space-y-1">
            <div>Charty v0.1.0 (프로토타입)</div>
            <div>차트 위에 인사이트를 핀하세요</div>
          </div>
        </section>
      </div>
    </main>
  );
}
