import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle } from "lucide-react"
import Link from "next/link"

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card className="text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Authentication Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Something went wrong during authentication. Please try again.
            </p>
            <Link
              href="/auth/login"
              className="mt-4 inline-block text-sm text-primary underline underline-offset-4"
            >
              Back to login
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
