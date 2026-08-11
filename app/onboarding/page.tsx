import { Suspense } from "react"
import { OnboardingForm } from "@/components/onboarding-form"

export const metadata = {
  title: "Onboarding — AdClarity",
}

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-16 md:py-24">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 font-semibold mb-8">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
          AdClarity
        </div>
        <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
          <OnboardingForm />
        </Suspense>
      </div>
    </main>
  )
}
