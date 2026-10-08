import { redirect } from "next/navigation"

// The old signed-in registration page. Agents now get started at /agent
// without an account or password; links already sent out keep working.
export default function Page() {
  redirect("/agent/start")
}
