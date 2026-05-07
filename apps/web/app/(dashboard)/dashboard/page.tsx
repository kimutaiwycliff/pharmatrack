export const metadata = { title: "Dashboard — PharmaTrack" }

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1">
          {new Date().toLocaleDateString("en-KE", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Africa/Nairobi",
          })}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Today's Revenue", value: "KSh —" },
          { label: "Transactions", value: "—" },
          { label: "Average Basket", value: "KSh —" },
          { label: "M-Pesa Rate", value: "—%" },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-[var(--pt-border)] p-5">
            <p className="text-xs font-medium text-[var(--pt-text-secondary)] mb-3">{k.label}</p>
            <p className="text-2xl font-bold tracking-tight text-[var(--pt-text)]">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[var(--pt-border)] p-8 text-center text-[var(--pt-text-secondary)]">
        <p className="text-sm">Full dashboard charts coming in Phase 7.</p>
      </div>
    </div>
  )
}
