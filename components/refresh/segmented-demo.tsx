"use client"

import { useState } from "react"
import { Segmented } from "./segmented"

export function SegmentedDemo() {
  const [v, setV] = useState<"monthly" | "annual">("monthly")
  return (
    <Segmented
      label="Billing period"
      value={v}
      onChange={setV}
      options={[
        { value: "monthly", label: "Monthly" },
        { value: "annual", label: <>Annual <span className={`rf-pill ${v === "annual" ? "rf-tone-solid-amber" : "rf-tone-amber"}`}>Save 20%+</span></> },
      ]}
    />
  )
}
