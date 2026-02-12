"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Category, RequestPriority, AIValidation } from "@/lib/types"
import {
  ArrowLeft,
  Camera,
  MapPin,
  Loader2,
  BrainCircuit,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"
import useSWR from "swr"

async function fetchCategories(): Promise<Category[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("name")
  if (error) return []
  return (data ?? []) as Category[]
}

export default function NewRequestPage() {
  const { data: categories = [] } = useSWR("categories", fetchCategories)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [priority, setPriority] = useState<RequestPriority>("medium")
  const [address, setAddress] = useState("")
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<AIValidation | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const selectedCategory = categories.find((c) => c.id === categoryId)

  const detectLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser")
      return
    }
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude)
        setLongitude(pos.coords.longitude)
        setAddress(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`)
        setGeoLoading(false)
        toast.success("Location detected")
      },
      () => {
        setGeoLoading(false)
        toast.error("Unable to detect location")
      }
    )
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onload = () => setPhotoPreview(reader.result as string)
      reader.readAsDataURL(file)
      setValidation(null)
      setUploadedPhotoUrl(null)
    }
  }

  const resetValidation = () => setValidation(null)

  // Step 1: Upload photo (if any) and call AI to validate
  const handleValidate = async () => {
    if (!title.trim()) return toast.error("Please enter a title")
    if (!description.trim()) return toast.error("Please describe the issue in detail")
    if (!categoryId) return toast.error("Please select a category")

    setValidating(true)
    setValidation(null)

    try {
      const supabase = createClient()
      let photoUrl = uploadedPhotoUrl

      // Upload photo if not already uploaded
      if (photoFile && !photoUrl) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const ext = photoFile.name.split(".").pop() || "jpg"
          const filePath = `${user.id}/${Date.now()}.${ext}`
          const { error: uploadError } = await supabase.storage
            .from("request-photos")
            .upload(filePath, photoFile, { cacheControl: "3600", upsert: false })
          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from("request-photos")
              .getPublicUrl(filePath)
            photoUrl = publicUrl
            setUploadedPhotoUrl(publicUrl)
          }
        }
      }

      const res = await fetch("/api/validate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          category: selectedCategory?.name || "Other",
          photo_url: photoUrl,
        }),
      })

      const result: AIValidation = await res.json()
      setValidation(result)

      if (result.valid) {
        setPriority(result.suggested_priority)
        toast.success("Report validated - ready to submit!")
      } else {
        toast.error("Report rejected by AI")
      }
    } catch {
      toast.error("AI validation failed - you can try again")
      setValidation({
        valid: true,
        score: 5,
        reason: "Validation service unavailable - report accepted for manual review",
        suggested_priority: priority,
      })
    } finally {
      setValidating(false)
    }
  }

  // Step 2: Submit validated report to Supabase
  const handleSubmit = async () => {
    if (!validation?.valid) return toast.error("Report must pass AI validation first")

    setIsSubmitting(true)
    try {
      const supabase = createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        toast.error("Session expired. Please log in again.")
        router.push("/auth/login")
        return
      }

      const { error } = await supabase.from("service_requests").insert({
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId,
        priority: validation.suggested_priority || priority,
        citizen_id: user.id,
        address: address.trim() || null,
        latitude,
        longitude,
        photo_url: uploadedPhotoUrl,
        ai_validation: validation,
      })

      if (error) throw error

      toast.success("Report submitted successfully!")
      router.push("/citizen")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      toast.error(`Submit failed: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link
          href="/citizen"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to requests
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Report a Civic Issue</h1>
        <p className="text-sm text-muted-foreground">
          Describe the problem. AI will evaluate whether it warrants dispatching a city crew.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          {/* Title */}
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="e.g. Large pothole on Main Street"
              required
              value={title}
              onChange={(e) => { setTitle(e.target.value); resetValidation() }}
            />
          </div>

          {/* Description */}
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Provide specific details: what the issue is, exact location, severity, how many people are affected..."
              rows={4}
              value={description}
              onChange={(e) => { setDescription(e.target.value); resetValidation() }}
            />
          </div>

          {/* Category + Priority */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); resetValidation() }}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Priority (AI may adjust)</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as RequestPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Location */}
          <div className="grid gap-2">
            <Label>Location</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Address or coordinates"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={detectLocation} disabled={geoLoading}>
                {geoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Photo */}
          <div className="grid gap-2">
            <Label>Photo (recommended for faster validation)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Camera className="mr-2 h-4 w-4" />
                {photoFile ? "Change Photo" : "Attach Photo"}
              </Button>
              {photoFile && (
                <span className="text-sm text-muted-foreground">{photoFile.name}</span>
              )}
            </div>
            {photoPreview && (
              <img src={photoPreview} alt="Preview" className="mt-2 h-40 w-full rounded-lg border object-cover" />
            )}
          </div>

          {/* AI Validation Result */}
          {validation && (
            <Card className={`border-2 ${validation.valid ? "border-success bg-success/5" : "border-destructive bg-destructive/5"}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {validation.valid ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  )}
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {validation.valid ? "Report Approved by AI" : "Report Rejected by AI"}
                      <span className="ml-2 font-normal text-muted-foreground">
                        (Severity: {validation.score}/10)
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">{validation.reason}</p>
                    {validation.valid && (
                      <p className="text-xs text-muted-foreground">
                        AI-assigned priority: <span className="font-medium capitalize text-foreground">{validation.suggested_priority}</span>
                      </p>
                    )}
                    {!validation.valid && (
                      <p className="mt-1 text-xs text-destructive">
                        Edit your report details above and click &quot;Re-validate&quot; to try again.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pt-2">
            {!validation?.valid && (
              <Button
                onClick={handleValidate}
                disabled={validating || !title.trim() || !description.trim() || !categoryId}
                className="w-full"
              >
                {validating ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />AI is Reviewing...</>
                ) : validation && !validation.valid ? (
                  <><AlertTriangle className="mr-2 h-4 w-4" />Re-validate Report</>
                ) : (
                  <><BrainCircuit className="mr-2 h-4 w-4" />Validate with AI</>
                )}
              </Button>
            )}

            {validation?.valid && (
              <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
                {isSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>
                ) : (
                  <><Send className="mr-2 h-4 w-4" />Submit Validated Report</>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
