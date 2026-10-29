import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react"
import { AuthLayout } from "@/components/auth/AuthLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, ApiError } from "@/lib/api"

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError(t("Enter your email address."))
      return
    }
    setLoading(true)
    setError("")
    try {
      await api.post("/auth/password-reset/request", { email: email.trim() })
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Could not request password reset"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title={t("Forgot your password?")}
      subtitle={t("Enter your account email and we'll send a reset link.")}
      footer={
        <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("Back to sign in")}
        </Link>
      }
    >
      {sent ? (
        <div className="rounded-2xl border border-success/30 bg-success/5 p-5 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-success" />
          <h3 className="mt-3 text-sm font-bold">{t("Check your inbox")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("If an account exists for {{email}}, a password reset link has been sent. It expires in 30 minutes.", { email })}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/login">{t("Back to sign in")}</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="reset-email">{t("Work email")}</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Mail />}
            {t("Send reset link")}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
