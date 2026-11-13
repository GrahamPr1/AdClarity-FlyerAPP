"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function ApSignOut({ slug, label }: { slug: string; label: string }) {
  const router = useRouter()
  return (
    <Button variant="outline" size="sm" onClick={async () => { await fetch(`/api/ap/${slug}/signout`, { method: "POST" }); router.push(`/ap/${slug}/sign-in`) }}>
      {label}
    </Button>
  )
}
