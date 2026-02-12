"use client"

import { createClient } from "@/lib/supabase/client"
import { MapView } from "@/components/map-view"
import type { ServiceRequest } from "@/lib/types"
import useSWR from "swr"

async function fetchAllRequests(): Promise<ServiceRequest[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from("service_requests")
    .select("*, category:categories(*)")
    .not("status", "eq", "closed")
    .order("created_at", { ascending: false })
  return (data ?? []) as ServiceRequest[]
}

export default function AdminMapPage() {
  const { data: requests = [], isLoading } = useSWR(
    "admin-map-requests",
    fetchAllRequests
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">City Map</h1>
        <p className="text-sm text-muted-foreground">
          All active service requests across the city
        </p>
      </div>

      {isLoading ? (
        <div className="flex h-[400px] items-center justify-center rounded-lg border">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <MapView
          requests={requests}
          className="h-[calc(100svh-220px)] w-full rounded-lg border"
        />
      )}
    </div>
  )
}
