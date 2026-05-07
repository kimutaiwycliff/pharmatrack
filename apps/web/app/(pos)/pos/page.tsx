export const metadata = { title: "POS Terminal — PharmaTrack" }

export default function PosPage() {
  return (
    <div className="flex h-full items-center justify-center text-[var(--pt-text-secondary)]">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 rounded-2xl bg-[var(--pt-green-50)] flex items-center justify-center mx-auto">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--pt-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        </div>
        <p className="font-semibold text-[var(--pt-text)]">POS Terminal</p>
        <p className="text-sm">Full POS interface coming in Phase 4.</p>
        <p className="text-xs">Shift active — ready to take sales.</p>
      </div>
    </div>
  )
}
