"use client"

import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { PriorityBadge } from "@/components/priority-badge"
import type { ServiceRequest, RequestStatus } from "@/lib/types"
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"
import useSWR from "swr"

async function fetchAllRequests(): Promise<ServiceRequest[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from("service_requests")
    .select("*, category:categories(*)")
    .order("created_at", { ascending: false })
  return (data ?? []) as ServiceRequest[]
}

export default function AdminOverview() {
  const { data: requests = [], isLoading } = useSWR(
    "admin-requests",
    fetchAllRequests
  )

  const statusCounts = requests.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const urgent = requests.filter(
    (r) => r.priority === "urgent" && r.status !== "resolved" && r.status !== "closed"
  )

  const recent = requests.slice(0, 5)

  const statCards = [
    {
      label: "Total Requests",
      value: requests.length,
      icon: <FileText className="h-5 w-5" />,
      color: "text-primary",
    },
    {
      label: "Pending",
      value: (statusCounts["submitted"] || 0) + (statusCounts["assigned"] || 0),
      icon: <Clock className="h-5 w-5" />,
      color: "text-warning",
    },
    {
      label: "In Progress",
      value: statusCounts["in_progress"] || 0,
      icon: <TrendingUp className="h-5 w-5" />,
      color: "text-primary",
    },
    {
      label: "Resolved",
      value: (statusCounts["resolved"] || 0) + (statusCounts["closed"] || 0),
      icon: <CheckCircle2 className="h-5 w-5" />,
      color: "text-success",
    },
  ]

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
        <h1 className="text-2xl font-bold tracking-tight">Admin Overview</h1>
        <p className="text-sm text-muted-foreground">
          City-wide service request dashboard
        </p>
      </div>

      {/* Stat cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-muted ${stat.color}`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent requests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Recent Requests</CardTitle>
            <Link
              href="/admin/requests"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No requests yet
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {recent.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.category?.name} &middot;{" "}
                        {formatDistanceToNow(new Date(r.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Urgent items */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Urgent Issues ({urgent.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {urgent.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No urgent issues
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {urgent.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.address || r.category?.name}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
