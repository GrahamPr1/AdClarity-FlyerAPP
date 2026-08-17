import type { BusinessCategory } from "./types"

// Static starter-prompt content per business_category — solves the
// blank-page problem on the Quick Prompt screen (see components/
// quick-prompt-form.tsx). The spec asks for this to share content with "the
// same template library used in Feature #2 (Real-Estate-Specific Template
// Library)" — that library doesn't exist anywhere in this codebase or in
// any spec built so far, so this is a standalone, real implementation for
// now. If/when a real template library gets built, refactor this to pull
// from it instead of duplicating content.
export const QUICK_PROMPT_STARTERS: Record<BusinessCategory, string[]> = {
  "Real Estate / Wholesaling": [
    "We Buy Houses postcard for homeowners facing foreclosure",
    "Buyer recruitment flyer offering off-market deals",
    "Open house flyer for a Saturday showing, professional tone",
    "Just Sold postcard to send to the neighborhood",
    "Cash offer flyer for distressed or inherited properties",
  ],
  Dental: [
    "New patient special flyer, $50 off first cleaning, warm and welcoming",
    "Teeth whitening promo for the holidays, playful colors",
    "Family dentistry flyer highlighting Saturday appointments",
    "Referral card offering $25 off for existing patients who refer a friend",
  ],
  "Gym/Fitness": [
    "New member promo flyer, no signup fee this month, bold energetic tone",
    "Free trial week flyer for a new gym opening",
    "Personal training package flyer, professional and motivating",
    "Summer body challenge flyer with a 6-week deadline",
  ],
  Contractor: [
    "One-page proposal for a kitchen remodel quote, professional tone",
    "Spring home repair flyer, free estimates, bold colors",
    "Roofing special flyer, storm damage inspection, trustworthy tone",
    "Door hanger for a neighborhood offering 10% off this month",
  ],
  "Restaurant/Cafe": [
    "Flyer for a spring bakery sale, 20% off pastries, playful colors",
    "Grand opening flyer for a new cafe, free coffee first week",
    "Happy hour flyer, half off appetizers, fun and bold",
    "Catering menu one-pager for local businesses",
  ],
  Other: [
    "Grand opening flyer, 20% off first purchase, playful tone",
    "Referral program flyer for existing customers",
    "Seasonal sale flyer, professional and clean",
    "New service announcement flyer for existing customers",
  ],
}
