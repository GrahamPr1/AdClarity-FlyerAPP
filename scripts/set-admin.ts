import "./load-env"
import { setClientIsAdmin } from "../lib/store"

// Usage: npx tsx scripts/set-admin.ts <email> [true|false]
// Grants (default) or revokes /admin/* access for a real client account —
// the email must already be able to log in via /login (see the signup flow
// in app/login/page.tsx) for this to be useful; this only sets the flag,
// it doesn't create the account itself.
async function main() {
  const email = process.argv[2]?.trim().toLowerCase()
  const isAdmin = process.argv[3] !== "false"
  if (!email) throw new Error("Usage: npx tsx scripts/set-admin.ts <email> [true|false]")

  const client = await setClientIsAdmin(email, isAdmin)
  console.log(`${email}: isAdmin = ${client.isAdmin}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
