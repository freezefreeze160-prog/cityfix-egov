"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import type { UserRole } from "@/lib/types"
import {
  Shield,
  LogOut,
  Menu,
  X,
  User,
  Wrench,
  LayoutDashboard,
} from "lucide-react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

interface DashboardShellProps {
  children: React.ReactNode
  role: UserRole
  userName: string
  navItems: NavItem[]
}

const ROLE_LABELS: Record<UserRole, { label: string; icon: React.ReactNode }> = {
  citizen: { label: "Citizen", icon: <User className="h-4 w-4" /> },
  worker: { label: "Field Worker", icon: <Wrench className="h-4 w-4" /> },
  admin: { label: "Administrator", icon: <LayoutDashboard className="h-4 w-4" /> },
}

export function DashboardShell({
  children,
  role,
  userName,
  navItems,
}: DashboardShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
  }

  const roleInfo = ROLE_LABELS[role]

  return (
    <div className="flex min-h-svh flex-col">
      {/* Top Nav */}
      <header className="sticky top-0 z-50 border-b bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              aria-label="Toggle navigation"
            >
              {mobileNavOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
            <Link href="/" className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold tracking-tight">CityFix</span>
            </Link>
            <span className="hidden items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary md:flex">
              {roleInfo.icon}
              {roleInfo.label}
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                  pathname === item.href && "bg-muted text-foreground",
                  pathname !== item.href && "text-muted-foreground"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground lg:block">
              {userName}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileNavOpen && (
          <nav className="border-t bg-card px-4 py-2 md:hidden">
            <div className="mb-2 flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
              {roleInfo.icon}
              {roleInfo.label} &mdash; {userName}
            </div>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === item.href
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
      </main>
    </div>
  )
}
