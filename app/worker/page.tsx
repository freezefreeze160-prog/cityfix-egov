"use client"

import { createClient } from "@/lib/supabase/client"
import { StatusBadge } from "@/components/status-badge"
import { PriorityBadge } from "@/components/priority-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { ServiceRequest, RequestStatus } from "@/lib/types"
import {
  MapPin,
  Clock,
  Tag,
  Camera,
  Loader2,
  ChevronDown,
  ChevronUp,
  Inbox,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useRef, useState } from "react"
import { toast } from "sonner"
import useSWR, { mutate } from "swr"

async function fetchAssignedTasks(): Promise<ServiceRequest[]> {
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
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })

  return (data ?? []) as ServiceRequest[]
}

function TaskCard({ task }: { task: ServiceRequest }) {
  const [expanded, setExpanded] = useState(false)
  const [newStatus, setNewStatus] = useState<RequestStatus>(task.status)
  const [comment, setComment] = useState("")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpdate = async () => {
    setIsUpdating(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      let photoUrl: string | null = null
      if (photoFile) {
        const ext = photoFile.name.split(".").pop()
        const filePath = `${user.id}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from("request-photos")
          .upload(filePath, photoFile)
        if (uploadError) throw uploadError
        const {
          data: { publicUrl },
        } = supabase.storage.from("request-photos").getPublicUrl(filePath)
        photoUrl = publicUrl
      }

      // Update status on the request
      const { error: updateError } = await supabase
        .from("service_requests")
        .update({ status: newStatus })
        .eq("id", task.id)
      if (updateError) throw updateError

      // Add update log entry
      const { error: logError } = await supabase
        .from("request_updates")
        .insert({
          request_id: task.id,
          user_id: user.id,
          status: newStatus,
          comment: comment || null,
          photo_url: photoUrl,
        })
      if (logError) throw logError

      toast.success("Task updated successfully")
      setComment("")
      setPhotoFile(null)
      setExpanded(false)
      mutate("worker-tasks")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed")
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-tight">
            {task.title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {task.description && (
          <p className="mb-3 text-sm text-muted-foreground">
            {task.description}
          </p>
        )}
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {task.category && (
            <span className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {task.category.name}
            </span>
          )}
          {task.address && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {task.address}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(task.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>

        {task.photo_url && (
          <img
            src={task.photo_url}
            alt="Issue photo"
            className="mb-3 h-32 w-full rounded-lg object-cover"
          />
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp className="mr-1 h-4 w-4" />
              Collapse
            </>
          ) : (
            <>
              <ChevronDown className="mr-1 h-4 w-4" />
              Update Status
            </>
          )}
        </Button>

        {expanded && (
          <div className="mt-4 flex flex-col gap-3 rounded-lg border bg-muted/50 p-4">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={newStatus}
                onValueChange={(v) => setNewStatus(v as RequestStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Comment</Label>
              <Textarea
                placeholder="Add a note about the work done..."
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="mr-1 h-4 w-4" />
                {photoFile ? photoFile.name : "Attach Photo"}
              </Button>
            </div>
            <Button onClick={handleUpdate} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Save Update"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function WorkerDashboard() {
  const { data: tasks = [], isLoading } = useSWR("worker-tasks", fetchAssignedTasks)

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
        <h1 className="text-2xl font-bold tracking-tight">My Tasks</h1>
        <p className="text-sm text-muted-foreground">
          {tasks.length} active task{tasks.length !== 1 ? "s" : ""} assigned to
          you
        </p>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-muted-foreground">No tasks assigned</p>
          <p className="text-sm text-muted-foreground">
            Check back later for new assignments.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  )
}
