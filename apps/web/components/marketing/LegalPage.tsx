import type { ReactNode } from "react"

// Shared shell for /privacy and /terms — same reading styles as blog posts.
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl px-5 py-14 md:py-20">
      <p className="text-xs text-[var(--pt-text-tertiary)]">Last updated {updated}</p>
      <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight mt-2 leading-[1.1]">{title}</h1>
      <div className="mt-8 text-[16px] [&_h2]:font-[family-name:var(--font-display)] [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-9 [&_h2]:mb-1 [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-[var(--pt-text-secondary)] [&_ul]:mt-3 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_li]:text-[var(--pt-text-secondary)] [&_a]:text-[var(--pt-green-600)] [&_a]:underline [&_strong]:text-[var(--pt-text)]">
        {children}
      </div>
    </article>
  )
}
