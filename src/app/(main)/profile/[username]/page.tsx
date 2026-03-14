"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Pencil, X, Check, LogOut, FileText, BookmarkIcon, UserPlus, UserCheck } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import {
  updateProfile, getProfile, getFollowCounts, fetchMemosByUser, fetchBookmarkedMemos,
  fetchComments, getUserLikes, getUserBookmarks, toggleLike, toggleBookmark,
  createComment, toggleFollow, isFollowing,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";
import MemoCard from "@/components/memo/MemoCard";

export default function ProfilePage() {
  const { username: paramUsername } = useParams();
  const router = useRouter();
  const { user, profile: myProfile, signOut, refreshProfile } = useAuth();
  const { showToast } = useToast();

  // 로그인 안 한 경우 로그인 페이지로
  useEffect(() => {
    if (!user && paramUsername === "me") router.push("/login");
  }, [user, paramUsername, router]);

  // 현재 보고 있는 프로필 (내 것 or 다른 사용자)
  const [viewProfile, setViewProfile] = useState<any>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // Profile state (editable - 내 프로필일 때만)
  const [displayName, setDisplayName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [bio, setBio] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [activeTab, setActiveTab] = useState<"memos" | "bookmarks">("memos");
  const [myMemos, setMyMemos] = useState<any[]>([]);
  const [bookmarkedMemos, setBookmarkedMemos] = useState<any[]>([]);
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const [userBookmarks, setUserBookmarks] = useState<Set<string>>(new Set());
  const [memosLoading, setMemosLoading] = useState(false);

  // 프로필 로드 (me이거나 본인 username이면 내 프로필, 아니면 다른 유저)
  useEffect(() => {
    const loadProfile = async () => {
      const uname = paramUsername as string;

      if (uname === "me" || (myProfile && uname === myProfile.username)) {
        // 내 프로필
        setIsOwnProfile(true);
        setViewProfile(myProfile);
        if (myProfile) {
          setDisplayName(myProfile.display_name || "");
          setEditUsername(myProfile.username || "");
          setBio(myProfile.bio || "");
        }
      } else {
        // 다른 유저 프로필
        setIsOwnProfile(false);
        const otherProfile = await getProfile(uname);
        setViewProfile(otherProfile);

        // 팔로우 상태 확인
        if (user && otherProfile) {
          const isFollow = await isFollowing(user.id, otherProfile.id);
          setFollowing(isFollow);
        }
      }
    };
    loadProfile();
  }, [paramUsername, myProfile, user]);

  // 팔로우 카운트 로드
  useEffect(() => {
    if (viewProfile) {
      getFollowCounts(viewProfile.id).then(setFollowCounts);
    }
  }, [viewProfile]);

  // 메모 / 북마크 로드
  const loadProfileMemos = useCallback(async () => {
    if (!viewProfile) return;
    setMemosLoading(true);

    const targetUserId = viewProfile.id;

    const rawMemosPromise = fetchMemosByUser(targetUserId);
    const rawBookmarkedPromise = isOwnProfile && user ? fetchBookmarkedMemos(user.id) : Promise.resolve([]);
    const likesPromise = user ? getUserLikes(user.id) : Promise.resolve(new Set<string>());
    const bookmarksPromise = user ? getUserBookmarks(user.id) : Promise.resolve(new Set<string>());

    const [rawMemos, rawBookmarked, likes, bookmarks] = await Promise.all([
      rawMemosPromise, rawBookmarkedPromise, likesPromise, bookmarksPromise,
    ]);
    setUserLikes(likes as Set<string>);
    setUserBookmarks(bookmarks as Set<string>);

    const mapMemos = async (rawList: any[]) => {
      return Promise.all(rawList.map(async (m: any) => {
        const p = m.profiles || {};
        const commentsRaw = await fetchComments(m.id);
        const { count: likeCount } = await supabase
          .from("likes")
          .select("*", { count: "exact", head: true })
          .eq("memo_id", m.id);
        return {
          id: m.id,
          author: {
            username: p.username || null,
            displayName: p.display_name || null,
            image: p.avatar_url || null,
          },
          pinPrice: m.pin_price || 0,
          pinTimestamp: m.pin_timestamp || new Date(m.created_at).getTime(),
          content: m.content,
          sentiment: m.sentiment || "NEUTRAL",
          likeCount: likeCount || 0,
          commentCount: commentsRaw.length,
          liked: (likes as Set<string>).has(m.id),
          bookmarked: (bookmarks as Set<string>).has(m.id),
          comments: commentsRaw.map((c: any) => ({
            author: {
              username: c.profiles?.username || null,
              displayName: c.profiles?.display_name || null,
              image: c.profiles?.avatar_url || null,
            },
            content: c.content,
          })),
        };
      }));
    };

    const [memos, bkMemos] = await Promise.all([mapMemos(rawMemos), mapMemos(rawBookmarked)]);
    setMyMemos(memos);
    setBookmarkedMemos(bkMemos);
    setMemosLoading(false);
  }, [viewProfile, isOwnProfile, user]);

  useEffect(() => {
    if (viewProfile) loadProfileMemos();
  }, [viewProfile, loadProfileMemos]);

  // ─── Handlers ───

  const handleFollow = async () => {
    if (!user || !viewProfile) return;
    setFollowLoading(true);
    const result = await toggleFollow(user.id, viewProfile.id);
    setFollowing(result);
    showToast(result ? `@${viewProfile.username}님을 팔로우합니다` : `@${viewProfile.username}님을 언팔로우했어요`, result ? "success" : "info");
    // 카운트 갱신
    const counts = await getFollowCounts(viewProfile.id);
    setFollowCounts(counts);
    setFollowLoading(false);
  };

  const handleLike = async (id: string) => {
    if (!user) { router.push("/login"); return; }
    const liked = await toggleLike(user.id, id);
    showToast(liked ? "좋아요를 눌렀어요" : "좋아요를 취소했어요", liked ? "like" : "unlike");
    setUserLikes((prev) => { const next = new Set(prev); if (liked) next.add(id); else next.delete(id); return next; });
    const updateList = (list: any[]) => list.map((m: any) => m.id === id ? { ...m, liked, likeCount: liked ? m.likeCount + 1 : m.likeCount - 1 } : m);
    setMyMemos(updateList);
    setBookmarkedMemos(updateList);
  };

  const handleBookmark = async (id: string) => {
    if (!user) { router.push("/login"); return; }
    const bookmarked = await toggleBookmark(user.id, id);
    showToast(bookmarked ? "북마크에 저장했어요" : "북마크를 해제했어요", bookmarked ? "bookmark" : "unbookmark");
    setUserBookmarks((prev) => { const next = new Set(prev); if (bookmarked) next.add(id); else next.delete(id); return next; });
    const updateList = (list: any[]) => list.map((m: any) => m.id === id ? { ...m, bookmarked } : m);
    setMyMemos(updateList);
    setBookmarkedMemos(updateList);
  };

  const handleComment = async (id: string, text: string) => {
    if (!user) { router.push("/login"); return; }
    const result = await createComment(user.id, id, text);
    if (result) {
      showToast("댓글을 작성했어요", "comment");
      loadProfileMemos();
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    await updateProfile(user.id, {
      username: editUsername,
      display_name: displayName,
      bio,
    });
    await refreshProfile();
    setSaving(false);
    setEditing(false);
    showToast("프로필을 저장했어요", "success");
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  // 로딩 상태
  if (!viewProfile) {
    return (
      <main className="max-w-[640px] mx-auto px-4 md:px-8 pt-6">
        <div className="flex items-center justify-center h-[300px] gap-2 text-zinc-500 text-sm">
          <div className="w-4 h-4 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
          프로필 불러오는 중...
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-[640px] mx-auto px-4 md:px-8 pt-6">
      {/* Profile header */}
      <div className="bg-surface border border-white/[0.06] rounded-2xl p-5 mb-5">
        {!editing ? (
          /* View mode */
          <div>
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center text-2xl font-bold text-accent shrink-0">
                {viewProfile.avatar_url ? (
                  <img src={viewProfile.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  (viewProfile.display_name || viewProfile.username || "?")[0].toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h1 className="text-lg font-extrabold truncate">{viewProfile.display_name || viewProfile.username}</h1>
                </div>
                <div className="text-sm text-zinc-500 mb-2">@{viewProfile.username}</div>
                {viewProfile.bio && <p className="text-sm text-zinc-400 mb-3 leading-relaxed">{viewProfile.bio}</p>}

                {/* Stats */}
                <div className="flex gap-5 text-xs mb-3">
                  <span><strong className="text-zinc-200 font-semibold">{myMemos.length}</strong> <span className="text-zinc-500">메모</span></span>
                  <span><strong className="text-zinc-200 font-semibold">{followCounts.followers}</strong> <span className="text-zinc-500">팔로워</span></span>
                  <span><strong className="text-zinc-200 font-semibold">{followCounts.following}</strong> <span className="text-zinc-500">팔로잉</span></span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {isOwnProfile ? (
                    <button
                      onClick={() => setEditing(true)}
                      className="flex items-center gap-1.5 text-xs text-zinc-400 border border-white/[0.06] rounded-lg px-3 py-1.5 hover:bg-surface-2 hover:text-zinc-200 transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      프로필 수정
                    </button>
                  ) : (
                    <button
                      onClick={handleFollow}
                      disabled={followLoading}
                      className={`flex items-center gap-1.5 text-xs font-semibold rounded-lg px-4 py-2 transition-all ${
                        following
                          ? "bg-surface-2 border border-white/10 text-zinc-300 hover:border-red-400/30 hover:text-red-400"
                          : "bg-accent text-black hover:brightness-110"
                      }`}
                    >
                      {following ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                      {followLoading ? "..." : following ? "팔로잉" : "팔로우"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Edit mode */
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">프로필 수정</h2>
              <button onClick={() => setEditing(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-surface-2 hover:text-zinc-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center text-2xl font-bold text-accent shrink-0">
                {(displayName || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">닉네임</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">@</span>
                    <input type="text" value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                      className="w-full bg-bg border border-white/[0.06] rounded-xl pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:border-accent/50 transition-colors" maxLength={20} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">표시 이름</label>
                  <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-bg border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent/50 transition-colors" maxLength={30} />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">자기소개</label>
                  <textarea value={bio} onChange={(e) => setBio(e.target.value)}
                    className="w-full bg-bg border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent/50 transition-colors resize-none h-20"
                    placeholder="투자 스타일이나 관심 분야를 소개해주세요" maxLength={160} />
                  <div className="text-right text-[11px] text-zinc-600 mt-1">{bio.length}/160</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl border border-white/10 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">취소</button>
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1.5 bg-accent text-black rounded-xl px-5 py-2 text-sm font-bold disabled:opacity-60 transition-all hover:brightness-110">
                    <Check className="w-3.5 h-3.5" />
                    {saving ? "저장 중..." : "저장"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-0.5 bg-surface border border-white/[0.06] rounded-xl p-1 w-fit">
          <button onClick={() => setActiveTab("memos")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
              activeTab === "memos" ? "bg-accent text-black font-semibold" : "text-zinc-500 hover:text-zinc-300 hover:bg-surface-2"
            }`}>
            <FileText className="w-3.5 h-3.5" />
            메모
            {myMemos.length > 0 && <span className={`text-[11px] ${activeTab === "memos" ? "text-black/60" : "text-zinc-600"}`}>{myMemos.length}</span>}
          </button>
          {isOwnProfile && (
            <button onClick={() => setActiveTab("bookmarks")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                activeTab === "bookmarks" ? "bg-accent text-black font-semibold" : "text-zinc-500 hover:text-zinc-300 hover:bg-surface-2"
              }`}>
              <BookmarkIcon className="w-3.5 h-3.5" />
              북마크
              {bookmarkedMemos.length > 0 && <span className={`text-[11px] ${activeTab === "bookmarks" ? "text-black/60" : "text-zinc-600"}`}>{bookmarkedMemos.length}</span>}
            </button>
          )}
        </div>

        {isOwnProfile && (
          <button onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-2">
            <LogOut className="w-3.5 h-3.5" />
            로그아웃
          </button>
        )}
      </div>

      {/* Content */}
      {memosLoading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-sm text-zinc-400">
          <div className="w-4 h-4 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
          불러오는 중...
        </div>
      ) : (activeTab === "memos" ? myMemos : bookmarkedMemos).length === 0 ? (
        <div className="bg-gradient-to-b from-surface to-transparent border border-dashed border-white/10 rounded-2xl py-12 px-6 text-center">
          <div className="text-4xl mb-3">{activeTab === "memos" ? "📝" : "🔖"}</div>
          <div className="text-base font-bold mb-2">
            {activeTab === "memos"
              ? (isOwnProfile ? "아직 작성한 메모가 없어요" : `@${viewProfile.username}님의 메모가 없어요`)
              : "아직 저장한 북마크가 없어요"}
          </div>
          <div className="text-sm text-zinc-500 mb-5">
            {activeTab === "memos"
              ? (isOwnProfile ? "홈에서 차트를 분석하고 첫 인사이트를 핀해보세요" : "아직 이 유저가 메모를 작성하지 않았어요")
              : "추천 피드에서 마음에 드는 메모를 북마크해보세요"}
          </div>
          {isOwnProfile && (
            <button onClick={() => router.push(activeTab === "memos" ? "/" : "/explore")}
              className="inline-flex items-center gap-2 bg-accent text-black font-bold text-sm px-5 py-2.5 rounded-xl hover:brightness-110 transition-all">
              {activeTab === "memos" ? "차트 보러 가기" : "피드 둘러보기"}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {(activeTab === "memos" ? myMemos : bookmarkedMemos).map((m: any) => (
            <MemoCard key={m.id} memo={m} onLike={handleLike} onBookmark={handleBookmark} onComment={handleComment} />
          ))}
        </div>
      )}
    </main>
  );
}
