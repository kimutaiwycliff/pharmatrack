import { Hero } from "@/components/marketing/Hero"
import { TrustBar } from "@/components/marketing/TrustBar"
import { ProblemSolution } from "@/components/marketing/ProblemSolution"
import { WhySection } from "@/components/marketing/WhySection"
import { Features } from "@/components/marketing/Features"
import { Comparison } from "@/components/marketing/Comparison"
import { RoiCalculator } from "@/components/marketing/RoiCalculator"
import { Pricing } from "@/components/marketing/Pricing"
import { Faq } from "@/components/marketing/Faq"
import { FinalCta } from "@/components/marketing/FinalCta"
import { Reveal } from "@/components/marketing/Reveal"

export default function LandingPage() {
  return (
    <>
      {/* Hero animates on load; the rest fade up as they scroll into view. */}
      <Hero />
      <Reveal><TrustBar /></Reveal>
      <Reveal><ProblemSolution /></Reveal>
      <Reveal><WhySection /></Reveal>
      <Reveal><Features /></Reveal>
      <Reveal><Comparison /></Reveal>
      <Reveal><RoiCalculator /></Reveal>
      <Reveal><Pricing /></Reveal>
      <Reveal><Faq /></Reveal>
      <Reveal><FinalCta /></Reveal>
    </>
  )
}
