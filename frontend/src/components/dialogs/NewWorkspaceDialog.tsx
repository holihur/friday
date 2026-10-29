import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Building2, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, ApiError } from "@/lib/api"
import { useWorkspace } from "@/lib/workspace"
import type { Workspace } from "@/lib/types"

export function NewWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { setWorkspace, refresh } = useWorkspace()
  const navigate = useNavigate()

  async function create() {
    if (!name.trim()) {
      setError(t("Give your workspace a name."))
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await api.post<{ workspace: Workspace }>("/workspaces", { name: name.trim() })
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["boards"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ])
      setWorkspace(res.workspace.id)
      toast.success(t("Workspace created"), { description: `${t("You are the owner of")} ${res.workspace.name}.` })
      onOpenChange(false)
      setName("")
      navigate("/")
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Could not create workspace"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <DialogTitle>{t("Create a workspace")}</DialogTitle>
          <DialogDescription>
            {t("A separate space for a team, client or department. You can invite members after creating it.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">{t("Workspace name")}</Label>
            <Input
              id="workspace-name"
              autoFocus
              maxLength={80}
              placeholder={t("e.g. Acme Product")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create()
              }}
            />
          </div>
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
          <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
            <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("You will be the workspace owner and can invite admins, members and guests.")}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t("Cancel")}
          </Button>
          <Button onClick={() => void create()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Building2 />}
            {t("Create workspace")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
