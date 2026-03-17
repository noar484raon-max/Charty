import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import AuthProvider from "@/components/providers/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Pulsify — 글로벌 시장의 맥박을 읽다",
  description: "글로벌 뉴스 감성 분석, 기업 실적 리포트, 차트 인사이트를 한눈에 보는 투자 플랫폼",
  openGraph: {
    title: "Pulsify",
    description: "글로벌 시장의 맥박을 읽다",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <AuthProvider>
          <ToastProvider>
            <Sidebar />
            <div className="md:ml-[72px] pb-20 md:pb-0">
              {children}
            </div>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
