import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, Loader2, Sparkles } from "lucide-react"
import { ActivityView } from "@/components/board/ActivityView"
import { BoardHeader, type BoardView } from "@/components/board/BoardHeader"
import { BoardTable } from "@/components/board/BoardTable"
import { BoardShareDialog } from "@/components/board/BoardShareDialog"
import { AgentDrawer } from "@/components/board/AgentDrawer"
import { ItemDrawer } from "@/components/board/ItemDrawer"
import { GanttView } from "@/components/board/GanttView"
import { KanbanView } from "@/components/board/KanbanView"
import { NewItemDialog } from "@/components/dialogs/NewItemDialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { useBoardMutations } from "@/lib/board-mutations"
import { useWorkspace } from "@/lib/workspace"
import { BOARD_COLORS } from "@/lib/colors"
import { cn } from "@/lib/utils"
import type { BoardPayload, ColumnType, User } from "@/lib/types"

const viewValues: BoardView[] = ["table", "kanban", "gantt", "activity"]

const columnTitles: Record<ColumnType, string> = {
  status: "Status",
  text: "Notes",
  people: "Owner",
  date: "Date",
  priority: "Priority",
  numbers: "Numbers",
  checkbox: "Checkbox",
}

export default function BoardPage() {
  const { boardId = "" } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [newItemOpen, setNewItemOpen] = useState(false)
  const [defaultGroupId, setDefaultGroupId] = useState<string | undefined>()
  const [shareOpen, setShareOpen] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const { workspace, setWorkspace } = useWorkspace()
  const { t } = useTranslation()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => api.get<BoardPayload>(`/boards/${boardId}`),
    enabled: Boolean(boardId),
  })
  const usersWorkspaceID = data?.board.workspaceId ?? workspace?.id
  const { data: usersData } = useQuery({
    queryKey: ["users", usersWorkspaceID],
    queryFn: () => api.get<{ users: User[] }>(`/users?workspaceId=${usersWorkspaceID}`),
    enabled: Boolean(usersWorkspaceID),
    staleTime: 60_000,
  })
  const users = usersData?.users ?? []
  const permissions = data?.permissions ?? { role: "editor", canEdit: true, canComment: true, canAdmin: true }

  useEffect(() => {
    if (data?.board.workspaceId && workspace?.id !== data.board.workspaceId) {
      setWorkspace(data.board.workspaceId)
    }
  }, [data?.board.workspaceId, workspace?.id, setWorkspace])
  const mutations = useBoardMutations(boardId)
  const rawView = searchParams.get("view") as BoardView | null
  const view: BoardView = rawView && viewValues.includes(rawView) ? rawView : "table"
  const itemParam = searchParams.get("item")
  const selectedItem = data?.items.find((item) => item.id === itemParam)

  function setView(next: BoardView) {
    const params = new URLSearchParams(searchParams)
    if (next === "table") params.delete("view")
    else params.set("view", next)
    params.delete("item")
    setSearchParams(params, { replace: true })
  }

  function openItem(id: string) {
    const params = new URLSearchParams(searchParams)
    params.set("item", id)
    setSearchParams(params, { replace: true })
  }

  function closeItem() {
    const params = new URLSearchParams(searchParams)
    params.delete("item")
    setSearchParams(params, { replace: true })
  }

  async function handleNewItem() {
    if (!data || !permissions.canEdit) return
    let groupId = data.groups[0]?.id
    if (!groupId) {
      const res = await mutations.createGroup.mutateAsync({
        title: "Group 1",
        color: BOARD_COLORS[0].value,
      })
      groupId = res.group.id
    }
    setDefaultGroupId(groupId)
    setNewItemOpen(true)
  }

  async function createGroup() {
    const color = BOARD_COLORS[(data?.groups.length ?? 0) % BOARD_COLORS.length].value
    await mutations.createGroup.mutateAsync({ title: "New group", color })
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-3 w-80" />
          </div>
        </div>
        <div className="mt-8 space-y-3">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (isError || !data) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-extrabold">{notFound ? t("Board not found") : t("Could not load board")}</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {notFound ? t("This board may have been deleted or the link is incorrect.") : t("Check your connection and try again.")}
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/">
              <ChevronLeft /> {t("Back home")}
            </Link>
          </Button>
          <Button onClick={() => void navigate(0)}>{t("Retry")}</Button>
        </div>
      </div>
    )
  }

  const { board, groups, items, activity } = data
  const busy =
    mutations.createColumn.isPending || mutations.deleteColumn.isPending || mutations.createGroup.isPending

  return (
    <div className="pb-16">
      <BoardHeader
        board={board}
        groups={groups}
        items={items}
        users={users}
        view={view}
        onViewChange={setView}
        onNewItem={() => void handleNewItem()}
        onRename={(name) => mutations.updateBoard.mutate({ name })}
        onDelete={async () => {
          await mutations.deleteBoard.mutateAsync()
        }}
        permissions={permissions}
        onUpdateVisibility={(visibility) => mutations.updateBoard.mutate({ visibility })}
        onShare={() => setShareOpen(true)}
        onOpenAgent={() => setAgentOpen(true)}
      />

      <div className="mx-auto w-full max-w-[1600px] px-4 pt-5 sm:px-6 lg:px-8">
        {busy && (
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Updating board…")}
          </div>
        )}

        {view === "table" && (
          <BoardTable
            board={board}
            groups={groups}
            items={items}
            users={users}
            onOpenItem={openItem}
            onUpdateItem={(patch) => mutations.updateItem.mutate(patch)}
            onAddItem={(groupId, name) => mutations.createItem.mutateAsync({ groupId, name })}
            onCreateGroup={createGroup}
            onUpdateGroup={(id, patch) => mutations.updateGroup.mutate({ id, ...patch })}
            onDeleteGroup={(id) => mutations.deleteGroup.mutateAsync(id)}
            onCreateColumn={(type) =>
              mutations.createColumn.mutate({ title: columnTitles[type], type })
            }
            onRenameColumn={(columnId, title) => mutations.updateColumn.mutate({ columnId, title })}
            onDeleteColumn={(columnId) => mutations.deleteColumn.mutateAsync(columnId)}
            readOnly={!permissions.canEdit}
          />
        )}

        {view === "kanban" && (
          <KanbanView
            board={board}
            groups={groups}
            items={items}
            users={users}
            onOpenItem={openItem}
            onUpdateItem={(patch) => mutations.updateItem.mutate(patch)}
            onNewItem={() => void handleNewItem()}
            readOnly={!permissions.canEdit}
          />
        )}

        {view === "gantt" && <GanttView board={board} groups={groups} items={items} onOpenItem={openItem} />}

        {view === "activity" && <ActivityView activity={activity} onOpenItem={openItem} />}

        <div className={cn("mt-5 flex items-center justify-between text-[10px] text-muted-foreground", view !== "table" && "hidden")}>
          <span>
            {t("{{groups}} groups · {{items}} items · changes save automatically", { groups: groups.length, items: items.length })}
          </span>
          <span>{t("Drag the handle to move items between groups")}</span>
        </div>
      </div>

      <NewItemDialog
        open={newItemOpen}
        onOpenChange={setNewItemOpen}
        groups={groups}
        defaultGroupId={defaultGroupId}
        onCreate={(name, groupId) => mutations.createItem.mutateAsync({ groupId, name })}
        onCreated={(item) => openItem(item.id)}
      />

      <BoardShareDialog open={shareOpen} onOpenChange={setShareOpen} board={board} />
      <AgentDrawer open={agentOpen} onOpenChange={setAgentOpen} board={board} />

      <ItemDrawer
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) closeItem()
        }}
        board={board}
        groups={groups}
        item={selectedItem}
        users={users}
        permissions={permissions}
      />
    </div>
  )
}
