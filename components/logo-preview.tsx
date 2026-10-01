/**
 * A scraped logo, shown so it is actually visible.
 *
 * Logos come off real websites and a great many of them are white, drawn
 * for a dark header. Rendered straight onto a light card they disappear,
 * and the client sees an empty box next to the word "Logo" — which reads
 * as "the scan failed" at exactly the moment the product is trying to show
 * that it worked. Measured on a real scan of a plumbing company: the mark
 * came through correctly and only the blue part of it was visible.
 *
 * A dark backdrop would just invert the problem for the dark logos. The
 * checkerboard is the standard answer for the same reason image editors
 * use it — it reads as "transparent background" rather than as a colour
 * the logo is supposed to sit on, and nothing disappears against it in
 * either theme.
 */
export function LogoPreview({
  src,
  className = "",
  size = "md",
}: {
  src: string
  className?: string
  size?: "sm" | "md"
}) {
  const h = size === "sm" ? "h-8 max-w-[8rem]" : "h-10 max-w-[10rem]"
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border border-border p-1.5 ${className}`}
      style={{
        // Fixed greys rather than theme tokens: the point is a surface
        // that is neither light nor dark, so it must not follow the theme.
        backgroundColor: "#d4d4d8",
        backgroundImage:
          "linear-gradient(45deg, #a1a1aa 25%, transparent 25%, transparent 75%, #a1a1aa 75%)," +
          "linear-gradient(45deg, #a1a1aa 25%, transparent 25%, transparent 75%, #a1a1aa 75%)",
        backgroundSize: "12px 12px",
        backgroundPosition: "0 0, 6px 6px",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a remote logo on
          an arbitrary client domain can't be in next.config's image allowlist. */}
      <img
        src={src}
        alt=""
        className={`${h} object-contain`}
        onError={(e) => {
          // Hide the whole preview, backdrop included — a checkerboard with
          // nothing on it looks more broken than no preview at all.
          const box = e.currentTarget.parentElement
          if (box) box.style.display = "none"
        }}
      />
    </span>
  )
}
