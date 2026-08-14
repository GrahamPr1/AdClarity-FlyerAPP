"use client"

// A plain `tel:` anchor navigates on its own with no JS required — the
// click handler here only fires the tracking beacon alongside it, and
// never calls preventDefault, so the call still goes through even if the
// fetch fails or is slow.
export function RedeemButton({ code, phone, label }: { code: string; phone: string; label: string }) {
  function handleClick() {
    fetch(`/api/tracking/click/${code}`, { method: "POST" }).catch(() => {})
  }

  return (
    <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`} onClick={handleClick}
      className="w-full py-3 rounded-xl bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] transition-colors">
      {label}
    </a>
  )
}
