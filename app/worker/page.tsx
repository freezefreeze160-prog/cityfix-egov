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
import { Progress } from "@/components/ui/progress"
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
  BrainCircuit,
  CheckCircle2,
  XCircle,
  Star,
  HandMetal,
  ListTodo,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useRef, useState } from "react"
import { toast } from "sonner"
import useSWR, { mutate } from "swr"

interface AIVerification {
  resolved: boolean
  score: number
  comment: string
}

async function fetchMyTasks(): Promise<ServiceRequest[]> {
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

async function fetchAvailableTasks(): Promise<ServiceRequest[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from("service_requests")
    .select("*, category:categories(*)")
    .is("assigned_worker_id", null)
    .eq("status", "submitted")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })

  return (data ?? []) as ServiceRequest[]
}

function VerificationResult({ result }: { result: AIVerification }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <BrainCircuit className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold">AI Verification Result</span>
      </div>
      <div className="mb-3 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          {result.resolved ? (
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <XCircle className="h-5 w-5 text-destructive" />
          )}
          <span className={`text-sm font-medium ${result.resolved ? "text-success" : "text-destructive"}`}>
            {result.resolved ? "Issue Resolved" : "Not Fully Resolved"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Star className="h-4 w-4 text-warning" />
          <span className="text-sm font-bold">{result.score}</span>
          <span className="text-xs text-muted-foreground">/10</span>
        </div>
      </div>
      <Progress value={result.score * 10} className="mb-2 h-2" />
      <p className="text-sm text-muted-foreground">{result.comment}</p>
    </div>
  )
}

/* ── Available task card (claim it) ── */
function AvailableTaskCard({ task }: { task: ServiceRequest }) {
  const [isClaiming, setIsClaiming] = useState(false)

  const handleClaim = async () => {
    setIsClaiming(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { error } = await supabase
        .from("service_requests")
        .update({
          assigned_worker_id: user.id,
          status: "assigned" as RequestStatus,
        })
        .eq("id", task.id)
        .is("assigned_worker_id", null)

      if (error) throw error
      toast.success("Task claimed! It now appears in My Tasks.")
      mutate("worker-tasks")
      mutate("worker-available")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to claim task")
    } finally {
      setIsClaiming(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-tight">
            {task.title}
          </CardTitle>
          <PriorityBadge priority={task.priority} />
        </div>
      </CardHeader>
      <CardContent>
        {task.description && (
          <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
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
            {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
          </span>
        </div>
        {task.photo_url && (
          <img
            src={task.photo_url}
            alt="Issue"
            className="mb-3 h-32 w-full rounded-lg object-cover"
          />
        )}
        <Button onClick={handleClaim} disabled={isClaiming} className="w-full">
          {isClaiming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Claiming...
            </>
          ) : (
            <>
              <HandMetal className="mr-2 h-4 w-4" />
              Claim This Task
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

/* ── My assigned task card (update status) ── */
function MyTaskCard({ task }: { task: ServiceRequest }) {
  const [expanded, setExpanded] = useState(false)
  const [newStatus, setNewStatus] = useState<RequestStatus>(task.status)
  const [comment, setComment] = useState("")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verification, setVerification] = useState<AIVerification | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onload = () => setPhotoPreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleVerify = async () => {
    if (!photoFile) {
      toast.error("Please attach an after-photo first")
      return
    }
    setIsVerifying(true)
    setVerification(null)
    try {
      const formData = new FormData()
      formData.append("request_id", task.id)
      formData.append("after_photo", photoFile)
      if (task.photo_url) formData.append("before_url", task.photo_url)

      const res = await fetch("/api/verify-report", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Verification failed (${res.status})`)
      if (data.verification) {
        setVerification(data.verification)
        toast.success("AI verification complete")
      } else {
        throw new Error("No verification data returned")
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Verification failed")
    } finally {
      setIsVerifying(false)
    }
  }

  const handleUpdate = async () => {
    setIsUpdating(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      let photoUrl: string | null = null
      if (photoFile && !verification) {
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

      const { error: updateError } = await supabase
        .from("service_requests")
        .update({ status: newStatus })
        .eq("id", task.id)
      if (updateError) throw updateError

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
      setPhotoPreview(null)
      setVerification(null)
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
          <p className="mb-3 text-sm text-muted-foreground">{task.description}</p>
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
            {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
          </span>
        </div>

        {task.photo_url && (
          <div className="mb-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Before photo:</p>
            <img src={task.photo_url} alt="Issue photo (before)" className="h-32 w-full rounded-lg object-cover" />
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full" onClick={() => setExpanded(!expanded)}>
          {expanded ? (
            <><ChevronUp className="mr-1 h-4 w-4" /> Collapse</>
          ) : (
            <><ChevronDown className="mr-1 h-4 w-4" /> Update Status</>
          )}
        </Button>

        {expanded && (
          <div className="mt-4 flex flex-col gap-3 rounded-lg border bg-muted/50 p-4">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as RequestStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            <div className="grid gap-2">
              <Label>After Photo {newStatus === "resolved" ? "(required for AI check)" : "(optional)"}</Label>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="mr-1 h-4 w-4" />
                  {photoFile ? "Change Photo" : "Attach Photo"}
                </Button>
                {photoFile && <span className="text-xs text-muted-foreground">{photoFile.name}</span>}
              </div>
              {photoPreview && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">After photo preview:</p>
                  <img src={photoPreview} alt="After photo preview" className="h-32 w-full rounded-lg object-cover" />
                </div>
              )}
            </div>

            {photoFile && (
              <Button type="button" variant="secondary" onClick={handleVerify} disabled={isVerifying} className="gap-2">
                {isVerifying ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Running AI Analysis...</>
                ) : (
                  <><BrainCircuit className="h-4 w-4" /> Run AI Verification</>
                )}
              </Button>
            )}

            {verification && <VerificationResult result={verification} />}

            <Button onClick={handleUpdate} disabled={isUpdating}>
              {isUpdating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</>
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

/* ── Main Worker Dashboard ── */
export default function WorkerDashboard() {
  const [tab, setTab] = useState<"my" | "available">("available")
  const { data: myTasks = [], isLoading: loadingMy } = useSWR("worker-tasks", fetchMyTasks)
  const { data: availableTasks = [], isLoading: loadingAvailable } = useSWR("worker-available", fetchAvailableTasks)

  const isLoading = tab === "my" ? loadingMy : loadingAvailable

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Worker Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {myTasks.length} active task{myTasks.length !== 1 ? "s" : ""} &middot; {availableTasks.length} available
        </p>
      </div>

      {/* Tab buttons */}
      <div className="mb-6 flex gap-2 rounded-lg border bg-muted/50 p-1">
        <button
          onClick={() => setTab("available")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            tab === "available" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Inbox className="h-4 w-4" />
          Available ({availableTasks.length})
        </button>
        <button
          onClick={() => setTab("my")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            tab === "my" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ListTodo className="h-4 w-4" />
          My Tasks ({myTasks.length})
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : tab === "available" ? (
        availableTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
            <CheckCircle2 className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-muted-foreground">No available tasks</p>
            <p className="text-sm text-muted-foreground">All current reports have been claimed.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {availableTasks.map((task) => (
              <AvailableTaskCard key={task.id} task={task} />
            ))}
          </div>
        )
      ) : myTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-muted-foreground">No active tasks</p>
          <p className="text-sm text-muted-foreground">Claim a task from the Available tab to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {myTasks.map((task) => (
            <MyTaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  )
}
