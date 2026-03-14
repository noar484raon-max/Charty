"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { CheckCircle, XCircle, Bookmark, Heart, MessageCircle, Info } from "lucide-react";

type ToastType = "success" | "error" | "like" | "unlike" | "bookmark" | "unbookmark" | "comment" | "info";

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastContextType = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  like: Heart,
  unlike: Heart,
  bookmark: Bookmark,
  unbookmark: Bookmark,
  comment: MessageCircle,
  info: Info,
};

const COLORS: Record<ToastType, string> = {
  success: "text-green-400",
  error: "text-red-400",
  like: "text-red-400",
  unlike: "text-zinc-400",
  bookmark: "text-accent",
  unbookmark: "text-zinc-400",
  comment: "text-accent",
  info: "text-blue-400",
};

let toastCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type];
          const color = COLORS[toast.type];
          const filled = toast.type === "like" || toast.type === "bookmark";

          return (
            <div
              key={toast.id}
              className="animate-toast-in bg-surface-2 border border-white/10 rounded-xl px-4 py-2.5 shadow-2xl flex items-center gap-2.5 pointer-events-auto"
            >
              <Icon className={`w-4 h-4 ${color} shrink-0`} fill={filled ? "currentColor" : "none"} />
              <span className="text-sm text-zinc-200 whitespace-nowrap">{toast.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
