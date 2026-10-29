import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  Plus,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Monitor,
  Trash2,
  UserRound,
} from "lucide-react"
import QRCode from "qrcode"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { UserAvatar } from "@/components/UserAvatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { AVATAR_COLORS } from "@/lib/colors"
import { cn, describeUserAgent, formatDateValue, formatDateTime, initials, timeAgo } from "@/lib/utils"
import type { PAT, PATScope, SessionInfo, User } from "@/lib/types"

const tabs = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "tokens", label: "Access tokens", icon: KeyRound },
] as const

type TabId = (typeof tabs)[number]["id"]

const scopeInfo: Record<PATScope, { label: string; description: string }> = {
  "boards:read": { label: "Read boards", description: "View boards, groups and columns" },
  "boards:write": { label: "Write boards", description: "Create, edit and delete boards, groups and columns" },
  "items:read": { label: "Read items", description: "View items, comments and activity" },
  "items:write": { label: "Write items", description: "Create, edit, move and delete items and comments" },
  "users:read": { label: "Read people", description: "List workspace members for pickers" },
}

function SettingsCard({
  title,
  description,
  icon: Icon,
  children,
  action,
}: {
  title: string
  description?: string
  icon?: typeof UserRound
  children: ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-start gap-3">
          {Icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div>
            <h2 className="text-sm font-bold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function ProfileTab() {
  const { user, setUser } = useAuth()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState(user?.name ?? "")
  const [color, setColor] = useState(user?.avatarColor ?? AVATAR_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function save() {
    if (!name.trim()) {
      setError(t("Name cannot be empty."))
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await api.patch<{ user: User }>("/me", { name: name.trim(), avatarColor: color })
      setUser(res.user)
      void queryClient.invalidateQueries({ queryKey: ["me"] })
      toast.success(t("Profile updated"))
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Could not update profile"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <SettingsCard title={t("Profile")} description={t("How you appear to people across the workspace.")} icon={UserRound}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-3">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white shadow-lg"
              style={{ backgroundColor: color }}
            >
              {initials(name || user?.name || "?")}
            </div>
            <div className="flex max-w-[168px] flex-wrap justify-center gap-1.5">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-5 w-5 rounded-full border border-black/5 transition hover:scale-110",
                    color === c && "ring-2 ring-foreground/50 ring-offset-2 ring-offset-card",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Use ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="grid flex-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">{t("Full name")}</Label>
              <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">{t("Email")}</Label>
              <Input id="profile-email" value={user?.email ?? ""} readOnly disabled className="bg-muted/50" />
              <p className="text-[11px] text-muted-foreground">
                {t("Email changes are managed by your workspace administrator or identity provider.")}
              </p>
            </div>
            {user?.oidcConnected && (
              <div className="flex items-center gap-2 rounded-lg border border-info/20 bg-info/5 px-3 py-2 text-xs text-info">
                <ShieldCheck className="h-4 w-4" /> {t("Connected to single sign-on")}
              </div>
            )}
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
            <div>
              <Button onClick={() => void save()} disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                {t("Save changes")}
              </Button>
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title={t("Workspace")} description={t("Your account is part of the Friday workspace.")} icon={ShieldCheck}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t("Role")}</p>
            <p className="mt-1 text-sm font-semibold">{t("Member")}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t("Joined")}</p>
            <p className="mt-1 text-sm font-semibold">{formatDateValue(user?.createdAt)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t("Two-factor")}</p>
            <p className="mt-1 text-sm font-semibold">{user?.totpEnabled ? t("Enabled") : t("Not enabled")}</p>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}

function TOTPSetupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user, setUser } = useAuth()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [qr, setQr] = useState("")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState("")
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [codesCopied, setCodesCopied] = useState(false)

  useEffect(() => {
    if (!open) {
      setSetup(null)
      setQr("")
      setCode("")
      setError("")
      setRecoveryCodes([])
      setCodesCopied(false)
      return
    }
    let active = true
    setFetching(true)
    api
      .post<{ secret: string; otpauthUrl: string }>("/me/totp/setup")
      .then((res) => {
        if (active) setSetup(res)
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? t(err.message) : t("Could not start two-factor setup"))
      })
      .finally(() => {
        if (active) setFetching(false)
      })
    return () => {
      active = false
    }
  }, [open])

  useEffect(() => {
    if (!setup) return
    let active = true
    QRCode.toDataURL(setup.otpauthUrl, { width: 196, margin: 1, color: { dark: "#16182a", light: "#ffffff" } })
      .then((url) => {
        if (active) setQr(url)
      })
      .catch(() => setError(t("Could not render QR code. Use the setup key instead.")))
    return () => {
      active = false
    }
  }, [setup])

  async function enable() {
    if (!user || code.length !== 6) {
      setError(t("Enter the 6-digit code from your app."))
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await api.post<{ recoveryCodes: string[] }>("/me/totp/enable", { code })
      setUser({ ...user, totpEnabled: true })
      void queryClient.invalidateQueries({ queryKey: ["me"] })
      setRecoveryCodes(res.recoveryCodes)
      toast.success(t("Two-factor authentication enabled"), { description: t("Save your recovery codes now.") })
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Could not enable two-factor authentication"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Set up two-factor authentication")}</DialogTitle>
          <DialogDescription>{t("Scan the QR code with your authenticator app, then enter the six-digit code.")}</DialogDescription>
        </DialogHeader>
        {recoveryCodes.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-amber-800 dark:text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {t("Each recovery code can be used once. Store them somewhere safe — you will not see them again.")}
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/30 p-3 font-mono text-sm">
              {recoveryCodes.map((recovery) => (
                <div key={recovery} className="rounded-md bg-background px-2 py-1.5 text-center tracking-wide">
                  {recovery}
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                await navigator.clipboard.writeText(recoveryCodes.join("\n"))
                setCodesCopied(true)
                toast.success(t("Recovery codes copied"))
                setTimeout(() => setCodesCopied(false), 2000)
              }}
            >
              {codesCopied ? <Check /> : <Copy />} {codesCopied ? t("Copied") : t("Copy recovery codes")}
            </Button>
          </div>
        ) : fetching ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Preparing your secret…")}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center rounded-xl border border-border bg-white p-3">
              {qr ? <img src={qr} alt="Authenticator QR code" className="h-44 w-44" /> : <div className="h-44 w-44 animate-pulse rounded bg-muted" />}
            </div>
            {setup && (
              <div className="rounded-lg bg-muted/60 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t("Can't scan? Setup key")}</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-[11px]">{setup.secret}</code>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(setup.secret)
                      toast.success(t("Setup key copied"))
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="setup-code">{t("Authenticator code")}</Label>
              <Input
                id="setup-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center text-lg font-bold tracking-[0.35em]"
              />
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
          </div>
        )}
        <DialogFooter>
          {recoveryCodes.length > 0 ? (
            <Button onClick={() => onOpenChange(false)}>{t("I've saved my recovery codes")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                {t("Cancel")}
              </Button>
              <Button onClick={() => void enable()} disabled={loading || fetching || !setup}>
                {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                {t("Enable 2FA")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TOTPDisableDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user, setUser } = useAuth()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function disable() {
    if (!user || code.length !== 6) {
      setError(t("Enter a valid 6-digit code."))
      return
    }
    setLoading(true)
    setError("")
    try {
      await api.post("/me/totp/disable", { code })
      setUser({ ...user, totpEnabled: false })
      void queryClient.invalidateQueries({ queryKey: ["me"] })
      toast.success(t("Two-factor authentication disabled"))
      setCode("")
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Could not disable two-factor authentication"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("Disable two-factor authentication?")}</DialogTitle>
          <DialogDescription>{t("Enter a current authenticator code to confirm. Your account will be less secure.")}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="text-center text-lg font-bold tracking-[0.35em]"
        />
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t("Cancel")}
          </Button>
          <Button variant="destructive" onClick={() => void disable()} disabled={loading}>
            {loading && <Loader2 className="animate-spin" />} {t("Disable 2FA")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ActiveSessionsCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<{ sessions: SessionInfo[] }>("/me/sessions"),
  })
  const [busy, setBusy] = useState<string | null>(null)
  const sessions = data?.sessions ?? []

  async function revoke(session: SessionInfo) {
    setBusy(session.id)
    try {
      await api.delete(`/me/sessions/${session.id}`)
      toast.success(t("Session revoked"))
      await queryClient.invalidateQueries({ queryKey: ["sessions"] })
    } catch (err) {
      toast.error(err instanceof ApiError ? t(err.message) : t("Could not revoke session"))
    } finally {
      setBusy(null)
    }
  }

  async function revokeOthers() {
    setBusy("others")
    try {
      const res = await api.delete<{ revoked: number }>("/me/sessions")
      toast.success(t("Signed out other sessions"), { description: t("{{count}} sessions were revoked.", { count: res.revoked }) })
      await queryClient.invalidateQueries({ queryKey: ["sessions"] })
    } catch (err) {
      toast.error(err instanceof ApiError ? t(err.message) : t("Could not revoke sessions"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <SettingsCard
      title={t("Active sessions")}
      description={t("Devices currently signed in to your account.")}
      icon={Monitor}
      action={
        sessions.length > 1 ? (
          <Button variant="outline" size="sm" onClick={() => void revokeOthers()} disabled={busy !== null}>
            {busy === "others" ? <Loader2 className="animate-spin" /> : <LogOut />}
            {t("Sign out other sessions")}
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{t("No active sessions.")}</p>
      ) : (
        <div className="space-y-1">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/40">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-xs font-semibold">
                  {describeUserAgent(session.userAgent)}
                  {session.current && <Badge variant="success">{t("This device")}</Badge>}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {session.ip?.replace(/:\d+$/, "") || t("Unknown IP")} · {t("Signed in")} {timeAgo(session.createdAt)} · {t("expires")} {formatDateValue(session.expiresAt)}
                </p>
              </div>
              {!session.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void revoke(session)}
                  disabled={busy !== null}
                >
                  {busy === session.id ? <Loader2 className="animate-spin" /> : <LogOut />}
                  {t("Revoke")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  )
}

function SecurityTab() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [setupOpen, setSetupOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    if (next.length < 8) {
      setError(t("New password must be at least 8 characters."))
      return
    }
    if (next !== confirm) {
      setError(t("New passwords do not match."))
      return
    }
    setSaving(true)
    setError("")
    try {
      await api.post("/me/password", { currentPassword: current, newPassword: next })
      toast.success(t("Password updated"))
      setCurrent("")
      setNext("")
      setConfirm("")
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Could not update password"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <SettingsCard title={t("Password")} description={t("Use at least 8 characters. SSO accounts can leave the current password blank.")} icon={LockKeyhole}>
        <form onSubmit={changePassword} className="grid max-w-xl gap-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">{t("Current password")}</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder={t("Only required if you have a password")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-password">{t("New password")}</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("Confirm")}</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
          <div>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {t("Update password")}
            </Button>
          </div>
        </form>
      </SettingsCard>

      <SettingsCard
        title={t("Two-factor authentication")}
        description={t("Protect your account with a time-based one-time password (TOTP).")}
        icon={Smartphone}
        action={
          user?.totpEnabled ? (
            <Badge variant="success">
              <ShieldCheck className="h-3 w-3" /> {t("Enabled")}
            </Badge>
          ) : (
            <Badge variant="muted">{t("Not enabled")}</Badge>
          )
        }
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-lg">
            <p className="text-sm font-semibold">{user?.totpEnabled ? t("Your account is protected") : t("Add a second layer of security")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {user?.totpEnabled
                ? t("You will be asked for a six-digit code from your authenticator app each time you sign in with a password.")
                : t("Use Google Authenticator, 1Password, Authy or any TOTP-compatible app. Recovery codes are not enabled in this build.")}
            </p>
          </div>
          {user?.totpEnabled ? (
            <Button variant="outline" className="text-destructive" onClick={() => setDisableOpen(true)}>
              <ShieldOff /> {t("Disable")}
            </Button>
          ) : (
            <Button onClick={() => setSetupOpen(true)}>
              <ShieldCheck /> {t("Set up 2FA")}
            </Button>
          )}
        </div>
      </SettingsCard>

      <SettingsCard title={t("Connected identity")} description={t("Single sign-on status for this account.")} icon={KeyRound}>
        <div className="flex items-center gap-3">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", user?.oidcConnected ? "bg-success/12 text-success" : "bg-muted text-muted-foreground")}>
            {user?.oidcConnected ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          </div>
          <div>
            <p className="text-sm font-semibold">{user?.oidcConnected ? t("OIDC account connected") : t("Local account")}</p>
            <p className="text-xs text-muted-foreground">
              {user?.oidcConnected ? t("You can sign in with your identity provider.") : t("Sign in with email and password or set up SSO through your admin.")}
            </p>
          </div>
        </div>
      </SettingsCard>

      <ActiveSessionsCard />

      <TOTPSetupDialog open={setupOpen} onOpenChange={setSetupOpen} />
      <TOTPDisableDialog open={disableOpen} onOpenChange={setDisableOpen} />
    </div>
  )
}

function CreateTokenDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<PATScope[]>(["boards:read", "items:read"])
  const [expires, setExpires] = useState("never")
  const [token, setToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  function reset() {
    setName("")
    setScopes(["boards:read", "items:read"])
    setExpires("never")
    setToken("")
    setError("")
    setCopied(false)
  }

  function toggleScope(scope: PATScope) {
    setScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]))
  }

  async function create() {
    if (!name.trim()) {
      setError(t("Give this token a name."))
      return
    }
    if (scopes.length === 0) {
      setError(t("Select at least one scope."))
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await api.post<{ token: string; pat: PAT }>("/me/pats", {
        name: name.trim(),
        scopes,
        expiresInDays: expires === "never" ? undefined : Number(expires),
      })
      setToken(res.token)
      void queryClient.invalidateQueries({ queryKey: ["pats"] })
      toast.success(t("Access token created"))
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Could not create token"))
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(token)
    setCopied(true)
    toast.success(t("Token copied"))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="max-w-lg">
        {token ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("Your new access token")}</DialogTitle>
              <DialogDescription>{t("Copy it now. For your security, it will never be shown again.")}</DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-success/30 bg-success/5 p-3">
              <code className="block break-all rounded-lg bg-background px-3 py-2 font-mono text-xs">{token}</code>
              <Button className="mt-2 w-full" size="sm" onClick={() => void copy()}>
                {copied ? <Check /> : <Copy />} {copied ? t("Copied") : t("Copy token")}
              </Button>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-amber-700 dark:text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {t("Store it in a password manager or CI secret. Anyone with this token can access the scopes you chose.")}
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>{t("Done")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("Create an access token")}</DialogTitle>
              <DialogDescription>{t("Use a PAT for scripts, CI or integrations. Tokens are scoped to your account.")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token-name">{t("Token name")}</Label>
                <Input
                  id="token-name"
                  placeholder={t("e.g. GitHub Actions")}
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Scopes")}</Label>
                <div className="space-y-1 rounded-xl border border-border p-2">
                  {(Object.keys(scopeInfo) as PATScope[]).map((scope) => (
                    <label key={scope} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-accent">
                      <Checkbox checked={scopes.includes(scope)} onCheckedChange={() => toggleScope(scope)} className="mt-0.5" />
                      <span>
                        <span className="block text-xs font-semibold">{t(scopeInfo[scope].label)}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {t(scopeInfo[scope].description)} · <code className="font-mono">{scope}</code>
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">{t("Write scopes include the matching read scope.")}</p>
              </div>
              <div className="space-y-2">
                <Label>{t("Expiration")}</Label>
                <Select value={expires} onValueChange={setExpires}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">{t("Never expires")}</SelectItem>
                    <SelectItem value="30">{t("30 days")}</SelectItem>
                    <SelectItem value="90">{t("90 days")}</SelectItem>
                    <SelectItem value="365">{t("1 year")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                {t("Cancel")}
              </Button>
              <Button onClick={() => void create()} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : <KeyRound />}
                {t("Create token")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function TokensTab() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const [revoke, setRevoke] = useState<PAT | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ["pats"],
    queryFn: () => api.get<{ tokens: PAT[] }>("/me/pats"),
  })
  const tokens = data?.tokens ?? []

  async function doRevoke() {
    if (!revoke) return
    await api.delete(`/me/pats/${revoke.id}`)
    await queryClient.invalidateQueries({ queryKey: ["pats"] })
    toast.success(t("Token revoked"))
    setRevoke(null)
  }

  return (
    <div className="space-y-5">
      <SettingsCard
        title={t("Personal access tokens")}
        description={t("Scoped credentials for the Friday API. Treat them like passwords.")}
        icon={KeyRound}
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> {t("New token")}
          </Button>
        }
      >
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold">{t("No access tokens yet")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("Create a scoped token to connect scripts and CI.")}</p>
            <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus /> {t("Create your first token")}
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {tokens.map((token) => {
              const expired = token.expiresAt ? new Date(token.expiresAt) < new Date() : false
              return (
                <div key={token.id} className="rounded-xl border border-border p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                        <KeyRound className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-bold">{token.name}</p>
                        <code className="font-mono text-[10px] text-muted-foreground">{token.prefix}••••••••</code>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {expired && <Badge variant="destructive">{t("Expired")}</Badge>}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setRevoke(token)}
                      >
                        <Trash2 /> {t("Revoke")}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {token.scopes.map((scope) => (
                      <Badge key={scope} variant="secondary" className="font-mono text-[9px]">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                    <span>{t("Created")} {formatDateValue(token.createdAt)}</span>
                    <span>{t("Last used")} {token.lastUsedAt ? timeAgo(token.lastUsedAt) : t("never")}</span>
                    <span>{token.expiresAt ? `${t("Expires")} ${formatDateTime(token.expiresAt)}` : t("Never expires")}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SettingsCard>

      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">{t("Using a token:")}</span> send{" "}
        <code className="rounded bg-background px-1 py-0.5 font-mono">Authorization: Bearer fdy_…</code> with any API request.
        {t("Browser sessions are CSRF-protected; PAT requests are not tied to a cookie.")}
      </div>

      <CreateTokenDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        open={Boolean(revoke)}
        onOpenChange={(open) => {
          if (!open) setRevoke(null)
        }}
        title={`${t("Revoke")} “${revoke?.name ?? "token"}”?`}
        description={t("Any integration using this token will immediately lose access. This cannot be undone.")}
        confirmLabel={t("Revoke token")}
        onConfirm={doRevoke}
      />
    </div>
  )
}

export default function SettingsPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get("tab")
  const tab: TabId = tabs.some((t) => t.id === tabParam) ? (tabParam as TabId) : "profile"

  function changeTab(next: TabId) {
    const p = new URLSearchParams(params)
    if (next === "profile") p.delete("tab")
    else p.set("tab", next)
    setParams(p, { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{t("Account")}</p>
        <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">{t("Settings")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("Manage your profile, security and API access.")}</p>
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <aside className="shrink-0 lg:w-56">
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1.5 lg:flex-col">
            {tabs.map((tabItem) => {
              const Icon = tabItem.icon
              const active = tab === tabItem.id
              return (
                <button
                  key={tabItem.id}
                  onClick={() => changeTab(tabItem.id)}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(tabItem.label)}
                </button>
              )
            })}
          </div>
          {user && (
            <div className="mt-4 hidden items-center gap-2 rounded-xl border border-border bg-card p-3 lg:flex">
              <UserAvatar user={user} size="md" />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{user.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
              </div>
            </div>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          {tab === "profile" && <ProfileTab />}
          {tab === "security" && <SecurityTab />}
          {tab === "tokens" && <TokensTab />}
        </div>
      </div>
    </div>
  )
}
