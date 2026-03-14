import { supabase } from "./supabase";

// ─── 메모 ───

export async function fetchMemos(assetSymbol?: string) {
  let query = supabase
    .from("memos")
    .select(`
      id,
      asset_symbol,
      asset_type,
      content,
      sentiment,
      pin_price,
      pin_timestamp,
      created_at,
      user_id,
      profiles!memos_user_id_fkey (username, display_name, avatar_url)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (assetSymbol) {
    query = query.eq("asset_symbol", assetSymbol);
  }

  const { data, error } = await query;
  if (error) { console.error("fetchMemos error:", error.message, error.details); return []; }
  return data || [];
}

export async function fetchMemosByUser(userId: string) {
  const { data, error } = await supabase
    .from("memos")
    .select(`
      id,
      asset_symbol,
      asset_type,
      content,
      sentiment,
      pin_price,
      pin_timestamp,
      created_at,
      user_id,
      profiles!memos_user_id_fkey (username, display_name, avatar_url)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) { console.error("fetchMemosByUser error:", error.message); return []; }
  return data || [];
}

export async function createMemo(params: {
  userId: string;
  assetSymbol: string;
  assetType: string;
  content: string;
  sentiment: string;
  pinPrice: number;
  pinTimestamp: number;
}) {
  const { data, error } = await supabase
    .from("memos")
    .insert({
      user_id: params.userId,
      asset_symbol: params.assetSymbol,
      asset_type: params.assetType,
      content: params.content,
      sentiment: params.sentiment,
      pin_price: params.pinPrice,
      pin_timestamp: params.pinTimestamp,
    })
    .select()
    .single();

  if (error) { console.error("createMemo error:", error.message, error.details); return null; }
  return data;
}

export async function deleteMemo(memoId: string) {
  const { error } = await supabase.from("memos").delete().eq("id", memoId);
  return !error;
}

// ─── 좋아요 ───

export async function toggleLike(userId: string, memoId: string): Promise<boolean> {
  // 세션 확인
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error("toggleLike: No active session! User needs to re-login.");
    return false;
  }

  const { data: existing, error: selectErr } = await supabase
    .from("likes")
    .select("id")
    .eq("user_id", userId)
    .eq("memo_id", memoId)
    .maybeSingle();

  if (selectErr) {
    console.error("toggleLike SELECT error:", selectErr.message, selectErr.code, selectErr.details);
    return false;
  }

  if (existing) {
    const { error } = await supabase.from("likes").delete().eq("id", existing.id);
    if (error) { console.error("unlike error:", error.message, error.code, error.details, error.hint); return true; }
    return false;
  } else {
    const { data, error } = await supabase.from("likes").insert({ user_id: userId, memo_id: memoId }).select();
    if (error) { console.error("like INSERT error:", error.message, error.code, error.details, error.hint); return false; }
    console.log("like INSERT success:", data);
    return true;
  }
}

export async function getUserLikes(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("likes")
    .select("memo_id")
    .eq("user_id", userId);
  if (error) console.error("getUserLikes error:", error.message);
  return new Set((data || []).map((d: any) => d.memo_id));
}

// ─── 북마크 ───

export async function toggleBookmark(userId: string, memoId: string): Promise<boolean> {
  // 세션 확인
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error("toggleBookmark: No active session! User needs to re-login.");
    return false;
  }

  const { data: existing, error: selectErr } = await supabase
    .from("bookmarks")
    .select("id")
    .eq("user_id", userId)
    .eq("memo_id", memoId)
    .maybeSingle();

  if (selectErr) {
    console.error("toggleBookmark SELECT error:", selectErr.message, selectErr.code, selectErr.details);
    return false;
  }

  if (existing) {
    const { error } = await supabase.from("bookmarks").delete().eq("id", existing.id);
    if (error) { console.error("unbookmark error:", error.message, error.code, error.details, error.hint); return true; }
    return false;
  } else {
    const { data, error } = await supabase.from("bookmarks").insert({ user_id: userId, memo_id: memoId }).select();
    if (error) { console.error("bookmark INSERT error:", error.message, error.code, error.details, error.hint); return false; }
    console.log("bookmark INSERT success:", data);
    return true;
  }
}

export async function getUserBookmarks(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("bookmarks")
    .select("memo_id")
    .eq("user_id", userId);
  if (error) console.error("getUserBookmarks error:", error.message);
  return new Set((data || []).map((d: any) => d.memo_id));
}

