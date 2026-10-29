import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, CalendarDays, CheckCircle2, CircleDot, ListTodo, Search, Sparkles } from "lucide-react"
import { EmptyState } from "@/components/EmptyState"
import { StatusChip } from "@/components/StatusChip"
import { UserAvatar } from "@/components/UserAvatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { useWorkspace } from "@/lib/workspace"
import { assignees, isItemDone, itemDue, itemPriority, itemStatus } from "@/lib/board-utils"
import { cn, dueTone, formatDateValue, pluralize } from "@/lib/utils"
import type { BoardItem, User } from "@/lib/types"

type Filter = "all" | "active" | "done"

export default function MyWorkPage() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const { t } = useTranslation()
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const { data, isLoading } = useQuery({
    queryKey: ["my-items", workspace?.id],
    queryFn: () => api.get<{ items: BoardItem[] }>(`/my-items?workspaceId=${workspace?.id}`),
    enabled: Boolean(workspace),
  })
  const { data: usersData } = useQuery({
    queryKey: ["users", workspace?.id],
    queryFn: () => api.get<{ users: User[] }>(`/users?workspaceId=${workspace?.id}`),
    enabled: Boolean(workspace),
    staleTime: 60_000,
  })
  const users = usersData?.users ?? []
  const items = data?.items ?? []

  const counts = useMemo(() => {
    let active = 0
    let done = 0
    for (const item of items) {
      if (isItemDone(item.boardColumns, item.values)) done++
      else active++
    }
    return { all: items.length, active, done }
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      const done = isItemDone(item.boardColumns, item.values)
      if (filter === "active" && done) return false
      if (filter === "done" && !done) return false
      if (q && !item.name.toLowerCase().includes(q) && !item.boardName.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, filter, query])

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; color: string; icon: string; items: BoardItem[] }>()
    for (const item of filtered) {
      const entry = map.get(item.boardId) ?? { name: item.boardName, color: item.boardColor, icon: item.boardIcon, items: [] }
      entry.items.push(item)
      map.set(item.boardId, entry)
    }
    return Array.from(map.entries())
  }, [filtered])

  const filters: Array<{ id: Filter; label: string; count: number; icon: typeof ListTodo }> = [
    { id: "all", label: t("All"), count: counts.all, icon: ListTodo },
    { id: "active", label: t("Active"), count: counts.active, icon: CircleDot },
    { id: "done", label: t("Completed"), count: counts.done, icon: CheckCircle2 },
  ]

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{t("Focus")}</p>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">{t("My work")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("Every item where you are the owner in")} {workspace?.name ?? t("this workspace")}.</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/">
            {t("Browse boards")} <ArrowRight />
          </Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          {filters.map((f) => {
            const Icon = f.icon
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  filter === f.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {f.label}
                <span className="rounded-full bg-background/80 px-1.5 text-[10px] tabular-nums">{f.count}</span>
              </button>
            )
          })}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Filter your work…")}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card">
            <EmptyState
              icon={Sparkles}
              title={items.length === 0 ? t("No work assigned to you yet") : t("Nothing matches this filter")}
              description={
                items.length === 0
                  ? t("Open a board and add yourself as an owner on an item to see it here.")
                  : t("Try clearing the search or switching filters.")
              }
              action={
                items.length === 0 ? (
                  <Button asChild>
                    <Link to="/">{t("Go to boards")}</Link>
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([boardId, group]) => (
              <section key={boardId}>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-sm"
                    style={{ backgroundColor: `${group.color}1f` }}
                  >
                    {group.icon}
                  </span>
                  <h2 className="text-sm font-bold">{group.name}</h2>
                  <span className="text-[11px] text-muted-foreground">{group.items.length === 1 ? t("{{count}} item", { count: group.items.length }) : t("{{count}} items", { count: group.items.length })}</span>
                  <Link to={`/boards/${boardId}`} className="ml-auto text-[11px] font-semibold text-primary hover:underline">
                    {t("Open board")}
                  </Link>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  {group.items.map((item) => {
                    const status = itemStatus(item.boardColumns, item.values)
                    const priority = itemPriority(item.boardColumns, item.values)
                    const due = itemDue(item.boardColumns, item.values)
                    const people = assignees(item.boardColumns, item.values, users)
                    const tone = dueTone(due)
                    const done = isItemDone(item.boardColumns, item.values)
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigate(`/boards/${item.boardId}?item=${item.id}`)}
                        className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition last:border-0 hover:bg-accent/50"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                            done ? "border-success bg-success text-white" : "border-border",
                          )}
                        >
                          {done && <CheckCircle2 className="h-3 w-3" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate text-[13px] font-semibold", done && "text-muted-foreground line-through")}>
                            {item.name}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{item.boardName}</span>
                            {due && (
                              <>
                                <span>·</span>
                                <span
                                  className={cn(
                                    "flex items-center gap-0.5",
                                    tone === "danger" && "font-semibold text-destructive",
                                    tone === "warning" && "font-semibold text-amber-600 dark:text-warning",
                                  )}
                                >
                                  <CalendarDays className="h-3 w-3" /> {formatDateValue(due)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {priority && <StatusChip label={priority} compact className="hidden sm:inline-flex" />}
                        <StatusChip label={status} compact className="w-24 justify-center" />
                        {people[0] && <UserAvatar user={people[0]} size="xs" className="hidden sm:flex" />}
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
