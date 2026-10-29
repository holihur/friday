import { useState, type FormEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react"
import { AuthLayout } from "@/components/auth/AuthLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, ApiError } from "@/lib/api"

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get("token") ?? ""
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!token) {
      setError(t("This reset link is invalid or has expired."))
      return
    }
    if (password.length < 8) {
      setError(t("New password must be at least 8 characters."))
      return
    }
    if (password !== confirm) {
      setError(t("New passwords do not match."))
      return
    }
    setLoading(true)
    setError("")
    try {
      await api.post("/auth/password-reset/confirm", { token, newPassword: password })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Could not reset password"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title={t("Choose a new password")}
      subtitle={t("Your new password must be at least 8 characters.")}
      footer={
        <Link to="/login" className="font-semibold text-primary hover:underline">
          {t("Back to sign in")}
        </Link>
      }
    >
      {done ? (
        <div className="rounded-2xl border border-success/30 bg-success/5 p-5 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-success" />
          <h3 className="mt-3 text-sm font-bold">{t("Password updated")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("You can now sign in with your new password.")}</p>
          <Button asChild className="mt-4">
            <Link to="/login">{t("Sign in")}</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          {!token && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {t("This reset link is invalid or has expired.")}
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("New password")}</Label>
            <Input id="new-password" type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t("Confirm")}</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading || !token}>
            {loading ? <Loader2 className="animate-spin" /> : <KeyRound />}
            {t("Update password")}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
