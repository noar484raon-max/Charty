"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Clock, Flame, Users, Search, X } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { fetchMemos, fetchFollowingMemos, toggleLike, toggleBookmark, createComment, getUserLikes, getUserBookmarks, fetchComments, searchUsers } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import MemoCard from "@/components/memo/MemoCard";

const TRENDING_TAGS = ["#삼성전자", "#HBM", "#비트코인", "#테슬라", "#AI반도체", "#금리인하", "#엔비디아"];

type FeedFilter = "latest" | "popular" | "following";

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

const FILTERS: { key: FeedFilter; label: string; icon: typeof Clock }[] = [
  { key: "latest", label: "최신", icon: Clock },
  { key: "popular", label: "인기", icon: Flame },
  { key: "following", label: "팔로잉", icon: Users },
];

export default function ExplorePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedFilter>("latest");
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const [userBookmarks, setUserBookmarks] = useState<Set<string>>(new Set());

  // 유저 검색
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 바깥 클릭 시 검색 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 디바운스 검색
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchUsers(searchQuery.trim());
      setSearchResults(results);
      setSearching(false);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  // 메모를 DB에서 불러오기
  const loadMemos = useCallback(async () => {
    setLoading(true);

    let raw: any[];
    if (filter === "following" && user) {
      raw = await fetchFollowingMemos(user.id);
    } else {
      raw = await fetchMemos(); // 전체 최신순
    }

    let likesSet = new Set<string>();
    let bookmarksSet = new Set<string>();
    if (user) {
      const [likes, bookmarks] = await Promise.all([
        getUserLikes(user.id),
        getUserBookmarks(user.id),
      ]);
      likesSet = likes;
      bookmarksSet = bookmarks;
      setUserLikes(likesSet);
      setUserBookmarks(bookmarksSet);
    }

    const items: MemoItem[] = await Promise.all(
      raw.map(async (m: any) => {
        const profile = m.profiles || {};
        const commentsRaw = await fetchComments(m.id);
        const { count: likeCount } = await supabase
          .from("likes")
          .select("*", { count: "exact", head: true })
          .eq("memo_id", m.id);
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
          likeCount: likeCount || 0,
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

    // 인기순: 좋아요 수로 정렬
    if (filter === "popular") {
      items.sort((a, b) => b.likeCount - a.likeCount);
    }

    setMemos(items);
    setLoading(false);
  }, [user, filter]);

  useEffect(() => { loadMemos(); }, [loadMemos]);

  // ─── Handlers ───

  const handleLike = async (id: string) => {
    if (!user) { router.push("/login"); return; }
    const liked = await toggleLike(user.id, id);
    showToast(liked ? "좋아요를 눌렀어요" : "좋아요를 취소했어요", liked ? "like" : "unlike");
    setUserLikes((prev) => {
      const next = new Set(prev);
      if (liked) next.add(id); else next.delete(id);
      return next;
    });
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
    setUserBookmarks((prev) => {
      const next = new Set(prev);
      if (bookmarked) next.add(id); else next.delete(id);
      return next;
    });
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
    <main className="max-w-[640px] mx-auto px-4 md:px-8 pt-6">
      {/* Header + User Search */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-accent" />
          <h1 className="text-xl font-extrabold">피드</h1>
        </div>

        {/* User search */}
        <div ref={searchRef} className="relative">
          <div className="flex items-center bg-surface border border-white/[0.06] rounded-xl px-3 py-2 gap-2 w-[200px] sm:w-[240px] focus-within:border-accent/50 transition-colors">
            <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => searchQuery && setSearchOpen(true)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600"
              placeholder="유저 검색..."
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(""); setSearchOpen(false); }} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search results dropdown */}
          {searchOpen && searchQuery.trim() && (
            <div className="absolute right-0 top-full mt-1.5 w-[280px] bg-surface-2 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50">
              {searching ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-zinc-500">
                  <div className="w-3 h-3 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
                  검색 중...
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      router.push(`/profile/${u.username}`);
                      setSearchQuery("");
                      setSearchOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-[11px] font-bold text-accent shrink-0">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        (u.display_name || u.username || "?")[0].toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.display_name || u.username}</div>
                      <div className="text-[11px] text-zinc-500">@{u.username}</div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="py-4 text-center text-sm text-zinc-500">
                  검색 결과가 없습니다
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Feed filter tabs */}
      <div className="flex gap-0.5 bg-surface border border-white/[0.06] rounded-xl p-1 w-fit mb-5">
        {FILTERS.map((f) => {
          const Icon = f.icon;
          const isActive = filter === f.key;
          const needsAuth = f.key === "following" && !user;
          return (
            <button
              key={f.key}
              onClick={() => {
                if (needsAuth) { router.push("/login"); return; }
                setFilter(f.key);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                isActive ? "bg-accent text-black font-semibold" : "text-zinc-500 hover:text-zinc-300 hover:bg-surface-2"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Trending tags */}
      <div className="mb-5">
        <div className="flex gap-1.5 flex-wrap">
          {TRENDING_TAGS.map((tag) => (
            <span key={tag} className="px-3 py-1.5 bg-surface border border-white/[0.06] rounded-lg text-xs text-zinc-400 hover:text-accent hover:border-accent/20 cursor-pointer transition-colors">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Memos feed from DB */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-sm text-zinc-400">
          <div className="w-4 h-4 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
          메모 불러오는 중...
        </div>
      ) : memos.length === 0 ? (
        <div className="rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-b from-accent/5 to-transparent border border-dashed border-accent/20 rounded-2xl py-12 px-6 text-center">
            <div className="text-4xl mb-3">{filter === "following" ? "👥" : "💡"}</div>
            <div className="text-lg font-bold mb-2">
              {filter === "following" ? "팔로우 중인 유저의 메모가 없어요" : "첫 인사이트를 공유해보세요"}
            </div>
            <div className="text-sm text-zinc-400 mb-6 max-w-sm mx-auto">
              {filter === "following"
                ? "다른 트레이더를 팔로우하면 여기에 그들의 메모가 나타나요"
                : "홈에서 종목 차트를 분석하고, 핀을 찍어 메모를 남겨보세요. 커뮤니티의 트레이더들과 인사이트를 나눌 수 있어요."}
            </div>
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 bg-accent text-black font-bold text-sm px-5 py-2.5 rounded-xl hover:brightness-110 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 5-9" />
              </svg>
              차트 보러 가기
            </button>
          </div>

          {filter !== "following" && (
            <div className="mt-6 grid gap-3">
              {[
                { icon: "📊", title: "차트 분석", desc: "종목별 실시간 차트를 확인하고 기술적 분석을 해보세요" },
                { icon: "📌", title: "핀 메모", desc: "차트 위 특정 가격/시점에 핀을 찍고 인사이트를 남기세요" },
                { icon: "🤝", title: "커뮤니티", desc: "다른 트레이더의 메모에 좋아요, 댓글로 소통하세요" },
              ].map((tip) => (
                <div key={tip.title} className="flex items-start gap-3 bg-surface border border-white/[0.06] rounded-xl p-4">
                  <span className="text-xl shrink-0">{tip.icon}</span>
                  <div>
                    <div className="text-sm font-semibold mb-0.5">{tip.title}</div>
                    <div className="text-xs text-zinc-500">{tip.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {memos.map((m) => (
            <MemoCard key={m.id} memo={m} onLike={handleLike} onBookmark={handleBookmark} onComment={handleComment} />
          ))}
        </div>
      )}

      {/* Footer */}
      {memos.length > 0 && (
        <div className="py-8 text-center">
          <div className="text-xs text-zinc-600">모든 메모를 확인했습니다</div>
        </div>
      )}
    </main>
  );
}
