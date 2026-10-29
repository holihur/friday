import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Crown, Loader2, Lock, Search, Shield, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { UserAvatar } from "@/components/UserAvatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Board, BoardMembersPayload, BoardMemberView } from "@/lib/types"

const boardRoles = ["viewer", "commenter", "editor", "admin"] as const
const roleLabel: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  editor: "editor",
  commenter: "commenter",
  viewer: "viewer",
  none: "none",
}

export function BoardShareDialog({
  open,
  onOpenChange,
  board,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  board: Board
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [savingUser, setSavingUser] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ["board-members", board.id],
    queryFn: () => api.get<BoardMembersPayload>(`/boards/${board.id}/members`),
    enabled: open,
  })
  const visibility = data?.visibility ?? (board.visibility || "workspace")
  const members = useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = data?.members ?? []
    if (!q) return all
    return all.filter((m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q))
  }, [data, search])

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["board-members", board.id] })
    void queryClient.invalidateQueries({ queryKey: ["board", board.id] })
    void queryClient.invalidateQueries({ queryKey: ["boards"] })
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] })
  }

  async function changeVisibility(next: "workspace" | "private") {
    if (next === visibility) return
    try {
      await api.patch(`/boards/${board.id}`, { visibility: next })
      toast.success(next === "private" ? t("Board is now private") : t("Board is shared with the workspace"))
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? t(err.message) : t("Could not update visibility"))
    }
  }

  async function changeRole(member: BoardMemberView, value: string) {
    setSavingUser(member.user.id)
    try {
      if (value === "default") {
        await api.delete(`/boards/${board.id}/members/${member.user.id}`)
      } else {
        await api.patch(`/boards/${board.id}/members/${member.user.id}`, { role: value })
      }
      toast.success(t("Board access updated"))
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? t(err.message) : t("Could not update board access"))
    } finally {
      setSavingUser(null)
    }
  }

  function roleOptions(member: BoardMemberView) {
    return (
      <>
        <SelectItem value="default">
          {visibility === "private" ? t("No access") : t("Workspace default")}
        </SelectItem>
        {boardRoles.map((role) => (
          <SelectItem key={role} value={role}>
            {t(roleLabel[role])}
          </SelectItem>
        ))}
      </>
    )
  }

  function selectValue(member: BoardMemberView) {
    if (member.explicit) return member.role
    return "default"
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Shield className="h-5 w-5" />
          </div>
          <DialogTitle>{t("Share and permissions")}</DialogTitle>
          <DialogDescription>
            {t("Control who can open this board and what they can change.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => void changeVisibility("workspace")}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 text-left transition",
              visibility === "workspace" ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-accent/50",
            )}
          >
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", visibility === "workspace" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              <UsersRound className="h-4 w-4" />
            </span>
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {t("Workspace")} {visibility === "workspace" && <Check className="h-3.5 w-3.5 text-primary" />}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{t("Everyone in the workspace can access this board.")}</span>
            </span>
          </button>
          <button
            onClick={() => void changeVisibility("private")}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 text-left transition",
              visibility === "private" ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-accent/50",
            )}
          >
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", visibility === "private" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              <Lock className="h-4 w-4" />
            </span>
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {t("Private")} {visibility === "private" && <Check className="h-3.5 w-3.5 text-primary" />}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{t("Only people listed below can access this board.")}</span>
            </span>
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Find a workspace member…")} className="h-8 pl-8 text-xs" />
        </div>

        <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1 scrollbar-thin">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-11 rounded-xl" />
              <Skeleton className="h-11 rounded-xl" />
              <Skeleton className="h-11 rounded-xl" />
            </div>
          ) : members.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">{t("No workspace members found.")}</p>
          ) : (
            members.map((member) => {
              const impliedAdmin = !member.explicit && (member.workspaceRole === "owner" || member.workspaceRole === "admin")
              return (
                <div key={member.user.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-accent/40">
                  <UserAvatar user={member.user} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-xs font-semibold">
                      {member.user.name}
                      {member.isOwner && <Crown className="h-3 w-3 text-amber-500" />}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">{member.user.email}</p>
                  </div>
                  {member.isOwner ? (
                    <Badge variant="default">{t("Board owner")}</Badge>
                  ) : impliedAdmin ? (
                    <Badge variant="info">{t("Admin")}</Badge>
                  ) : (
                    <div className="flex w-[140px] items-center gap-1.5">
                      <Select
                        value={selectValue(member)}
                        onValueChange={(value) => void changeRole(member, value)}
                        disabled={savingUser === member.user.id}
                      >
                        <SelectTrigger className="h-7 text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>{roleOptions(member)}</SelectContent>
                      </Select>
                      {savingUser === member.user.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[10px] text-muted-foreground">
          <Shield className="h-3.5 w-3.5 shrink-0" />
          {t("Viewers can read, commenters can comment, editors can change items, admins can manage the board.")}
        </div>
      </DialogContent>
    </Dialog>
  )
}
