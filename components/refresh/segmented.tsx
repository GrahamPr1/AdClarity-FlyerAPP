"use client"

// A two-or-more option toggle (the pricing Monthly / Annual switch). Each
// option is a real button with aria-pressed, inside a labelled group.
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="rf-seg">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
