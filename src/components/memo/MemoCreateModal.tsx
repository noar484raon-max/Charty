"use client";

import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/stores/app-store";
import { formatPrice, formatDate } from "@/lib/utils";

interface MemoCreateModalProps {
  onSave: (data: {
    content: string;
    sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
    isPublic: boolean;
    pinPrice: number;
    pinTimestamp: number;
  }) => void;
}

export default function MemoCreateModal({ onSave }: MemoCreateModalProps) {
  const { memoModalOpen, closeMemoModal, pinPoint, currentAsset } = useAppStore();
  const [text, setText] = useState("");
  const [sentiment, setSentiment] = useState<"BULLISH" | "BEARISH" | "NEUTRAL">("NEUTRAL");
  const [isPublic, setIsPublic] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (memoModalOpen) {
      setText("");
      setSentiment("NEUTRAL");
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
  }, [memoModalOpen]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") closeMemoModal(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [closeMemoModal]);

  const handleSave = () => {
    if (!text.trim() || !pinPoint) return;
    onSave({
      content: text.trim(),
      sentiment,
      isPublic,
      pinPrice: pinPoint.value,
      pinTimestamp: pinPoint.time * 1000,
    });
    closeMemoModal();
  };

  if (!pinPoint) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-[100] transition-opacity p-4 ${
        memoModalOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      onClick={(e) => e.target === e.currentTarget && closeMemoModal()}
    >
      <div
        className={`bg-surface border border-white/10 rounded-2xl p-6 w-[460px] max-w-full transition-transform ${
          memoModalOpen ? "translate-y-0 scale-100" : "translate-y-2 scale-[0.97]"
        }`}
      >
        <h2 className="text-lg font-bold mb-1">메모 남기기</h2>
        <p className="text-xs text-zinc-500 font-mono mb-4">
          {currentAsset.name} ({currentAsset.ticker}) · {formatDate(pinPoint.time * 1000)} · {formatPrice(pinPoint.value)}
        </p>

        {/* Sentiment */}
        <div className="flex gap-1.5 mb-3">
          {(["BULLISH", "BEARISH", "NEUTRAL"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSentiment(s)}
              className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                sentiment === s
                  ? s === "BULLISH"
                    ? "border-up text-up bg-up/10"
                    : s === "BEARISH"
                    ? "border-down text-down bg-down/10"
                    : "border-zinc-500 text-zinc-300 bg-zinc-800"
                  : "border-white/10 text-zinc-500 bg-surface-2 hover:border-white/15"
              }`}
            >
              {s === "BULLISH" ? "📈 매수" : s === "BEARISH" ? "📉 매도" : "⚖️ 중립"}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          rows={4}
          className="w-full bg-surface-2 border border-white/10 rounded-xl p-3 text-sm leading-relaxed resize-none outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
          placeholder={"이 시점에서 어떤 판단을 했나요?\n매수/매도 근거, 주목한 이유 등을 기록해보세요."}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setIsPublic(!isPublic)}
            className="flex items-center gap-2 text-sm text-zinc-400"
          >
            <div
              className={`w-9 h-5 rounded-full relative transition-colors ${
                isPublic ? "bg-up" : "bg-surface-3 border border-white/10"
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                  isPublic ? "left-[18px]" : "left-0.5"
                }`}
              />
            </div>
            {isPublic ? "공개" : "비공개"}
          </button>

          <div className="flex gap-2">
            <button
              onClick={closeMemoModal}
              className="px-4 py-2 rounded-xl border border-white/10 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={!text.trim()}
              className="px-5 py-2 rounded-xl bg-accent text-black text-sm font-bold hover:brightness-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
