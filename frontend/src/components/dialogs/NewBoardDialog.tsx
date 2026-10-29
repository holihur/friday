import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowRight, LayoutTemplate, ListChecks, Loader2, Map, SquareKanban, Zap } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, ApiError } from "@/lib/api"
import { useWorkspace } from "@/lib/workspace"
import { BOARD_COLORS, BOARD_ICONS } from "@/lib/colors"
import { cn } from "@/lib/utils"
import type { Board } from "@/lib/types"

const templates = [
  { id: "project", name: "Project tracker", description: "Status, owner, priority and dates", icon: ListChecks },
  { id: "roadmap", name: "Roadmap", description: "Now, next and later planning", icon: Map },
  { id: "sprint", name: "Sprint board", description: "Backlog to shipped, with points", icon: Zap },
  { id: "blank", name: "Blank board", description: "Start with just the essentials", icon: SquareKanban },
]

export function NewBoardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [template, setTemplate] = useState("project")
  const [color, setColor] = useState(BOARD_COLORS[0].value)
  const [icon, setIcon] = useState("🚀")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { workspace, refresh } = useWorkspace()

  function reset() {
    setName("")
    setTemplate("project")
    setColor(BOARD_COLORS[0].value)
    setIcon("🚀")
    setError("")
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError(t("Give your board a name to get started."))
      return
    }
    if (!workspace) {
      setError(t("Create a workspace first."))
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await api.post<{ board: Board }>("/boards", {
        workspaceId: workspace.id,
        name: name.trim(),
        template,
        color,
        icon,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["boards", workspace.id] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", workspace.id] }),
        refresh(),
      ])
      toast.success(t("Board created"), { description: `“${res.board.name}” ${t("is ready for work.")}` })
      onOpenChange(false)
      reset()
      navigate(`/boards/${res.board.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Could not create board"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next && !loading) setError("")
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LayoutTemplate className="h-5 w-5" />
          </div>
          <DialogTitle>{t("Create a new board")}</DialogTitle>
          <DialogDescription>
            {workspace ? `${t("In")} ${workspace.name}. ` : ""}{t("Pick a starting point — columns, groups and views can be shaped later.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="board-name">{t("Board name")}</Label>
            <Input
              id="board-name"
              autoFocus
              placeholder={t("e.g. Product roadmap")}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("Template")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((tItem) => {
                const Icon = tItem.icon
                const active = template === tItem.id
                return (
                  <button
                    key={tItem.id}
                    type="button"
                    onClick={() => setTemplate(tItem.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3 text-left transition",
                      active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-accent/60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{t(tItem.name)}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{t(tItem.description)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("Color")}</Label>
              <div className="flex flex-wrap gap-2">
                {BOARD_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.name}
                    onClick={() => setColor(c.value)}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 border-background ring-offset-2 ring-offset-background transition hover:scale-110",
                      color === c.value && "ring-2 ring-foreground/60",
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Icon")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {BOARD_ICONS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIcon(i)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-accent",
                      icon === i && "bg-primary/10 ring-1 ring-primary/40",
                    )}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t("Cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            {t("Create board")} <ArrowRight />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
