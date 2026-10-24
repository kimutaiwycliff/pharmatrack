import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { POSTS, getPost } from "@/lib/blog/posts"
import { STANDARD_TRIAL_DAYS } from "@/lib/launch-offer"

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmatrack.co.ke"

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return {}
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: `/blog/${post.slug}`,
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.description },
  }
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    author: { "@type": "Organization", name: "PharmaTrack", url: SITE_URL },
    publisher: { "@type": "Organization", name: "PharmaTrack", logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.svg` } },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/blog/${post.slug}` },
    keywords: post.keywords.join(", "),
  }
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: `${SITE_URL}/blog/${post.slug}` },
    ],
  }
  // Internal links: other posts, newest first — helps readers and crawlers.
  const related = POSTS.filter((p) => p.slug !== post.slug)
    .sort((a, b) => ((a.updated ?? a.date) < (b.updated ?? b.date) ? 1 : -1))
    .slice(0, 3)

  return (
    <article className="mx-auto max-w-2xl px-5 py-14 md:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs).replace(/</g, "\\u003c") }} />
      <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-[var(--pt-text-secondary)] hover:text-[var(--pt-green-600)] mb-6">
        <ArrowLeft size={15} /> All articles
      </Link>
      <p className="text-xs text-[var(--pt-text-tertiary)]">
        {fmt(post.date)}{post.updated && post.updated !== post.date ? ` · Updated ${fmt(post.updated)}` : ""} · {post.readingMins} min read
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight mt-2 leading-[1.1]">
        {post.title}
      </h1>
      <div className="mt-8 text-[var(--pt-text)] text-[17px] [&_h2]:font-[family-name:var(--font-display)] [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-9 [&_h2]:mb-1 [&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-[var(--pt-text-secondary)] [&_ul]:mt-4 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_li]:text-[var(--pt-text-secondary)] [&_a]:text-[var(--pt-green-600)] [&_a]:font-medium [&_a]:underline [&_strong]:text-[var(--pt-text)] [&_em]:italic">
        {post.body}
      </div>

      <div className="mt-12 rounded-2xl border border-[var(--pt-green-100)] bg-[var(--pt-green-50)] p-6 text-center">
        <p className="font-[family-name:var(--font-display)] text-lg font-bold">Run your whole pharmacy in one place.</p>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-1">Offline till, stock and expiry, M-Pesa and the PPB register — on Android, Windows or the browser.</p>
        <Link href="/signup" className="inline-flex items-center justify-center mt-4 h-11 px-6 rounded-xl bg-[var(--pt-green)] text-white font-semibold text-sm hover:bg-[var(--pt-green-600)] transition-colors">
          Start a free {STANDARD_TRIAL_DAYS}-day trial
        </Link>
      </div>

      {related.length > 0 && (
        <nav aria-label="More articles" className="mt-12">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold">Keep reading</h2>
          <ul className="mt-4 space-y-3">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`/blog/${r.slug}`} className="group flex items-start justify-between gap-3 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] p-4 hover:border-[var(--pt-green)] transition-colors">
                  <span>
                    <span className="block font-semibold text-[var(--pt-text)]">{r.title}</span>
                    <span className="block mt-1 text-sm text-[var(--pt-text-secondary)]">{r.description}</span>
                  </span>
                  <ArrowRight size={16} className="mt-1 shrink-0 text-[var(--pt-green-600)] group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </article>
  )
}
