// One shared loading treatment for every screen that waits on something
// real (a scrape, a generation, a data fetch) — same spinner, same
// reassuring copy tone, so the app doesn't read as stitched together from
// screens that each invented their own "loading" pattern.
export function LoadingSpinner({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-8 h-8 rounded-full border-2 border-border border-t-[var(--brand-teal-bright)] animate-spin" />
      <p className="mt-4 text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
