import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Building2,
  Check,
  Copy,
  Crown,
  Loader2,
  Mail,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { UserAvatar } from "@/components/UserAvatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { useWorkspace } from "@/lib/workspace"
import { cn, formatDateValue, timeAgo } from "@/lib/utils"
import type { Invitation, WorkspaceMember } from "@/lib/types"

const roleLabel: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  member: "member",
  guest: "guest",
}

const roleBadge: Record<string, "default" | "info" | "secondary" | "muted"> = {
  owner: "default",
  admin: "info",
  member: "secondary",
  guest: "muted",
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const { workspace } = useWorkspace()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("member")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [invite, setInvite] = useState<Invitation | null>(null)
  const [copied, setCopied] = useState(false)

  function reset() {
    setEmail("")
    setRole("member")
    setError("")
    setInvite(null)
    setCopied(false)
  }

  async function create() {
    if (!workspace) return
    if (!email.trim()) {
      setError(t("Enter an email address."))
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await api.post<{ invitation: Invitation; emailSent: boolean }>(
        `/workspaces/${workspace.id}/invitations`,
        { email: email.trim(), role },
      )
      setInvite({ ...res.invitation, emailSent: res.emailSent })
      void queryClient.invalidateQueries({ queryKey: ["workspace-invitations", workspace.id] })
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      toast.success(t("Invitation ready"))
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Could not create invitation"))
    } finally {
      setLoading(false)
    }
  }

  async function copyLink() {
    if (!invite?.inviteUrl) return
    await navigator.clipboard.writeText(invite.inviteUrl)
    setCopied(true)
    toast.success(t("Invite link copied"))
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
      <DialogContent className="max-w-md">
        {invite ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("Invitation created")}</DialogTitle>
              <DialogDescription>
                {invite.emailSent
                  ? `${t("An invitation email was sent to")} ${invite.email}.`
                  : `${t("Send this link to")} ${invite.email}.`}{" "}
                {t("It expires in 7 days.")}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-success/30 bg-success/5 p-3">
              <code className="block max-h-24 overflow-y-auto break-all rounded-lg bg-background px-3 py-2 font-mono text-[11px]">
                {invite.inviteUrl}
              </code>
              <Button className="mt-2 w-full" size="sm" onClick={() => void copyLink()}>
                {copied ? <Check /> : <Copy />} {copied ? t("Copied") : t("Copy invite link")}
              </Button>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {invite.emailSent
                ? t("You can also copy the link as a backup. The invitation is bound to this email address.")
                : t("Email delivery is not configured, so copy the link manually. The invitation is bound to this email address.")}
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>{t("Done")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UserPlus className="h-5 w-5" />
              </div>
              <DialogTitle>{t("Invite to")} {workspace?.name}</DialogTitle>
              <DialogDescription>{t("They will receive a link to join this workspace.")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">{t("Email")}</Label>
                <Input
                  id="invite-email"
                  type="email"
                  autoFocus
                  placeholder="colleague@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void create()
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Role")}</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">{t("Member — can create and edit boards")}</SelectItem>
                    <SelectItem value="guest">{t("Guest — only explicitly shared boards")}</SelectItem>
                    {workspace?.role === "owner" && <SelectItem value="admin">{t("Admin — can manage members")}</SelectItem>}
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
                {loading ? <Loader2 className="animate-spin" /> : <UserPlus />}
                {t("Create invite")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function WorkspacePage() {
  const { workspace, refresh } = useWorkspace()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState(workspace?.name ?? "")
  const [saving, setSaving] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMember | null>(null)
  const canManage = workspace?.role === "owner" || workspace?.role === "admin"
  const isOwner = workspace?.role === "owner"

  useEffect(() => setName(workspace?.name ?? ""), [workspace?.name])

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["workspace-members", workspace?.id],
    queryFn: () => api.get<{ members: WorkspaceMember[] }>(`/workspaces/${workspace?.id}/members`),
    enabled: Boolean(workspace) && workspace?.role !== "guest",
  })
  const members = membersData?.members ?? []

  const { data: invitesData, isLoading: invitesLoading } = useQuery({
    queryKey: ["workspace-invitations", workspace?.id],
    queryFn: () => api.get<{ invitations: Invitation[] }>(`/workspaces/${workspace?.id}/invitations`),
    enabled: Boolean(workspace) && canManage,
  })
  const invitations = invitesData?.invitations ?? []

  if (!workspace) {
    return <div className="p-10 text-center text-sm text-muted-foreground">{t("No workspace found.")}</div>
  }

  async function saveName() {
    if (!name.trim() || name.trim() === workspace!.name) return
    setSaving(true)
    try {
      await api.patch(`/workspaces/${workspace!.id}`, { name: name.trim() })
      await refresh()
      toast.success(t("Workspace renamed"))
    } catch (err) {
      toast.error(err instanceof ApiError ? t(err.message) : t("Could not rename workspace"))
      setName(workspace!.name)
    } finally {
      setSaving(false)
    }
  }

  async function changeRole(userId: string, role: string) {
    try {
      await api.patch(`/workspaces/${workspace!.id}/members/${userId}`, { role })
      await queryClient.invalidateQueries({ queryKey: ["workspace-members", workspace!.id] })
      await refresh()
      toast.success(t("Role updated"))
    } catch (err) {
      toast.error(err instanceof ApiError ? t(err.message) : t("Could not update role"))
    }
  }

  async function removeMember() {
    if (!removeTarget) return
    try {
      await api.delete(`/workspaces/${workspace!.id}/members/${removeTarget.user.id}`)
      await queryClient.invalidateQueries({ queryKey: ["workspace-members", workspace!.id] })
      await refresh()
      toast.success(t("Member removed"))
      setRemoveTarget(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? t(err.message) : t("Could not remove member"))
    }
  }

  async function revokeInvite(invitation: Invitation) {
    try {
      await api.delete(`/workspaces/${workspace!.id}/invitations/${invitation.id}`)
      await queryClient.invalidateQueries({ queryKey: ["workspace-invitations", workspace!.id] })
      toast.success(t("Invitation revoked"))
    } catch (err) {
      toast.error(err instanceof ApiError ? t(err.message) : t("Could not revoke invitation"))
    }
  }

  function canChangeRole(target: WorkspaceMember) {
    if (!canManage || target.role === "owner") return false
    if (workspace!.role === "admin" && target.role === "admin") return false
    return true
  }

  function canRemove(target: WorkspaceMember) {
    if (!canManage || target.role === "owner") return false
    if (workspace!.role === "admin" && target.role === "admin") return false
    return true
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            <Building2 className="h-3 w-3" /> {t("Workspace")}
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-[28px] font-extrabold tracking-tight">
            {workspace.name}
            <Badge variant={roleBadge[workspace.role]} className="capitalize">
              {t(roleLabel[workspace.role])}
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {workspace.memberCount === 1 ? t("{{count}} member", { count: workspace.memberCount }) : t("{{count}} members", { count: workspace.memberCount })} ·{" "}
            {workspace.boardCount === 1 ? t("{{count}} board", { count: workspace.boardCount }) : t("{{count}} boards", { count: workspace.boardCount })}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus /> {t("Invite people")}
          </Button>
        )}
      </div>

      {canManage && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-bold">{t("Workspace name")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("Visible to every member of this workspace.")}</p>
          </div>
          <div className="flex flex-col gap-2 p-5 sm:flex-row">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-md" maxLength={80} />
            <Button onClick={() => void saveName()} disabled={saving || !name.trim() || name.trim() === workspace.name}>
              {saving && <Loader2 className="animate-spin" />}
              {t("Save")}
            </Button>
          </div>
        </section>
      )}

      <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-bold">{t("Members")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("People with access to this workspace.")}</p>
          </div>
          <Badge variant="secondary">
            <Users className="h-3 w-3" /> {members.length}
          </Badge>
        </div>
        <div>
          {membersLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
            </div>
          ) : members.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t("No members found.")}</p>
          ) : (
            members.map((member) => (
              <div
                key={member.user.id}
                className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 last:border-0"
              >
                <UserAvatar user={member.user} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {member.user.name}
                    {member.role === "owner" && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{member.user.email}</p>
                </div>
                <span className="hidden text-[10px] text-muted-foreground sm:block">{t("Joined")} {formatDateValue(member.joinedAt)}</span>
                {canChangeRole(member) ? (
                  <Select value={member.role} onValueChange={(role) => void changeRole(member.user.id, role)}>
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">{t("Member")}</SelectItem>
                      <SelectItem value="guest">{t("Guest")}</SelectItem>
                      {isOwner && <SelectItem value="admin">{t("Admin")}</SelectItem>}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant={roleBadge[member.role]} className="capitalize">
                    {t(roleLabel[member.role])}
                  </Badge>
                )}
                {canRemove(member) && (
                  <Button
                    variant="ghost"
                    size="iconSm"
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setRemoveTarget(member)}
                    title={t("Remove member")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {canManage && (
        <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-1.5 text-sm font-bold">
              <Mail className="h-4 w-4 text-muted-foreground" /> {t("Pending invitations")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("Invitations expire after 7 days.")}</p>
          </div>
          {invitesLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 rounded-xl" />
              <Skeleton className="h-10 rounded-xl" />
            </div>
          ) : invitations.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-muted-foreground">{t("No pending invitations.")}</p>
          ) : (
            invitations.map((invitation) => (
              <div key={invitation.id} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 last:border-0">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{invitation.email}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t("Invited")} {timeAgo(invitation.createdAt)} · {t("expires")} {formatDateValue(invitation.expiresAt)}
                  </p>
                </div>
                <Badge variant={roleBadge[invitation.role]} className="capitalize">
                  {t(roleLabel[invitation.role])}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void revokeInvite(invitation)}
                >
                  {t("Revoke")}
                </Button>
              </div>
            ))
          )}
        </section>
      )}

      {!canManage && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <Shield className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-bold">{t("You are a")} {t(workspace.role)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Ask a workspace owner or admin to change your role or invite more people.")}
            </p>
          </div>
        </div>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title={`${t("Remove")} ${removeTarget?.user.name ?? t("member")}?`}
        description={t("They will immediately lose access to this workspace and all of its boards.")}
        confirmLabel={t("Remove member")}
        onConfirm={removeMember}
      />
    </div>
  )
}
