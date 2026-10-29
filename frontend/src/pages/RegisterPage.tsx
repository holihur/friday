import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { AlertCircle, ArrowRight, Loader2, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { AuthLayout } from "@/components/auth/AuthLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, ApiError, oidcStartURL } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { PublicConfig, User } from "@/lib/types"

export default function RegisterPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const { setUser } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from || "/"

  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<PublicConfig>("/config"),
    staleTime: 60_000,
  })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) {
      setError(t("Name and email are required."))
      return
    }
    if (password.length < 8) {
      setError(t("Password must be at least 8 characters."))
      return
    }
    if (password !== confirm) {
      setError(t("Passwords do not match."))
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await api.post<{ user: User }>("/auth/register", { name: name.trim(), email: email.trim(), password })
      setUser(res.user)
      toast.success(t("Welcome to Friday"), { description: t("Your first board is ready.") })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Could not create account"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title={t("Create your workspace")}
      subtitle={t("Start free, bring your team later. Your first board is created automatically.")}
      footer={
        <span>
          {t("Already have an account?")}{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            {t("Sign in")}
          </Link>
        </span>
      }
    >
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("Full name")}</Label>
          <Input id="name" placeholder="Alex Morgan" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("Work email")}</Label>
          <Input
            id="email"
            type="email"
            placeholder="alex@company.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">{t("Password")}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t("8+ characters")}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">{t("Confirm")}</Label>
            <Input
              id="confirm"
              type="password"
              placeholder={t("Repeat password")}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <UserPlus />}
          {t("Create account")} <ArrowRight />
        </Button>
      </form>
      {config?.oidcEnabled && (
        <>
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t("or")}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              window.location.href = oidcStartURL()
            }}
          >
            {t("Continue with")} {config.oidcName || "SSO"}
          </Button>
        </>
      )}
    </AuthLayout>
  )
}
