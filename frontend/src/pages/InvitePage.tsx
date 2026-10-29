import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, ArrowRight, Building2, Loader2, Mail, ShieldCheck, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { AuthLayout } from "@/components/auth/AuthLayout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { Invitation, Workspace } from "@/lib/types"

const roleLabel: Record<string, string> = { owner: "owner", admin: "admin", member: "member", guest: "guest" }

export default function InvitePage() {
  const { token = "" } = useParams()
  const { user, isLoading: authLoading, logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState("")
  const from = `/invite/${token}`

  const { data, isLoading, isError } = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api.get<Invitation>(`/invitations/${token}`),
    enabled: Boolean(token),
    retry: false,
  })
  const invitation = data
  const emailMatches = Boolean(user && invitation && user.email.toLowerCase() === invitation.email.toLowerCase())

  async function accept() {
    if (!invitation || !user) return
    setAccepting(true)
    setError("")
    try {
      const res = await api.post<{ workspace: Workspace }>(`/invitations/${token}/accept`)
      localStorage.setItem("friday-workspace-id", res.workspace.id)
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      toast.success(`${t("Welcome to")} ${res.workspace.name}`, { description: t("You can start collaborating now.") })
      navigate("/", { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Could not accept invitation"))
    } finally {
      setAccepting(false)
    }
  }

  return (
    <AuthLayout
      title={invitation ? `${t("Join")} ${invitation.workspaceName ?? t("Workspace")}` : t("Workspace invitation")}
      subtitle={t("You have been invited to collaborate in a Friday workspace.")}
      footer={
        <Link to="/login" className="font-semibold text-primary hover:underline">
          {t("Back to sign in")}
        </Link>
      }
    >
      {isLoading || authLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ) : isError || !invitation ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
          <h3 className="mt-3 text-sm font-bold">{t("Invitation unavailable")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("The link is invalid, expired or was revoked.")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-extrabold">{invitation.workspaceName}</p>
                <p className="text-xs text-muted-foreground">
                  {t("Invited by")} {invitation.inviterName || t("a workspace admin")}
                </p>
              </div>
              <Badge variant="secondary" className="capitalize">
                {t(roleLabel[invitation.role] ?? invitation.role)}
              </Badge>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
              <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{invitation.email}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>
                {invitation.role === "guest"
                  ? t("Guests only see boards explicitly shared with them.")
                  : invitation.role === "member"
                    ? t("Members can create and edit workspace boards.")
                    : t("This role can manage workspace members and settings.")}
              </span>
            </div>
          </div>

          {user ? (
            emailMatches ? (
              <>
                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {error}
                  </div>
                )}
                <Button className="w-full" size="lg" onClick={() => void accept()} disabled={accepting}>
                  {accepting ? <Loader2 className="animate-spin" /> : <UserPlus />}
                  {t("Accept invitation")} <ArrowRight />
                </Button>
              </>
            ) : (
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-xs text-amber-800 dark:text-warning">
                <p className="font-semibold">{t("You are signed in as")} {user.email}</p>
                <p className="mt-1">
                  {t("This invitation was sent to")} <strong>{invitation.email}</strong>. {t("Sign in with that address to accept it.")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void logout()}
                >
                  {t("Switch account")}
                </Button>
              </div>
            )
          ) : (
            <div className="space-y-2">
              <Button className="w-full" size="lg" asChild>
                <Link to="/login" state={{ from }}>
                  {t("Sign in to accept")} <ArrowRight />
                </Link>
              </Button>
              <Button className="w-full" variant="outline" asChild>
                <Link to="/register" state={{ from }}>
                  {t("Create an account")}
                </Link>
              </Button>
              <p className="pt-1 text-center text-[11px] text-muted-foreground">
                {t("Use")} <span className="font-semibold text-foreground">{invitation.email}</span> {t("when signing in.")}
              </p>
            </div>
          )}
        </div>
      )}
    </AuthLayout>
  )
}
