import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import {
  Activity as ActivityIcon,
  CalendarRange,
  Columns3,
  Copy,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  Table2,
  Trash2,
  UsersRound,
} from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { AvatarStack } from "@/components/UserAvatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { assigneeIds } from "@/lib/board-utils"
import { cn, pluralize } from "@/lib/utils"
import type { Board, BoardPermissions, Group, Item, User } from "@/lib/types"

export type BoardView = "table" | "kanban" | "gantt" | "activity"

const tabs: Array<{ id: BoardView; label: string; icon: typeof Table2 }> = [
  { id: "table", label: "Main table", icon: Table2 },
  { id: "kanban", label: "Kanban", icon: Columns3 },
  { id: "gantt", label: "Gantt", icon: CalendarRange },
  { id: "activity", label: "Activity", icon: ActivityIcon },
]

export function BoardHeader({
  board,
  groups,
  items,
  users,
  view,
  onViewChange,
  onNewItem,
  onRename,
  onDelete,
  permissions,
  onUpdateVisibility,
  onShare,
  onOpenAgent,
}: {
  board: Board
  groups: Group[]
  items: Item[]
  users: User[]
  view: BoardView
  onViewChange: (view: BoardView) => void
  onNewItem: () => void
  onRename: (name: string) => void
  onDelete: () => Promise<void>
  permissions: BoardPermissions
  onUpdateVisibility: (visibility: "workspace" | "private") => void
  onShare: () => void
  onOpenAgent: () => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(board.name)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => setName(board.name), [board.name])

  const involvedIds = new Set<string>([board.ownerId])
  for (const item of items) {
    for (const id of assigneeIds(board.columns, item.values)) involvedIds.add(id)
  }
  const involved = users.filter((u) => involvedIds.has(u.id))

  function commit() {
    setEditing(false)
    const next = name.trim()
    if (next && next !== board.name) onRename(next)
    else setName(board.name)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success(t("Board link copied"))
    } catch {
      toast.error(t("Could not copy link"))
    }
  }

  return (
    <div className="border-b border-border bg-background">
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-sm"
              style={{ backgroundColor: `${board.color}20` }}
            >
              {board.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {editing ? (
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commit()
                      if (e.key === "Escape") {
                        setName(board.name)
                        setEditing(false)
                      }
                    }}
                    className="w-full max-w-md rounded-md border border-primary/50 bg-background px-2 py-0.5 text-[24px] font-extrabold tracking-tight outline-none ring-2 ring-primary/10"
                  />
                ) : (
                  <button
                    onClick={() => permissions.canEdit && setEditing(true)}
                    className="group flex min-w-0 items-center gap-2 text-left"
                  >
                    <h1 className="truncate text-[24px] font-extrabold tracking-tight">{board.name}</h1>
                    {permissions.canEdit && (
                      <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                    )}
                  </button>
                )}
                <span className="hidden rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:inline">
                  {items.length === 1 ? t("{{count}} item", { count: items.length }) : t("{{count}} items", { count: items.length })}
                </span>
                <span className="hidden items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:inline-flex">
                  {board.visibility === "private" ? <Lock className="h-2.5 w-2.5" /> : <UsersRound className="h-2.5 w-2.5" />}
                  {board.visibility === "private" ? t("Private") : t("Workspace")}
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                {board.description || t("A shared space for your team to plan, track and ship work.")}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {involved.length > 0 && (
              <div className="mr-1 hidden items-center gap-2 sm:flex">
                <AvatarStack users={involved} max={5} size="sm" />
              </div>
            )}
            <Button variant="soft" onClick={onOpenAgent} className="px-2.5 sm:px-4">
              <Sparkles />
              <span className="hidden sm:inline">{t("Ask Friday")}</span>
            </Button>
            {permissions.canEdit && (
              <Button onClick={onNewItem}>
                <Plus /> {t("New item")}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={t("Board actions")}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {permissions.canEdit && (
                  <DropdownMenuItem onSelect={() => setEditing(true)}>
                    <Pencil /> {t("Rename board")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => void copyLink()}>
                  <Copy /> {t("Copy board link")}
                </DropdownMenuItem>
                {permissions.canAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onShare}>
                      <Share2 /> {t("Share and permissions")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        onUpdateVisibility(board.visibility === "private" ? "workspace" : "private")
                      }
                    >
                      {board.visibility === "private" ? <UsersRound /> : <Lock />}
                      {board.visibility === "private" ? t("Share with workspace") : t("Make private")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
                      <Trash2 /> {t("Delete board")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = view === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onViewChange(tab.id)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition hover:text-foreground",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(tab.label)}
                {active && <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-primary" />}
              </button>
            )
          })}
          <div className="ml-auto hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:flex">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: board.color }} />
            {groups.length === 1 ? t("{{count}} group", { count: groups.length }) : t("{{count}} groups", { count: groups.length })}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`${t("Delete")} “${board.name}”?`}
        description={t("This permanently deletes the board, its groups, items and comments. This cannot be undone.")}
        confirmLabel={t("Delete board")}
        onConfirm={async () => {
          await onDelete()
          navigate("/")
        }}
      />
    </div>
  )
}
