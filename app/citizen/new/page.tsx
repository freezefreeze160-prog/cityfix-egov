"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
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
import type { Category, RequestPriority } from "@/lib/types"
import { ArrowLeft, Camera, MapPin, Loader2 } from "lucide-react"
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
  if (error) {
    console.error("[v0] Failed to fetch categories:", error.message)
    return []
  }
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

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
        setAddress(
          `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`
        )
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
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast.error("Please enter a title")
      return
    }
    if (!categoryId) {
      toast.error("Please select a category")
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        toast.error("Session expired. Please log in again.")
        router.push("/auth/login")
        return
      }

      let photoUrl: string | null = null

      if (photoFile) {
        const ext = photoFile.name.split(".").pop() || "jpg"
        const filePath = `${user.id}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from("request-photos")
          .upload(filePath, photoFile, {
            cacheControl: "3600",
            upsert: false,
          })
        if (uploadError) {
          console.error("[v0] Photo upload error:", uploadError)
          toast.error("Photo upload failed: " + uploadError.message)
          setIsSubmitting(false)
          return
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("request-photos").getPublicUrl(filePath)
        photoUrl = publicUrl
      }

      const insertData = {
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId,
        priority,
        citizen_id: user.id,
        address: address.trim() || null,
        latitude,
        longitude,
        photo_url: photoUrl,
      }

      const { error } = await supabase
        .from("service_requests")
        .insert(insertData)

      if (error) {
        console.error("[v0] Insert error:", error)
        toast.error("Submit failed: " + error.message)
        return
      }

      toast.success("Request submitted successfully!")
      router.push("/citizen")
    } catch (err: unknown) {
      console.error("[v0] Unexpected error:", err)
      toast.error(
        err instanceof Error ? err.message : "An unexpected error occurred"
      )
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
        <h1 className="text-2xl font-bold tracking-tight">
          Report a New Issue
        </h1>
        <p className="text-sm text-muted-foreground">
          Fill in the details about the civic issue you want to report.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g. Large pothole on Main Street"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the issue in detail..."
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as RequestPriority)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="address">Location</Label>
              <div className="flex gap-2">
                <Input
                  id="address"
                  placeholder="Address or coordinates"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={detectLocation}
                  disabled={geoLoading}
                >
                  {geoLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MapPin className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Photo (optional)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  {photoFile ? "Change Photo" : "Add Photo"}
                </Button>
                {photoFile && (
                  <span className="text-sm text-muted-foreground">
                    {photoFile.name}
                  </span>
                )}
              </div>
              {photoPreview && (
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="mt-2 h-40 w-full rounded-lg object-cover"
                />
              )}
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Request"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
