import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { POSTS } from "@/lib/blog/posts"

export const metadata: Metadata = {
  title: "Blog — Pharmacy software, M-Pesa & compliance in Kenya",
  description:
    "Practical guides for Kenyan pharmacies: choosing POS software, accepting M-Pesa at the till, PPB compliance, inventory and more.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "PharmaTrack Blog — running a Kenyan pharmacy, better",
    description: "Guides on pharmacy POS, M-Pesa, PPB compliance and inventory for Kenyan pharmacies.",
    url: "/blog",
    type: "website",
  },
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })

export default function BlogIndex() {
  const posts = [...POSTS].sort((a, b) => (a.date < b.date ? 1 : -1))
  return (
    <section className="mx-auto max-w-3xl px-5 py-16 md:py-24">
      <header className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--pt-green-600)]">PharmaTrack Blog</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight mt-2">
          Running a Kenyan pharmacy, better.
        </h1>
        <p className="mt-3 text-[var(--pt-text-secondary)] text-lg">
          Practical guides on POS, M-Pesa, PPB compliance and inventory.
        </p>
      </header>

      <div className="space-y-4">
        {posts.map((p) => (
          <Link
            key={p.slug}
            href={`/blog/${p.slug}`}
            className="block rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-surface)] p-6 hover:border-[var(--pt-green)] hover:shadow-lg hover:shadow-[var(--pt-green)]/5 transition-all"
          >
            <p className="text-xs text-[var(--pt-text-tertiary)]">{fmt(p.date)} · {p.readingMins} min read</p>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold mt-1.5">{p.title}</h2>
            <p className="mt-2 text-[var(--pt-text-secondary)]">{p.description}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--pt-green-600)]">
              Read more <ArrowRight size={15} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
