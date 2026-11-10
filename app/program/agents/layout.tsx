import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { nopAdminFrom } from "@/lib/enterprise/program-admins"
import { ProgramAdminBar } from "@/components/program-admin"

export const dynamic = "force-dynamic"

// Gate for /program/agents: a signed-in program admin (or the owner). Anyone
// else goes to the sign-in. Every API route these screens call checks again.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const who = await nopAdminFrom({ cookies: await cookies() })
  if (!who) redirect("/program")
  return (
    <>
      <ProgramAdminBar name={who.name ?? who.admin} canSignOut={who.role === "program"} />
      {children}
    </>
  )
}
