"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, MessageCircle, Share2, Bookmark, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatPrice, formatDate, timeAgo, cn } from "@/lib/utils";

type MemoData = {
  id: string;
  author: { username: string | null; displayName: string | null; image: string | null };
  pinPrice: number;
  pinTimestamp: number; // unix ms
  content: string;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  likeCount: number;
  commentCount: number;
  liked: boolean;
  bookmarked: boolean;
  comments: Array<{
    author: { username: string | null; displayName: string | null; image: string | null };
    content: string;
  }>;
};

interface MemoCardProps {
  memo: MemoData;
  onLike?: (id: string) => void;
  onBookmark?: (id: string) => void;
  onComment?: (id: string, text: string) => void;
  onShare?: (id: string) => void;
}

const sentimentConfig = {
  BULLISH: { label: "매수 의견", icon: TrendingUp, className: "text-up bg-up/10" },
  BEARISH: { label: "매도 의견", icon: TrendingDown, className: "text-down bg-down/10" },
  NEUTRAL: { label: "중립", icon: Minus, className: "text-zinc-400 bg-zinc-800" },
};

function getInitials(name: string | null): string {
  if (!name) return "??";
  return name
    .split(/[_\s]/)
    .map((w) => w[0]?.toUpperCase())
    .join("")
    .slice(0, 2);
}

export default function MemoCard({ memo, onLike, onBookmark, onComment, onShare }: MemoCardProps) {
  const router = useRouter();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");

  const displayName = memo.author.displayName || memo.author.username || "anonymous";
  const initials = getInitials(displayName);
  const sentiment = sentimentConfig[memo.sentiment];
  const SentimentIcon = sentiment.icon;

  const handleSubmitComment = () => {
    if (!commentText.trim()) return;
    onComment?.(memo.id, commentText.trim());
    setCommentText("");
  };

  return (
    <div className="bg-surface border border-white/[0.06] rounded-2xl p-4 transition-colors hover:border-white/10 mb-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-accent/10 text-accent text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          {memo.author.image ? (
            <img src={memo.author.image} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => memo.author.username && router.push(`/profile/${memo.author.username}`)}
            className="text-[13px] font-semibold truncate hover:text-accent transition-colors text-left"
          >
            {displayName}
          </button>
          <div className="text-[11px] text-zinc-500">{timeAgo(memo.pinTimestamp)}</div>
        </div>
        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1", sentiment.className)}>
          <SentimentIcon className="w-3 h-3" />
          {sentiment.label}
        </span>
      </div>

      {/* Pin context */}
      <div className="inline-block font-mono text-[11px] text-zinc-400 bg-surface-2 px-2.5 py-1 rounded-md mb-2">
        📌 {formatPrice(memo.pinPrice)} · {formatDate(memo.pinTimestamp)}
      </div>

      {/* Content */}
      <p className="text-sm leading-relaxed mb-3">{memo.content}</p>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onLike?.(memo.id)}
          className={cn(
            "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors",
            memo.liked ? "text-down" : "text-zinc-400 hover:bg-surface-2 hover:text-zinc-300"
          )}
        >
          <Heart className="w-3.5 h-3.5" fill={memo.liked ? "currentColor" : "none"} />
          {memo.likeCount}
        </button>
        <button
          onClick={() => setShowComments(!showComments)}
          className={cn(
            "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors",
            showComments ? "text-accent" : "text-zinc-400 hover:bg-surface-2 hover:text-zinc-300"
          )}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {memo.commentCount || ""}
        </button>
        <button
          onClick={() => onShare?.(memo.id)}
          className="flex items-center gap-1.5 text-xs text-zinc-400 px-2.5 py-1.5 rounded-md hover:bg-surface-2 hover:text-zinc-300 transition-colors"
        >
          <Share2 className="w-3.5 h-3.5" />
          공유
        </button>
        <button
          onClick={() => onBookmark?.(memo.id)}
          className={cn(
            "ml-auto flex items-center text-xs px-2.5 py-1.5 rounded-md transition-colors",
            memo.bookmarked ? "text-accent" : "text-zinc-400 hover:bg-surface-2 hover:text-zinc-300"
          )}
        >
          <Bookmark className="w-3.5 h-3.5" fill={memo.bookmarked ? "currentColor" : "none"} />
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          {memo.comments.map((c, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {getInitials(c.author.displayName || c.author.username)}
              </div>
              <div>
                <div className="text-[12px] font-semibold text-zinc-400">{c.author.displayName || c.author.username}</div>
                <div className="text-[13px] leading-snug">{c.content}</div>
              </div>
            </div>
          ))}
          <div className="flex gap-1.5 mt-2">
            <input
              className="flex-1 bg-surface-2 border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-accent"
              placeholder="댓글 달기..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmitComment()}
            />
            <button
              onClick={handleSubmitComment}
              className="bg-surface-3 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:bg-accent hover:text-black hover:border-accent transition-colors"
            >
              등록
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
