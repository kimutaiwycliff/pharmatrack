import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { POSTS, getPost } from "@/lib/blog/posts"

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
    dateModified: post.date,
    author: { "@type": "Organization", name: "PharmaTrack", url: SITE_URL },
    publisher: { "@type": "Organization", name: "PharmaTrack", logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.svg` } },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/blog/${post.slug}` },
    keywords: post.keywords.join(", "),
  }

  return (
    <article className="mx-auto max-w-2xl px-5 py-14 md:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-[var(--pt-text-secondary)] hover:text-[var(--pt-green-600)] mb-6">
        <ArrowLeft size={15} /> All articles
      </Link>
      <p className="text-xs text-[var(--pt-text-tertiary)]">{fmt(post.date)} · {post.readingMins} min read</p>
      <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight mt-2 leading-[1.1]">
        {post.title}
      </h1>
      <div className="mt-8 text-[var(--pt-text)] text-[17px] [&_h2]:font-[family-name:var(--font-display)] [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-9 [&_h2]:mb-1 [&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-[var(--pt-text-secondary)] [&_ul]:mt-4 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_li]:text-[var(--pt-text-secondary)] [&_a]:text-[var(--pt-green-600)] [&_a]:font-medium [&_a]:underline [&_strong]:text-[var(--pt-text)] [&_em]:italic">
        {post.body}
      </div>

      <div className="mt-12 rounded-2xl border border-[var(--pt-green-100)] bg-[var(--pt-green-50)] p-6 text-center">
        <p className="font-[family-name:var(--font-display)] text-lg font-bold">Run your whole pharmacy in one place.</p>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-1">Offline POS, M-Pesa, inventory and PPB compliance.</p>
        <Link href="/signup" className="inline-flex items-center justify-center mt-4 h-11 px-6 rounded-xl bg-[var(--pt-green)] text-white font-semibold text-sm hover:bg-[var(--pt-green-600)] transition-colors">
          Start a free 14-day trial
        </Link>
      </div>
    </article>
  )
}
