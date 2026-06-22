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

export default function LandingPage() {
  return (
    <>
      <Hero />
      <TrustBar />
      <ProblemSolution />
      <WhySection />
      <Features />
      <Comparison />
      <RoiCalculator />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  )
}
