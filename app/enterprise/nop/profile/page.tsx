import { permanentRedirect } from "next/navigation"

// Moved into the agent portal. Old links and bookmarks keep working.
export default function Page() {
  permanentRedirect("/agent/profile")
}
