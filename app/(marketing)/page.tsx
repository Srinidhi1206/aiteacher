import { Navbar } from "@/components/marketing/navbar";
import { Hero } from "@/components/marketing/hero";
import { Features } from "@/components/marketing/features";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { AIDemo } from "@/components/marketing/ai-demo";
import { Testimonials } from "@/components/marketing/testimonials";
import { LearningJourney } from "@/components/marketing/learning-journey";
import { Pricing } from "@/components/marketing/pricing";
import { FAQ } from "@/components/marketing/faq";
import { Footer } from "@/components/marketing/footer";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <AIDemo />
      <Testimonials />
      <LearningJourney />
      <Pricing />
      <FAQ />
      <Footer />
    </>
  );
}