export async function fetchBookmarkedMemos(userId: string) {
  // 먼저 북마크된 memo_id 목록을 가져옴
  const { data: bookmarks, error: bErr } = await supabase
    .from("bookmarks")
    .select("memo_id")
    .eq("user_id", userId);

  if (bErr || !bookmarks?.length) return [];

  const memoIds = bookmarks.map((b: any) => b.memo_id);

  const { data, error } = await supabase
    .from("memos")
    .select(`
      id,
      asset_symbol,
      asset_type,
      content,
      sentiment,
      pin_price,
      pin_timestamp,
      created_at,
      user_id,
      profiles!memos_user_id_fkey (username, display_name, avatar_url)
    `)
    .in("id", memoIds)
    .order("created_at", { ascending: false });

  if (error) { console.error("fetchBookmarkedMemos error:", error.message); return []; }
  return data || [];
}

// ─── 댓글 ───

export async function fetchComments(memoId: string) {
  const { data, error } = await supabase
    .from("comments")
    .select(`
      id,
      content,
      created_at,
      user_id,
      profiles!comments_user_id_fkey (username, display_name, avatar_url)
    `)
    .eq("memo_id", memoId)
    .order("created_at", { ascending: true });

  if (error) { console.error("fetchComments error:", error.message); return []; }
  return data || [];
}

export async function createComment(userId: string, memoId: string, content: string) {
  const { data, error } = await supabase
    .from("comments")
    .insert({ user_id: userId, memo_id: memoId, content })
    .select()
    .single();

  if (error) { console.error("createComment error:", error.message); return null; }
  return data;
}

// ─── 좋아요/댓글 카운트 ───

export async function getMemoCounts(memoId: string) {
  const { count: likeCount } = await supabase
    .from("likes")
    .select("*", { count: "exact", head: true })
    .eq("memo_id", memoId);

  const { count: commentCount } = await supabase
    .from("comments")
    .select("*", { count: "exact", head: true })
    .eq("memo_id", memoId);

  return { likeCount: likeCount || 0, commentCount: commentCount || 0 };
}

// ─── 프로필 ───

export async function updateProfile(userId: string, updates: {
  username?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
}) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();

  if (error) { console.error("updateProfile error:", error.message); return null; }
  return data;
}

export async function getProfile(username: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (error) return null;
  return data;
}

// ─── 팔로우 ───

export async function toggleFollow(followerId: string, followingId: string) {
  const { data: existing } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();

  if (existing) {
    await supabase.from("follows").delete().eq("id", existing.id);
    return false;
  } else {
    await supabase.from("follows").insert({ follower_id: followerId, following_id: followingId });
    return true;
  }
}

export async function getFollowCounts(userId: string) {
  const { count: followers } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", userId);

  const { count: following } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", userId);

  return { followers: followers || 0, following: following || 0 };
}

export async function isFollowing(followerId: string, followingId: string) {
  const { data } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();
  return !!data;
}

// 팔로우 중인 유저들의 메모 가져오기
export async function fetchFollowingMemos(userId: string) {
  // 팔로우 목록
  const { data: follows } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  if (!follows?.length) return [];

  const followingIds = follows.map((f: any) => f.following_id);

  const { data, error } = await supabase
    .from("memos")
    .select(`
      id, asset_symbol, asset_type, content, sentiment, pin_price, pin_timestamp, created_at, user_id,
      profiles!memos_user_id_fkey (username, display_name, avatar_url)
    `)
    .in("user_id", followingIds)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) { console.error("fetchFollowingMemos error:", error.message); return []; }
  return data || [];
}

// 인기 메모 가져오기 (좋아요 수 기준)
export async function fetchPopularMemos() {
  // 최근 7일 메모 중 좋아요 많은 순
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("memos")
    .select(`
      id, asset_symbol, asset_type, content, sentiment, pin_price, pin_timestamp, created_at, user_id,
      profiles!memos_user_id_fkey (username, display_name, avatar_url)
    `)
    .gte("created_at", weekAgo)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) { console.error("fetchPopularMemos error:", error.message); return []; }
  return data || [];
}

// 모든 유저 검색
export async function searchUsers(query: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio")
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(10);

  if (error) { console.error("searchUsers error:", error.message); return []; }
  return data || [];
}
