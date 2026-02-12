"use client"

import { useEffect, useRef, useState } from "react"
import type { ServiceRequest } from "@/lib/types"

interface MapViewProps {
  requests: ServiceRequest[]
  center?: [number, number]
  zoom?: number
  className?: string
  onMarkerClick?: (request: ServiceRequest) => void
}

export function MapView({
  requests,
  center = [40.7128, -74.006],
  zoom = 12,
  className = "h-[400px] w-full rounded-lg",
  onMarkerClick,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<unknown>(null)

  useEffect(() => {
    if (!mapRef.current || map) return

    let isMounted = true

    async function initMap() {
      const L = (await import("leaflet")).default
      await import("leaflet/dist/leaflet.css")

      if (!isMounted || !mapRef.current) return

      const mapInstance = L.map(mapRef.current).setView(center, zoom)

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapInstance)

      const statusColors: Record<string, string> = {
        submitted: "#6b7280",
        assigned: "#1a6dc2",
        in_progress: "#d97706",
        resolved: "#16a34a",
        closed: "#9ca3af",
      }

      requests.forEach((req) => {
        if (req.latitude && req.longitude) {
          const color = statusColors[req.status] ?? "#6b7280"
          const marker = L.circleMarker([req.latitude, req.longitude], {
            radius: 8,
            fillColor: color,
            color: "#fff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.85,
          }).addTo(mapInstance)

          marker.bindPopup(
            `<strong>${req.title}</strong><br/><span style="text-transform: capitalize">${req.status.replace("_", " ")}</span>`
          )

          if (onMarkerClick) {
            marker.on("click", () => onMarkerClick(req))
          }
        }
      })

      setMap(mapInstance)
    }

    initMap()

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update markers when requests change
  useEffect(() => {
    if (!map) return

    async function updateMarkers() {
      const L = (await import("leaflet")).default
      const m = map as import("leaflet").Map

      m.eachLayer((layer) => {
        if (layer instanceof L.CircleMarker) {
          m.removeLayer(layer)
        }
      })

      const statusColors: Record<string, string> = {
        submitted: "#6b7280",
        assigned: "#1a6dc2",
        in_progress: "#d97706",
        resolved: "#16a34a",
        closed: "#9ca3af",
      }

      requests.forEach((req) => {
        if (req.latitude && req.longitude) {
          const color = statusColors[req.status] ?? "#6b7280"
          const marker = L.circleMarker([req.latitude, req.longitude], {
            radius: 8,
            fillColor: color,
            color: "#fff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.85,
          }).addTo(m)

          marker.bindPopup(
            `<strong>${req.title}</strong><br/><span style="text-transform: capitalize">${req.status.replace("_", " ")}</span>`
          )

          if (onMarkerClick) {
            marker.on("click", () => onMarkerClick(req))
          }
        }
      })
    }

    updateMarkers()
  }, [requests, map, onMarkerClick])

  return <div ref={mapRef} className={className} />
}
