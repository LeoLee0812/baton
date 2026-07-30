"use client";

// 空态与加载态。AC-7.2.6：五个页面数据为空时都必须有明确提示，⛔ 不许白屏。
// AC-7.3.2：列表加载中必须显示骨架屏。

import { Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      data-testid="empty-state"
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center"
    >
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div data-testid="loading-skeleton" className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}
