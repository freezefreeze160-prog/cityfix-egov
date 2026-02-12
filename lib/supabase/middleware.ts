import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes - redirect to login if not authenticated
  const protectedPaths = ["/citizen", "/worker", "/admin"]
  const isProtected = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  // If user is logged in, fetch their role for routing
  if (user && isProtected) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile) {
      const rolePathMap: Record<string, string> = {
        citizen: "/citizen",
        worker: "/worker",
        admin: "/admin",
      }
      const allowedPath = rolePathMap[profile.role]

      // Redirect if accessing a portal not matching their role
      if (allowedPath && !request.nextUrl.pathname.startsWith(allowedPath)) {
        const url = request.nextUrl.clone()
        url.pathname = allowedPath
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
