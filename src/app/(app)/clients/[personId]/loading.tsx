/**
 * Perf (owner's navigation-lag fix) — loading boundary for the client
 * workspace. Dynamic routes without loading.tsx give the user no
 * feedback until the whole server render returns; with it, Next.js
 * partially prefetches the shell and swaps in this skeleton the instant
 * a navigation starts. Shapes mirror the real page: breadcrumb, hero
 * (avatar + name + chips), tab strip, three content cards.
 */
export default function Loading() {
  return (
    <div className="space-y-5 p-6" role="status" aria-busy aria-label="Loading candidate profile">
      <div className="h-4 w-56 animate-pulse rounded bg-muted" />
      <div className="flex items-start gap-5">
        <div className="size-20 shrink-0 animate-pulse rounded-full bg-muted" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="h-8 w-72 max-w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
          <div className="flex gap-2">
            <div className="h-6 w-32 animate-pulse rounded-full bg-muted" />
            <div className="h-6 w-40 animate-pulse rounded-full bg-muted" />
            <div className="h-6 w-28 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      </div>
      <div className="flex gap-6 border-b pb-2">
        {['w-20', 'w-14', 'w-32', 'w-36', 'w-28', 'w-16'].map((w) => (
          <div key={w} className={`h-4 ${w} animate-pulse rounded bg-muted`} />
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
    </div>
  );
}
