import pagesConfig from "@/config/pages.json";

export default function DashboardLoading() {
  const copy = pagesConfig.system.loading;
  return (
    <div className="space-y-6" role="status" aria-label={copy.ariaLabel}>
      <div className="space-y-2">
        <div className="shimmer h-8 w-56 rounded-lg bg-muted" />
        <div className="shimmer h-4 w-full max-w-md rounded bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="rounded-[1.25rem] border border-border bg-card p-5">
            <div className="shimmer mb-4 h-5 w-32 rounded bg-muted" />
            <div className="space-y-3">
              <div className="shimmer h-4 w-full rounded bg-muted" />
              <div className="shimmer h-4 w-4/5 rounded bg-muted" />
              <div className="shimmer h-4 w-3/5 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">{copy.srText}</span>
    </div>
  );
}
