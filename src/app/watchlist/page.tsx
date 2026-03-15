"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import Link from "next/link";

export default function WatchlistPage() {
  const { user } = useAuth();

  return (
    <main className="max-w-[960px] mx-auto px-4 md:px-8 pt-6">
      <h1 className="text-2xl font-extrabold tracking-tight mb-2">
        관심종목
      </h1>
      <p className="text-sm text-zinc-500 mb-8">
        북마크한 종목과 메모를 한 곳에서 관리하세요
      </p>

      {!user ? (
        <div className="border border-dashed border-white/10 rounded-2xl py-16 text-center">
          <div className="text-4xl mb-3">⭐</div>
          <div className="text-sm font-semibold mb-2">로그인이 필요합니다</div>
          <div className="text-xs text-zinc-500 mb-4">관심종목을 추가하려면 먼저 로그인하세요</div>
          <Link
            href="/login"
            className="inline-flex items-center px-4 py-2 bg-accent text-black text-sm font-bold rounded-xl"
          >
            로그인하기
          </Link>
        </div>
      ) : (
        <div className="border border-dashed border-white/10 rounded-2xl py-16 text-center">
          <div className="text-4xl mb-3">⭐</div>
          <div className="text-sm font-semibold mb-2">관심종목이 비어있어요</div>
          <div className="text-xs text-zinc-500 mb-4">
            차트 페이지에서 종목을 북마크하면 여기에 표시됩니다
          </div>
          <Link
            href="/chart"
            className="inline-flex items-center px-4 py-2 bg-accent text-black text-sm font-bold rounded-xl"
          >
            차트 보러가기
          </Link>
        </div>
      )}
    </main>
  );
}
