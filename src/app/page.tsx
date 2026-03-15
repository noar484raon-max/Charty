"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ASSETS, ASSET_TYPES } from "@/lib/assets";
import { useAppStore } from "@/stores/app-store";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatPrice, formatDate } from "@/lib/utils";
import { fetchMemos, createMemo, toggleLike, toggleBookmark, createComment, getUserLikes, getUserBookmarks, fetchComments } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import PriceChart from "@/components/chart/PriceChart";
import MemoCard from "@/components/memo/MemoCard";
import MemoCreateModal from "@/components/memo/MemoCreateModal";
import ValuationCard from "@/components/analysis/ValuationCard";

const RANGES = [
  { label: "1D", days: 1 },
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 },
  { label: "5Y", days: 1825 },
  { label: "ALL", days: 3650 },
];

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

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { assetType, currentAsset, range, crosshair, pinPoint, detailedChart, setAssetType, setCurrentAsset, setRange, setDetailedChart, openMemoModal } = useAppStore();
  const [chartData, setChartData] = useState<any[]>([]);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [memosLoading, setMemosLoading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // User likes/bookmarks sets
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const [userBookmarks, setUserBookmarks] = useState<Set<string>>(new Set());

  // Close search on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return ASSETS.filter(
      (a) => a.name.toLowerCase().includes(q) || a.ticker.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [searchQuery]);

  // Fetch chart data + daily data for MA calculation
  const loadChart = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/market?type=${currentAsset.type}&symbol=${currentAsset.symbol}&days=${range}`);
      const data = await res.json();
      setChartData(Array.isArray(data) ? data : []);
    } catch { setChartData([]); }
    setLoading(false);
  }, [currentAsset, range]);

  // 일봉 데이터 (MA 계산용) — 자세한 차트 모드일 때만
  const loadDailyData = useCallback(async () => {
    if (!detailedChart) return;
    try {
      const res = await fetch(`/api/market?type=${currentAsset.type}&symbol=${currentAsset.symbol}&days=365`);
      const data = await res.json();
      setDailyData(Array.isArray(data) ? data : []);
    } catch { setDailyData([]); }
  }, [currentAsset, detailedChart]);

  useEffect(() => { loadChart(); }, [loadChart]);
  useEffect(() => { loadDailyData(); }, [loadDailyData]);

  // Fetch memos from DB
  const loadMemos = useCallback(async () => {
    setMemosLoading(true);
    const raw = await fetchMemos(currentAsset.symbol);

    // Fetch user likes/bookmarks in parallel
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

    // Fetch like counts for each memo
    const countsPromises = items.map(async (item) => {
      const { count } = await supabase
        .from("likes")
        .select("*", { count: "exact", head: true })
        .eq("memo_id", item.id);
      return { ...item, likeCount: count || 0 };
    });
    const itemsWithCounts = await Promise.all(countsPromises);

    setMemos(itemsWithCounts);
    setMemosLoading(false);
  }, [currentAsset.symbol, user]);

  useEffect(() => { loadMemos(); }, [loadMemos]);

  // Price info
  const priceInfo = useMemo(() => {
    if (!chartData.length) return { price: 0, change: 0, pct: 0 };
    const last = chartData[chartData.length - 1].value;
    const first = chartData[0].value;
    return { price: last, change: last - first, pct: (last - first) / first * 100 };
  }, [chartData]);

  const currencyLabel = "USD";

  // Pins for chart
  const chartPins = useMemo(
    () => memos.map((m) => ({
      time: Math.floor(m.pinTimestamp / 1000),
      sentiment: m.sentiment,
      username: m.author.username || "",
    })),
    [memos]
  );

  // ─── Handlers ───

  const handleSaveMemo = async (data: any) => {
    if (!user) { router.push("/login"); return; }
    const result = await createMemo({
      userId: user.id,
      assetSymbol: currentAsset.symbol,
      assetType: currentAsset.type,
      content: data.content,
      sentiment: data.sentiment,
      pinPrice: data.pinPrice,
      pinTimestamp: data.pinTimestamp,
    });
    if (result) {
      showToast("메모를 작성했어요", "success");
      loadMemos();
    }
  };

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

  const handleSearchSelect = (asset: typeof ASSETS[0]) => {
    setAssetType(asset.type);
    setCurrentAsset(asset);
    setSearchQuery("");
    setSearchOpen(false);
  };

  return (
    <main className="max-w-[960px] mx-auto px-4 md:px-8 pt-6">
      {/* Header with search */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">
            Chart<span className="text-accent">y</span>
          </h1>
          <span className="hidden sm:block text-xs text-zinc-500">
            차트 위에 인사이트를 핀하세요
          </span>
        </div>

        {/* Search */}
        <div ref={searchRef} className="relative">
          <div className="flex items-center bg-surface border border-white/[0.06] rounded-xl px-3 py-2 gap-2 w-[200px] sm:w-[260px] focus-within:border-accent/50 transition-colors">
            <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => searchQuery && setSearchOpen(true)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600"
              placeholder="종목 검색..."
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(""); setSearchOpen(false); }} className="text-zinc-500 hover:text-zinc-300">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {searchOpen && searchResults.length > 0 && (
            <div className="absolute right-0 top-full mt-1.5 w-[280px] bg-surface-2 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50">
              {searchResults.map((a) => (
                <button key={a.symbol} onClick={() => handleSearchSelect(a)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04] transition-colors">
                  <div className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center text-[11px] font-bold text-zinc-400 shrink-0">
                    {a.ticker.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-[11px] text-zinc-500">
                      {a.ticker} · {a.type === "crypto" ? "암호화폐" : "미국 주식"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchOpen && searchQuery && searchResults.length === 0 && (
            <div className="absolute right-0 top-full mt-1.5 w-[280px] bg-surface-2 border border-white/[0.08] rounded-xl shadow-2xl p-4 text-center z-50">
              <div className="text-sm text-zinc-500">검색 결과가 없습니다</div>
            </div>
          )}
        </div>
      </div>

      {/* Asset type tabs */}
      <div className="flex gap-0.5 bg-surface border border-white/[0.06] rounded-xl p-1 w-fit mb-3">
        {ASSET_TYPES.map((t) => (
          <button key={t.key} onClick={() => setAssetType(t.key)}
            className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
              assetType === t.key ? "bg-accent text-black font-semibold" : "text-zinc-500 hover:text-zinc-300 hover:bg-surface-2"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Asset selector pills */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-3 scrollbar-hide">
        {ASSETS.filter((a) => a.type === assetType).map((a) => (
          <button key={a.symbol} onClick={() => setCurrentAsset(a)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
              currentAsset.symbol === a.symbol ? "bg-accent text-black font-semibold" : "bg-surface text-zinc-500 hover:text-zinc-300 border border-white/[0.06] hover:border-white/10"
            }`}>
            {a.ticker}
          </button>
        ))}
      </div>

      {/* Range + detailed chart toggle */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-0.5 bg-surface border border-white/[0.06] rounded-xl p-1 w-fit">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setRange(r.days)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                range === r.days ? "bg-accent text-black font-semibold" : "text-zinc-500 hover:text-zinc-300 hover:bg-surface-2"
              }`}>
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setDetailedChart(!detailedChart)}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 ${
            detailedChart
              ? "bg-accent/10 border-accent/30 text-accent"
              : "bg-surface border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:border-white/10"
          }`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 5-9" />
          </svg>
          자세한 차트
        </button>
      </div>

      {/* Price */}
      <div className="mb-3">
        <div className="text-[13px] text-zinc-400 font-medium mb-1">
          {currentAsset.name} ({currentAsset.ticker}) · {currencyLabel}
        </div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-[34px] font-extrabold font-mono tracking-tighter leading-none">
            {crosshair ? formatPrice(crosshair.value) : formatPrice(priceInfo.price)}
          </span>
          {!crosshair && priceInfo.change !== 0 && (
            <span className={`text-sm font-mono font-medium px-2 py-0.5 rounded-md ${
              priceInfo.change >= 0 ? "text-up bg-up/10" : "text-down bg-down/10"
            }`}>
              {priceInfo.change >= 0 ? "+" : ""}{formatPrice(Math.abs(priceInfo.change))} ({priceInfo.change >= 0 ? "+" : ""}{priceInfo.pct.toFixed(2)}%)
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="relative mb-3">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface rounded-2xl z-20 gap-2 text-sm text-zinc-400">
            <div className="w-4 h-4 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
            시세 불러오는 중...
          </div>
        )}
        {chartData.length > 0 && <PriceChart data={chartData} pins={chartPins} range={range} dailyData={dailyData} />}
      </div>

      {/* Valuation Analysis Card */}
      <div className="mb-3">
        <ValuationCard symbol={currentAsset.symbol} type={currentAsset.type} assetName={currentAsset.name} />
      </div>

      {/* Pin bar */}
      <div className="flex items-center gap-3 bg-surface border border-white/[0.06] rounded-xl px-4 py-2.5 mb-6 min-h-[46px]">
        <div className={`flex-1 text-[13px] font-mono ${pinPoint ? "text-zinc-200" : "text-zinc-600"}`}>
          {pinPoint ? `📌 ${formatDate(pinPoint.time * 1000)}  ${formatPrice(pinPoint.value)}` : "차트를 클릭하여 핀 위치를 선택하세요"}
        </div>
        <button
          onClick={() => { if (!user) { router.push("/login"); return; } openMemoModal(); }}
          className={`bg-accent text-black rounded-lg px-4 py-2 text-[13px] font-bold transition-all ${
            pinPoint ? "opacity-100 translate-y-0" : "opacity-0 pointer-events-none translate-y-0.5"
          }`}>
          + 메모 추가
        </button>
      </div>

      {/* Feed */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold">커뮤니티 메모</h2>
        {memos.length > 0 && (
          <span className="text-xs text-zinc-500 bg-surface-2 px-2 py-0.5 rounded-full">{memos.length}개</span>
        )}
      </div>

      {memos.length === 0 && !memosLoading ? (
        <div className="border border-dashed border-white/10 rounded-2xl py-10 text-center">
          <div className="text-3xl mb-2">📌</div>
          <div className="text-sm font-semibold mb-1">아직 메모가 없어요</div>
          <div className="text-xs text-zinc-500">차트를 클릭하고 첫 번째 인사이트를 핀해보세요</div>
        </div>
      ) : (
        memos.map((m) => (
          <MemoCard key={m.id} memo={m} onLike={handleLike} onBookmark={handleBookmark} onComment={handleComment} />
        ))
      )}

      <MemoCreateModal onSave={handleSaveMemo} />
    </main>
  );
}
