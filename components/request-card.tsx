"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { PriorityBadge } from "@/components/priority-badge"
import type { ServiceRequest } from "@/lib/types"
import { MapPin, Clock, Tag, BrainCircuit } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface RequestCardProps {
  request: ServiceRequest
  onClick?: () => void
}

export function RequestCard({ request, onClick }: RequestCardProps) {
  return (
    <Card
      className={onClick ? "cursor-pointer transition-shadow hover:shadow-md" : ""}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-tight">
            {request.title}
          </CardTitle>
          <StatusBadge status={request.status} />
        </div>
      </CardHeader>
      <CardContent>
        {request.description && (
          <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
            {request.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <PriorityBadge priority={request.priority} />
          {request.category && (
            <span className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {request.category.name}
            </span>
          )}
          {request.address && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span className="max-w-[140px] truncate">{request.address}</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(request.created_at), {
              addSuffix: true,
            })}
          </span>
          {request.ai_validation && (
            <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${request.ai_validation.valid ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
              <BrainCircuit className="h-3 w-3" />
              AI: {request.ai_validation.score}/10
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
