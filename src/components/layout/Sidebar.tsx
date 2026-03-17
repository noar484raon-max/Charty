"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Globe,
  FileText,
  BarChart3,
  Star,
  MessageCircle,
  User,
  Settings,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";

const NAV_ITEMS = [
  { href: "/", icon: Globe, label: "글로벌 뉴스" },
  { href: "/reports", icon: FileText, label: "기업 리포트" },
  { href: "/chart", icon: BarChart3, label: "차트" },
  { href: "/watchlist", icon: Star, label: "관심종목" },
  { href: "/community", icon: MessageCircle, label: "커뮤니티" },
  { href: "/profile/me", icon: User, label: "프로필", authRequired: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-[72px] flex-col items-center py-6 bg-bg border-r border-white/[0.06] z-50">
        {/* Logo */}
        <Link href="/" className="mb-8 group">
          <div className="text-xl font-extrabold tracking-tight transition-transform group-hover:scale-110">
            P<span className="text-accent">u</span>
          </div>
        </Link>

        {/* Nav Icons */}
        <div className="flex-1 flex flex-col items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            const resolvedHref = (item as any).authRequired && !user ? "/login" : item.href;

            return (
              <Link
                key={item.href}
                href={resolvedHref}
                className={`group relative w-12 h-12 flex items-center justify-center rounded-xl transition-all ${
                  active
                    ? "bg-white/[0.08] text-zinc-100"
                    : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
                }`}
                title={item.label}
              >
                <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.5 : 1.8} />
                <span className="absolute left-full ml-3 px-2.5 py-1 bg-surface-2 border border-white/10 rounded-lg text-xs font-medium text-zinc-300 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Settings at bottom */}
        <Link
          href="/settings"
          className={`group relative w-12 h-12 flex items-center justify-center rounded-xl transition-all ${
            pathname === "/settings"
              ? "bg-white/[0.08] text-zinc-100"
              : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
          }`}
          title="설정"
        >
          <Settings className="w-[22px] h-[22px]" strokeWidth={pathname === "/settings" ? 2.5 : 1.8} />
          <span className="absolute left-full ml-3 px-2.5 py-1 bg-surface-2 border border-white/10 rounded-lg text-xs font-medium text-zinc-300 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap">
            설정
          </span>
        </Link>
      </nav>

      {/* Mobile Bottom Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg/95 backdrop-blur-md border-t border-white/[0.06] z-50 flex items-center justify-around px-2 py-2 safe-area-bottom">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          const resolvedHref = (item as any).authRequired && !user ? "/login" : item.href;

          return (
            <Link
              key={item.href}
              href={resolvedHref}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                active ? "text-zinc-100" : "text-zinc-500"
              }`}
            >
              <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px]">{item.label}</span>
            </Link>
          );
        })}
        <Link
          href="/settings"
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
            pathname === "/settings" ? "text-zinc-100" : "text-zinc-500"
          }`}
        >
          <Settings className="w-[22px] h-[22px]" strokeWidth={pathname === "/settings" ? 2.5 : 1.8} />
          <span className="text-[10px]">설정</span>
        </Link>
      </nav>
    </>
  );
}
