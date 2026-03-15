"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { fetchMemos, toggleLike, toggleBookmark, createComment, getUserLikes, getUserBookmarks, fetchComments } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import MemoCard from "@/components/memo/MemoCard";

type MemoItem = {
  id: string;
  author: { username: string | null; displayName: string | null; image: string | null };
  pinPrice: number;
  pinTimestamp: number;
  content: string;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  likeCount: number;
  commentCount: number;
  liked: boolean;
  bookmarked: boolean;
  asset: string;
  comments: Array<{ author: { username: string | null; displayName: string | null; image: string | null }; content: string }>;
};

export default function CommunityPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 전체 메모 피드 로드
  const loadMemos = useCallback(async () => {
    setLoading(true);
    // 전체 메모 (symbol 빈 문자열이면 전체)
    const raw = await fetchMemos("");

    let likesSet = new Set<string>();
    let bookmarksSet = new Set<string>();
    if (user) {
      const [likes, bookmarks] = await Promise.all([
        getUserLikes(user.id),
        getUserBookmarks(user.id),
      ]);
      likesSet = likes;
      bookmarksSet = bookmarks;
    }

    const items: MemoItem[] = await Promise.all(
      raw.slice(0, 20).map(async (m: any) => {
        const profile = m.profiles || {};
        const commentsRaw = await fetchComments(m.id);
        return {
          id: m.id,
          author: {
            username: profile.username || null,
            displayName: profile.display_name || null,
            image: profile.avatar_url || null,
          },
          pinPrice: m.pin_price || 0,
          pinTimestamp: m.pin_timestamp || new Date(m.created_at).getTime(),
          content: m.content,
          sentiment: m.sentiment || "NEUTRAL",
          likeCount: 0,
          commentCount: commentsRaw.length,
          liked: likesSet.has(m.id),
          bookmarked: bookmarksSet.has(m.id),
          asset: m.asset_symbol,
          comments: commentsRaw.map((c: any) => ({
            author: {
              username: c.profiles?.username || null,
              displayName: c.profiles?.display_name || null,
              image: c.profiles?.avatar_url || null,
            },
            content: c.content,
          })),
        };
      })
    );

    const countsPromises = items.map(async (item) => {
      const { count } = await supabase
        .from("likes")
        .select("*", { count: "exact", head: true })
        .eq("memo_id", item.id);
      return { ...item, likeCount: count || 0 };
    });
    const itemsWithCounts = await Promise.all(countsPromises);

    setMemos(itemsWithCounts);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadMemos(); }, [loadMemos]);

  const handleLike = async (id: string) => {
    if (!user) { router.push("/login"); return; }
    const liked = await toggleLike(user.id, id);
    showToast(liked ? "좋아요를 눌렀어요" : "좋아요를 취소했어요", liked ? "like" : "unlike");
    setMemos((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, liked, likeCount: liked ? m.likeCount + 1 : m.likeCount - 1 } : m
      )
    );
  };

  const handleBookmark = async (id: string) => {
    if (!user) { router.push("/login"); return; }
    const bookmarked = await toggleBookmark(user.id, id);
    showToast(bookmarked ? "북마크에 저장했어요" : "북마크를 해제했어요", bookmarked ? "bookmark" : "unbookmark");
    setMemos((prev) =>
      prev.map((m) => m.id === id ? { ...m, bookmarked } : m)
    );
  };

  const handleComment = async (id: string, text: string) => {
    if (!user) { router.push("/login"); return; }
    const result = await createComment(user.id, id, text);
    if (result) {
      showToast("댓글을 작성했어요", "comment");
      loadMemos();
    }
  };

  return (
    <main className="max-w-[960px] mx-auto px-4 md:px-8 pt-6">
      <h1 className="text-2xl font-extrabold tracking-tight mb-2">
        커뮤니티
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        트레이더들의 인사이트를 확인하세요
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2">
          <div className="w-4 h-4 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
          <span className="text-sm text-zinc-400">메모 불러오는 중...</span>
        </div>
      ) : memos.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-2xl py-16 text-center">
          <div className="text-4xl mb-3">💬</div>
          <div className="text-sm font-semibold mb-2">아직 메모가 없어요</div>
          <div className="text-xs text-zinc-500">차트 페이지에서 첫 번째 인사이트를 핀해보세요</div>
        </div>
      ) : (
        memos.map((m) => (
          <MemoCard key={m.id} memo={m} onLike={handleLike} onBookmark={handleBookmark} onComment={handleComment} />
        ))
      )}
    </main>
  );
}
