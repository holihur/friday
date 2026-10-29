import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { AlertCircle, ArrowRight, Eye, EyeOff, Fingerprint, KeyRound, Loader2, ShieldCheck } from "lucide-react"
import { AuthLayout } from "@/components/auth/AuthLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, ApiError, oidcStartURL } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { PublicConfig, User } from "@/lib/types"

type LoginResult = { totpRequired: true; challengeToken: string } | { user: User }

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [challenge, setChallenge] = useState("")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from || "/"

  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<PublicConfig>("/config"),
    staleTime: 60_000,
  })

  useEffect(() => {
    const oidcError = searchParams.get("error")
    if (oidcError) setError(oidcError)
  }, [searchParams])

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      setError(t("Enter your email and password."))
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await api.post<LoginResult>("/auth/login", { email, password })
      if ("totpRequired" in res) {
        setChallenge(res.challengeToken)
        setCode("")
        return
      }
      setUser(res.user)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Sign in failed"))
    } finally {
      setLoading(false)
    }
  }

  async function handleTOTP(e: FormEvent) {
    e.preventDefault()
    const normalized = code.replace(/[\s-]/g, "")
    if (normalized.length !== 6 && normalized.length !== 8) {
      setError(t("Enter a 6-digit code or a recovery code."))
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await api.post<{ user: User }>("/auth/login/totp", { challengeToken: challenge, code })
      setUser(res.user)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Verification failed"))
      setCode("")
    } finally {
      setLoading(false)
    }
  }

  function useDemo() {
    setEmail("admin@friday.dev")
    setPassword("friday123")
    setError("")
  }

  return (
    <AuthLayout
      title={challenge ? t("Two-factor verification") : t("Welcome back")}
      subtitle={
        challenge
          ? t("Enter the six-digit code from your authenticator app to finish signing in.")
          : t("Sign in to your workspace and pick up where you left off.")
      }
      footer={
        config?.registrationEnabled ? (
          <span>
            {t("New to Friday?")}{" "}
            <Link to="/register" className="font-semibold text-primary hover:underline">
              {t("Create an account")}
            </Link>
          </span>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {challenge ? (
        <form onSubmit={handleTOTP} className="space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="totp-code">{t("Authenticator code")}</Label>
            <Input
              id="totp-code"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000 / XXXX-XXXX"
              maxLength={9}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
              className="h-12 text-center text-lg font-bold tracking-[0.18em]"
            />
            <p className="text-[11px] text-muted-foreground">{t("You can also use one of your saved recovery codes.")}</p>
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <KeyRound />}
            {t("Verify and continue")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setChallenge("")
              setCode("")
              setError("")
            }}
          >
            {t("Back to password sign in")}
          </Button>
        </form>
      ) : (
        <>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("Work email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("Password")}</Label>
                <Link to="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
                  {t("Forgot password?")}
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : null}
              {t("Sign in")} <ArrowRight />
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
                size="lg"
                onClick={() => {
                  window.location.href = oidcStartURL()
                }}
              >
                <Fingerprint />
                {t("Continue with")} {config.oidcName || "SSO"}
              </Button>
            </>
          )}

          {config?.demoMode && (
            <div className="mt-5 rounded-xl border border-dashed border-primary/30 bg-primary/[0.04] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-primary">{t("Try the demo workspace")}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">admin@friday.dev · friday123</p>
                </div>
                <Button type="button" size="sm" variant="soft" onClick={useDemo}>
                  {t("Use demo")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </AuthLayout>
  )
}
