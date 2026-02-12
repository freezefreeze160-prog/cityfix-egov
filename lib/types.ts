export type UserRole = "citizen" | "worker" | "admin"

export type RequestStatus = "submitted" | "assigned" | "in_progress" | "resolved" | "closed"

export type RequestPriority = "low" | "medium" | "high" | "urgent"

export interface Profile {
  id: string
  full_name: string | null
  phone: string | null
  role: UserRole
  created_at: string
}

export interface Category {
  id: string
  name: string
  icon: string
  description: string | null
}

export interface AIVerification {
  resolved: boolean
  score: number
  comment: string
}

export interface AIValidation {
  valid: boolean
  score: number
  reason: string
  suggested_priority: RequestPriority
}

export interface ServiceRequest {
  id: string
  title: string
  description: string | null
  category_id: string
  status: RequestStatus
  priority: RequestPriority
  citizen_id: string
  assigned_worker_id: string | null
  latitude: number | null
  longitude: number | null
  address: string | null
  photo_url: string | null
  ai_verification: AIVerification | null
  ai_validation: AIValidation | null
  created_at: string
  updated_at: string
  // Joined fields
  category?: Category
  citizen?: Profile
  worker?: Profile
}

export interface RequestUpdate {
  id: string
  request_id: string
  user_id: string
  status: RequestStatus | null
  comment: string | null
  photo_url: string | null
  created_at: string
  // Joined
  user?: Profile
}

export const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string }> = {
  submitted: { label: "Submitted", color: "bg-muted text-muted-foreground" },
  assigned: { label: "Assigned", color: "bg-primary/15 text-primary" },
  in_progress: { label: "In Progress", color: "bg-warning/15 text-warning" },
  resolved: { label: "Resolved", color: "bg-success/15 text-success" },
  closed: { label: "Closed", color: "bg-muted text-muted-foreground" },
}

export const PRIORITY_CONFIG: Record<RequestPriority, { label: string; color: string }> = {
  low: { label: "Low", color: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", color: "bg-primary/15 text-primary" },
  high: { label: "High", color: "bg-warning/15 text-warning" },
  urgent: { label: "Urgent", color: "bg-destructive/15 text-destructive" },
}
