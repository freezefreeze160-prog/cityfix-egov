"use client"

import { createClient } from "@/lib/supabase/client"
import { StatusBadge } from "@/components/status-badge"
import { PriorityBadge } from "@/components/priority-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ServiceRequest } from "@/lib/types"
import { MapPin, Clock, Tag, Inbox, BrainCircuit, CheckCircle2, XCircle, Star } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Progress } from "@/components/ui/progress"
import useSWR from "swr"

async function fetchCompletedTasks(): Promise<ServiceRequest[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from("service_requests")
    .select("*, category:categories(*)")
    .eq("assigned_worker_id", user.id)
    .in("status", ["resolved", "closed"])
    .order("updated_at", { ascending: false })

  return (data ?? []) as ServiceRequest[]
}

export default function WorkerHistoryPage() {
  const { data: tasks = [], isLoading } = useSWR("worker-history", fetchCompletedTasks)

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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Completed Tasks</h1>
        <p className="text-sm text-muted-foreground">
          {tasks.length} completed task{tasks.length !== 1 ? "s" : ""}
        </p>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-muted-foreground">No completed tasks yet</p>
          <p className="text-sm text-muted-foreground">Tasks you resolve will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-semibold leading-tight">{task.title}</CardTitle>
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {task.description && (
                  <p className="mb-3 text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {task.category && (
                    <span className="flex items-center gap-1"><Tag className="h-3 w-3" />{task.category.name}</span>
                  )}
                  {task.address && (
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{task.address}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}
                  </span>
                </div>
                {task.ai_verification && (
                  <div className="mt-3 rounded-lg border bg-muted/50 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <BrainCircuit className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">AI Verification</span>
                      <div className="flex items-center gap-1">
                        {task.ai_verification.resolved ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        )}
                        <Star className="h-3 w-3 text-warning" />
                        <span className="text-xs font-bold">{task.ai_verification.score}/10</span>
                      </div>
                    </div>
                    <Progress value={task.ai_verification.score * 10} className="mb-1.5 h-1.5" />
                    <p className="text-xs text-muted-foreground">{task.ai_verification.comment}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
