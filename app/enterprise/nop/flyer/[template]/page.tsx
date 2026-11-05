import { permanentRedirect } from "next/navigation"

// Moved into the agent portal. Old links and bookmarks keep working.
export default async function Page({ params }: { params: Promise<{ template: string }> }) {
  const { template } = await params
  permanentRedirect(`/agent/create/${encodeURIComponent(template)}`)
}
