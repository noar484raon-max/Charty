"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { signInWithGoogle, signInWithKakao, signInWithEmail, signUpWithEmail, user } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 이미 로그인된 경우 홈으로
  useEffect(() => {
    if (user) router.push("/");
  }, [user, router]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "signup") {
      if (!username.trim()) { setError("사용자명을 입력해주세요"); setLoading(false); return; }
      const { error: err } = await signUpWithEmail(email, password, username);
      if (err) setError(err.message);
      else setError("이메일을 확인해주세요! 인증 링크를 보냈습니다.");
    } else {
      const { error: err } = await signInWithEmail(email, password);
      if (err) setError(err.message === "Invalid login credentials" ? "이메일 또는 비밀번호가 올바르지 않습니다" : err.message);
      else router.push("/");
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight mb-2">
            Chart<span className="text-accent">y</span>
          </h1>
          <p className="text-sm text-zinc-500">차트 위에 인사이트를 핀하세요</p>
        </div>

        {/* Social Login */}
        <div className="space-y-2.5 mb-5">
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white text-black rounded-xl px-4 py-3 text-sm font-semibold hover:bg-zinc-100 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google로 계속하기
          </button>

          <button
            onClick={signInWithKakao}
            className="w-full flex items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors"
            style={{ backgroundColor: "#FEE500", color: "#191919" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#191919">
              <path d="M12 3C6.48 3 2 6.36 2 10.44c0 2.62 1.75 4.93 4.37 6.24l-1.12 4.16c-.1.36.32.65.64.44l4.96-3.26c.37.04.75.06 1.15.06 5.52 0 10-3.36 10-7.64C22 6.36 17.52 3 12 3z" />
            </svg>
            카카오로 계속하기
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="text-[11px] text-zinc-600 uppercase">또는</span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailAuth} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="사용자명"
              className="w-full bg-surface border border-white/[0.06] rounded-xl px-4 py-3 text-sm outline-none focus:border-accent/50 transition-colors placeholder:text-zinc-600"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            required
            className="w-full bg-surface border border-white/[0.06] rounded-xl px-4 py-3 text-sm outline-none focus:border-accent/50 transition-colors placeholder:text-zinc-600"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            required
            minLength={6}
            className="w-full bg-surface border border-white/[0.06] rounded-xl px-4 py-3 text-sm outline-none focus:border-accent/50 transition-colors placeholder:text-zinc-600"
          />

          {error && (
            <div className={`text-xs px-3 py-2 rounded-lg ${
              error.includes("이메일을 확인") ? "bg-accent/10 text-accent" : "bg-red-500/10 text-red-400"
            }`}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-black rounded-xl px-4 py-3 text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50"
          >
            {loading ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>

        {/* Toggle mode */}
        <div className="text-center mt-4">
          <button
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
            className="text-xs text-zinc-500 hover:text-accent transition-colors"
          >
            {mode === "login" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
          </button>
        </div>
      </div>
    </main>
  );
}
