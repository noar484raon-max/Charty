import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import AuthProvider from "@/components/providers/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Charty — 차트 위에 인사이트를 핀하세요",
  description: "주식/암호화폐 차트에 메모를 남겨 투자 인사이트를 공유하는 소셜 트레이딩 플랫폼",
  openGraph: {
    title: "Charty",
    description: "차트 위에 인사이트를 핀하세요",
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
