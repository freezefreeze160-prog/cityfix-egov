"use client"

import { createClient } from "@/lib/supabase/client"
import { DashboardShell } from "@/components/dashboard-shell"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ClipboardList, MapPin, CheckCircle2 } from "lucide-react"
import type { Profile } from "@/lib/types"

const navItems = [
  { label: "My Tasks", href: "/worker", icon: <ClipboardList className="h-4 w-4" /> },
  { label: "Completed", href: "/worker/history", icon: <CheckCircle2 className="h-4 w-4" /> },
  { label: "Field Map", href: "/worker/map", icon: <MapPin className="h-4 w-4" /> },
]

export default function WorkerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login")
        return
      }
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()
      if (data) setProfile(data)
      setLoading(false)
    }
    loadProfile()
  }, [router])

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <DashboardShell
      role="worker"
      userName={profile?.full_name || "Worker"}
      navItems={navItems}
    >
      {children}
    </DashboardShell>
  )
}
