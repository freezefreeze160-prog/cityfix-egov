"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Profile, UserRole } from "@/lib/types"
import { Search, User, Wrench, Shield, Inbox, Loader2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useState } from "react"
import { toast } from "sonner"
import useSWR, { mutate } from "swr"

async function fetchAllUsers(): Promise<Profile[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
  return (data ?? []) as Profile[]
}

const ROLE_ICONS: Record<UserRole, React.ReactNode> = {
  citizen: <User className="h-4 w-4" />,
  worker: <Wrench className="h-4 w-4" />,
  admin: <Shield className="h-4 w-4" />,
}

const ROLE_COLORS: Record<UserRole, string> = {
  citizen: "bg-muted text-muted-foreground",
  worker: "bg-primary/10 text-primary",
  admin: "bg-destructive/10 text-destructive",
}

function UserCard({ profile }: { profile: Profile }) {
  const [isUpdating, setIsUpdating] = useState(false)

  const handleRoleChange = async (newRole: UserRole) => {
    setIsUpdating(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", profile.id)

      if (error) throw error
      toast.success(`Role updated to ${newRole}`)
      mutate("admin-users")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update role")
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 pt-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${ROLE_COLORS[profile.role]}`}>
            {ROLE_ICONS[profile.role]}
          </div>
          <div>
            <p className="font-semibold text-foreground">{profile.full_name || "Unnamed"}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {profile.phone && <span>{profile.phone}</span>}
              <span>Joined {formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Select value={profile.role} onValueChange={(v) => handleRoleChange(v as UserRole)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="citizen">Citizen</SelectItem>
              <SelectItem value="worker">Worker</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AdminUsersPage() {
  const { data: users = [], isLoading } = useSWR("admin-users", fetchAllUsers)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")

  const filtered = users.filter((u) => {
    const matchesSearch =
      !search ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.phone?.includes(search)
    const matchesRole = roleFilter === "all" || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  const roleCounts = users.reduce(
    (acc, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">User Management</h1>
        <p className="text-sm text-muted-foreground">
          {users.length} total users &mdash; {roleCounts["citizen"] || 0} citizens, {roleCounts["worker"] || 0} workers, {roleCounts["admin"] || 0} admins
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="citizen">Citizens</SelectItem>
            <SelectItem value="worker">Workers</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-muted-foreground">No users found</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((user) => (
            <UserCard key={user.id} profile={user} />
          ))}
        </div>
      )}
    </div>
  )
}
