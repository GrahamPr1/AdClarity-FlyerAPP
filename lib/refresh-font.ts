import { DM_Sans } from "next/font/google"

// The refresh design's DM Sans (400-700, its own font-family name). The root
// layout's DM Sans ships 400/500 only; adding weights there would change how
// NOP renders its bold text, so the new design loads its own.
export const rfSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-rf-sans", display: "swap" })
