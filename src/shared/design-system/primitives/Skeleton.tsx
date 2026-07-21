"use client";
import { cn } from "../cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-[0.75rem]", className)} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-[1.25rem] bg-card p-5 shadow-[0_2px_16px_rgba(14,15,19,.07)]">
      <Skeleton className="h-3 w-24 mb-4" />
      <Skeleton className="h-7 w-16 mb-2" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0">
      <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-3 w-16" />
    </div>
  );
}
