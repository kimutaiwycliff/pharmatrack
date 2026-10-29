// Shown inside the shell while a back-office page loads (its layout checks
// permissions on the server first). Without it nothing moved after a click on
// a slow connection, and people clicked again.
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-7 w-48 rounded-lg bg-[var(--pt-muted-strong)] mb-2" />
      <div className="h-4 w-32 rounded bg-[var(--pt-muted-strong)] mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[92px] rounded-xl bg-[var(--pt-muted-strong)]" />)}
      </div>
      <div className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] overflow-hidden">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4 px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0">
            <div className="w-9 h-9 rounded-lg bg-[var(--pt-muted-strong)] shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 rounded bg-[var(--pt-muted-strong)] w-48" />
              <div className="h-2.5 rounded bg-[var(--pt-muted-strong)] w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
