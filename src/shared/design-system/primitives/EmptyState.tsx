"use client";
import { cn } from "../cn";

/* SVG illustrations — flat, traço fino, acento da marca */
const illustrations = {
  clients: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="28" r="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 68c0-15.464 12.536-28 28-28s28 12.536 28 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="40" cy="28" r="6" fill="currentColor" fillOpacity="0.12" />
    </svg>
  ),
  products: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="28" width="56" height="38" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M12 38h56" stroke="currentColor" strokeWidth="2" />
      <path d="M28 28V18a12 12 0 0 1 24 0v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="40" cy="50" r="5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  funnel: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 16h52l-20 26v18l-12-6V42L14 16z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 16h52" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="28" y="44" width="24" height="16" rx="3" fill="currentColor" fillOpacity="0.1" />
    </svg>
  ),
  inbox: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="18" width="60" height="44" rx="6" stroke="currentColor" strokeWidth="2" />
      <path d="M10 28l30 20 30-20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="58" cy="24" r="8" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
      <path d="M55 24h6M58 21v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  reports: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="12" width="36" height="56" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M20 28h20M20 36h20M20 44h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="42" y="40" width="28" height="28" rx="4" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="2" />
      <path d="M48 56l6-8 6 5 6-9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  generic: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="26" stroke="currentColor" strokeWidth="2" />
      <path d="M40 28v14l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="40" cy="40" r="10" fill="currentColor" fillOpacity="0.1" />
    </svg>
  ),
  alerts: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M40 14l28 48H12L40 14z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M40 34v12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="40" cy="52" r="1.5" fill="currentColor" />
    </svg>
  ),
} as const;

export type IllustrationType = keyof typeof illustrations;

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  illustration?: IllustrationType;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  illustration = "generic",
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-4 text-center", className)}>
      <div className="mb-5 text-muted-foreground/40">
        {illustrations[illustration]}
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
