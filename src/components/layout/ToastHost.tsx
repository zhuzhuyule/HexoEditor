import { CheckCircle2, Info, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";

export function ToastHost() {
  const { toasts, dismissToast } = useAppStore();
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-9 right-4 z-50 flex flex-col gap-1.5">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => dismissToast(toast.id)}
          className={cn(
            "pointer-events-auto flex max-w-sm items-center gap-2 rounded-md border px-3 py-2 text-xs shadow-lg cursor-pointer transition-all",
            toast.tone === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : toast.tone === "success"
              ? "border-zinc-200 bg-white text-zinc-800"
              : "border-zinc-200 bg-white text-zinc-700"
          )}
        >
          {toast.tone === "error" ? (
            <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
          ) : toast.tone === "success" ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          ) : (
            <Info className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          )}
          <span className="leading-snug">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
