import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  LayoutGrid,
  ListTodo,
  Loader2,
  Plus,
  Sparkles,
  TrendingUp,
} from "lucide-react"
import { NewBoardDialog } from "@/components/dialogs/NewBoardDialog"
import { EmptyState } from "@/components/EmptyState"
import { UserAvatar } from "@/components/UserAvatar"
import { StatusChip } from "@/components/StatusChip"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useWorkspace } from "@/lib/workspace"
import { assignees, itemDue, itemPriority, itemStatus } from "@/lib/board-utils"
import { cn, dueTone, formatDateValue, formatFullDate, pluralize, timeAgo } from "@/lib/utils"
import type { BoardItem, DashboardData, User } from "@/lib/types"

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tint,
}: {
  label: string
  value: number
  hint: string
  icon: typeof ListTodo
  tint: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="mt-1 text-[26px] font-extrabold leading-none tracking-tight tabular-nums">{value}</p>
        </div>
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", tint)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-[11px] font-medium text-muted-foreground">{hint}</p>
    </div>
  )
}

function MyWorkRow({ item, users, onOpen }: { item: BoardItem; users: User[]; onOpen: () => void }) {
  const status = itemStatus(item.boardColumns, item.values)
  const priority = itemPriority(item.boardColumns, item.values)
  const due = itemDue(item.boardColumns, item.values)
  const people = assignees(item.boardColumns, item.values, users)
  const tone = dueTone(due)
  return (
    <button onClick={onOpen} className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-accent">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
        style={{ backgroundColor: `${item.boardColor}1c` }}
      >
        {item.boardIcon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{item.name}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">{item.boardName}</span>
          {due && (
            <>
              <span>·</span>
              <span className={cn("inline-flex items-center gap-0.5", tone === "danger" && "text-destructive", tone === "warning" && "text-amber-600")}>
                <CalendarDays className="h-3 w-3" /> {formatDateValue(due)}
              </span>
            </>
          )}
        </span>
      </span>
      {priority && <StatusChip label={priority} compact className="hidden sm:inline-flex" />}
      <StatusChip label={status} compact />
      {people[0] && <UserAvatar user={people[0]} size="xs" className="hidden sm:flex" />}
    </button>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const { workspace, isLoading: workspaceLoading } = useWorkspace()
  const navigate = useNavigate()
  const [newBoardOpen, setNewBoardOpen] = useState(false)
  const canEdit = workspace?.role !== "guest"

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", workspace?.id],
    queryFn: () => api.get<DashboardData>(`/dashboard?workspaceId=${workspace?.id}`),
    enabled: Boolean(workspace),
  })
  const { data: usersData } = useQuery({
    queryKey: ["users", workspace?.id],
    queryFn: () => api.get<{ users: User[] }>(`/users?workspaceId=${workspace?.id}`),
    enabled: Boolean(workspace),
    staleTime: 60_000,
  })
  const users = usersData?.users ?? []
  const stats = data?.stats ?? { boards: 0, items: 0, myItems: 0, inProgress: 0, done: 0 }
  const boards = data?.boards ?? []
  const activity = data?.activity ?? []
  const myItems = data?.myItems ?? []
  const hour = new Date().getHours()
  const greeting = hour < 12 ? t("Good morning") : hour < 18 ? t("Good afternoon") : t("Good evening")
  const firstName = user?.name.split(" ")[0] ?? "there"
  const owner = (id: string) => users.find((u) => u.id === id)

  function openItem(item: BoardItem) {
    navigate(`/boards/${item.boardId}?item=${item.id}`)
  }

  if (workspaceLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!workspace) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        {t("No workspace found.")}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatFullDate(new Date())}
          </p>
          <h1 className="mt-1 text-[26px] font-extrabold tracking-tight sm:text-[30px]">
            {greeting}, {firstName} <span className="inline-block">👋</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Here is what is moving across {{workspace}} today.", {
              workspace: workspace?.name ?? t("your workspace"),
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/my-work">
              <ListTodo /> {t("My work")}
            </Link>
          </Button>
          {canEdit && (
            <Button onClick={() => setNewBoardOpen(true)}>
              <Plus /> {t("New board")}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("Assigned to me")} value={stats.myItems} hint={t("Across every board")} icon={ListTodo} tint="bg-primary/10 text-primary" />
        <StatCard label={t("In progress")} value={stats.inProgress} hint={t("Currently being worked on")} icon={CircleDot} tint="bg-warning/15 text-amber-600 dark:text-warning" />
        <StatCard label={t("Completed")} value={stats.done} hint={t("Done or launched")} icon={CheckCircle2} tint="bg-success/12 text-success" />
        <StatCard label={t("Boards")} value={stats.boards} hint={stats.items === 1 ? t("{{count}} item", { count: stats.items }) : t("{{count}} items", { count: stats.items })} icon={LayoutGrid} tint="bg-info/12 text-info" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.9fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold tracking-tight">{t("Your boards")}</h2>
              <p className="text-xs text-muted-foreground">{t("Jump back into the work that matters.")}</p>
            </div>
            {canEdit && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setNewBoardOpen(true)}>
                <Plus /> {t("New")}
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[186px] rounded-2xl" />
              ))}
            </div>
          ) : boards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card">
              <EmptyState
                icon={Sparkles}
                title={t("Your workspace is a blank canvas")}
                description={t("Create your first board and invite the work in.")}
                action={
                  canEdit ? (
                    <Button onClick={() => setNewBoardOpen(true)}>
                      <Plus /> {t("Create a board")}
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {boards.map((board) => {
                const pct = board.itemCount === 0 ? 0 : Math.round((board.doneCount / board.itemCount) * 100)
                const boardOwner = owner(board.ownerId)
                return (
                  <Link
                    key={board.id}
                    to={`/boards/${board.id}`}
                    className="group relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <div className="h-1.5 w-full" style={{ backgroundColor: board.color }} />
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                          style={{ backgroundColor: `${board.color}1f` }}
                        >
                          {board.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-[15px] font-bold group-hover:text-primary">{board.name}</h3>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {board.description || t("No description yet — add context for your team.")}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </div>

                      <div className="mt-4 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                        <span>{board.itemCount === 1 ? t("{{count}} item", { count: board.itemCount }) : t("{{count}} items", { count: board.itemCount })}</span>
                        <span className={cn(pct === 100 && "text-success")}>{t("{{pct}}% done", { pct })}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: board.color }} />
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {boardOwner ? (
                            <>
                              <UserAvatar user={boardOwner} size="xs" />
                              <span className="text-[10px] font-medium text-muted-foreground">{boardOwner.name}</span>
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">{t("Workspace board")}</span>
                          )}
                        </div>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock3 className="h-3 w-3" />
                          {timeAgo(board.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
              {canEdit && (
                <button
                  onClick={() => setNewBoardOpen(true)}
                  className="flex min-h-[186px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 text-muted-foreground transition hover:border-primary/40 hover:bg-primary/[0.03] hover:text-primary"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-semibold">{t("Create another board")}</span>
                </button>
              )}
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold tracking-tight">{t("My work")}</h2>
                <p className="text-xs text-muted-foreground">{t("Assigned to you")}</p>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                <Link to="/my-work">
                  {t("View all")} <ArrowRight />
                </Link>
              </Button>
            </div>
            <div className="mt-2 -mx-2">
              {isLoading ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : myItems.length === 0 ? (
                <div className="px-2 py-8 text-center">
                  <p className="text-sm font-semibold">{t("Nothing assigned yet")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("Add yourself as an owner on any item.")}</p>
                </div>
              ) : (
                myItems.map((item) => <MyWorkRow key={item.id} item={item} users={users} onOpen={() => openItem(item)} />)
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-1.5 text-base font-extrabold tracking-tight">
                  <TrendingUp className="h-4 w-4 text-primary" /> {t("Recent activity")}
                </h2>
                <p className="text-xs text-muted-foreground">{t("The latest updates in your workspace")}</p>
              </div>
            </div>
            <div className="mt-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-9" />
                  ))}
                </div>
              ) : activity.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("No activity yet. Start moving work.")}</p>
              ) : (
                <div className="relative space-y-4 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
                  {activity.slice(0, 6).map((act) => (
                    <div key={act.id} className="relative flex items-start gap-2.5">
                      <UserAvatar name={act.userName} color={act.userColor} size="xs" className="relative z-10 ring-2 ring-card" />
                      <div className="min-w-0 flex-1 pb-0.5">
                        <p className="text-[12px] leading-snug">
                          <span className="font-semibold">{act.userName.split(" ")[0]}</span>{" "}
                          <span className="text-muted-foreground">{t(act.action)}</span>{" "}
                          {act.itemName && <span className="font-medium">“{act.itemName}”</span>}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: act.boardColor }}
                          />
                          {act.boardName} · {timeAgo(act.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <NewBoardDialog open={newBoardOpen} onOpenChange={setNewBoardOpen} />
    </div>
  )
}
