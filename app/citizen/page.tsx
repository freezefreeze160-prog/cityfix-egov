"use client"

import { createClient } from "@/lib/supabase/client"
import { RequestCard } from "@/components/request-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ServiceRequest, RequestStatus } from "@/lib/types"
import { PlusCircle, Search, Inbox } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import useSWR from "swr"

async function fetchRequests(): Promise<ServiceRequest[]> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from("service_requests")
    .select("*, category:categories(*), ai_validation")
    .eq("citizen_id", user.id)
    .order("created_at", { ascending: false })

  return (data ?? []) as ServiceRequest[]
}

export default function CitizenDashboard() {
  const { data: requests = [], isLoading } = useSWR("citizen-requests", fetchRequests)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const filtered = requests.filter((r) => {
    const matchesSearch =
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.address?.toLowerCase().includes(search.toLowerCase())
    const matchesStatus =
      statusFilter === "all" || r.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Requests</h1>
          <p className="text-sm text-muted-foreground">
            Track your submitted service requests
          </p>
        </div>
        <Button asChild>
          <Link href="/citizen/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Request
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search requests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Request list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="mb-1 font-medium text-muted-foreground">
            {requests.length === 0
              ? "No requests yet"
              : "No matching requests"}
          </p>
          <p className="text-sm text-muted-foreground">
            {requests.length === 0
              ? "Report your first civic issue to get started."
              : "Try adjusting your filters."}
          </p>
          {requests.length === 0 && (
            <Button asChild className="mt-4" variant="outline">
              <Link href="/citizen/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Report Issue
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
      )}
    </div>
  )
}
