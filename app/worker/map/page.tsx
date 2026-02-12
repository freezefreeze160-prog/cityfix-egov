"use client"

import { createClient } from "@/lib/supabase/client"
import { MapView } from "@/components/map-view"
import type { ServiceRequest } from "@/lib/types"
import useSWR from "swr"

async function fetchTasks(): Promise<ServiceRequest[]> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from("service_requests")
    .select("*, category:categories(*)")
    .eq("assigned_worker_id", user.id)
    .in("status", ["assigned", "in_progress"])

  return (data ?? []) as ServiceRequest[]
}

export default function WorkerMapPage() {
  const { data: tasks = [], isLoading } = useSWR("worker-tasks-map", fetchTasks)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Field Map</h1>
        <p className="text-sm text-muted-foreground">
          View your assigned tasks on the map
        </p>
      </div>

      {isLoading ? (
        <div className="flex h-[400px] items-center justify-center rounded-lg border">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <MapView
          requests={tasks}
          className="h-[calc(100svh-220px)] w-full rounded-lg border"
        />
      )}
    </div>
  )
}
