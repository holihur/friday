import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarDays, Loader2, MessageSquare, Send, Trash2, UserRound } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { UserAvatar } from "@/components/UserAvatar"
import { FieldControl } from "@/components/board/cells"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useBoardMutations } from "@/lib/board-mutations"
import { cn, formatDateTime, timeAgo } from "@/lib/utils"
import type { Board, BoardPermissions, Comment, Group, Item, User } from "@/lib/types"

export function ItemDrawer({
  open,
  onOpenChange,
  board,
  groups,
  item,
  users,
  permissions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  board: Board
  groups: Group[]
  item?: Item
  users: User[]
  permissions: BoardPermissions
}) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const mutations = useBoardMutations(board.id)
  const [name, setName] = useState(item?.name ?? "")
  const [comment, setComment] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const group = groups.find((g) => g.id === item?.groupId)
  const creator = users.find((u) => u.id === item?.createdBy)

  useEffect(() => {
    setName(item?.name ?? "")
  }, [item?.id, item?.name])

  const { data: commentsData, isLoading: commentsLoading } = useQuery({
    queryKey: ["comments", item?.id],
    queryFn: () => api.get<{ comments: Comment[] }>(`/items/${item?.id}/comments`),
    enabled: open && Boolean(item?.id),
  })
  const comments = commentsData?.comments ?? []

  const addComment = useMutation({
    mutationFn: (body: string) => api.post<{ comment: Comment }>(`/items/${item!.id}/comments`, { body }),
    onSuccess: () => {
      setComment("")
      void queryClient.invalidateQueries({ queryKey: ["comments", item?.id] })
      void queryClient.invalidateQueries({ queryKey: ["board", board.id] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? t(err.message) : t("Could not add comment")),
  })

  const removeComment = useMutation({
    mutationFn: (id: string) => api.delete(`/comments/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["comments", item?.id] })
      void queryClient.invalidateQueries({ queryKey: ["board", board.id] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? t(err.message) : t("Could not delete comment")),
  })

  if (!item) return null

  function commitName() {
    if (!permissions.canEdit) return
    const next = name.trim()
    if (!next) {
      setName(item!.name)
      return
    }
    if (next !== item!.name) mutations.updateItem.mutate({ id: item!.id, name: next })
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await mutations.deleteItem.mutateAsync(item!.id)
      onOpenChange(false)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  function submitComment() {
    const body = comment.trim()
    if (!body || addComment.isPending) return
    addComment.mutate(body)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl" onOpenAutoFocus={(event) => event.preventDefault()}>
        <SheetTitle className="sr-only">{item.name}</SheetTitle>
        <SheetDescription className="sr-only">{t("Item details and comments")}</SheetDescription>

        <div className="border-b border-border px-5 pb-4 pr-12 pt-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ backgroundColor: `${board.color}1f` }}>
              {board.icon}
            </span>
            <span>{board.name}</span>
            <span>/</span>
            {group && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: group.color }} />
                {group.title}
              </span>
            )}
          </div>

          <input
            value={name}
            readOnly={!permissions.canEdit}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur()
              if (e.key === "Escape") {
                setName(item.name)
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            className="mt-3 w-full bg-transparent text-[23px] font-extrabold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/40 focus:ring-0 read-only:cursor-default"
            placeholder="Item name"
          />

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" />
              {creator ? (
                <>
                  <UserAvatar user={creator} size="xs" />
                  {creator.name}
                </>
              ) : (
                "Unknown"
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {t("Updated")} {timeAgo(item.updatedAt)}
            </span>
            <span>{t("Created")} {formatDateTime(item.createdAt)}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("Details")}</h3>
              <div className="w-44">
                {permissions.canEdit ? (
                <Select
                  value={item.groupId}
                  onValueChange={(groupId) => mutations.updateItem.mutate({ id: item.id, groupId })}
                >
                  <SelectTrigger className="h-7 text-[11px]">
                    <SelectValue placeholder={t("Group")} />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: g.color }} />
                          {t(g.title)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: group?.color }} />
                    {group ? t(group.title) : ""}
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-1">
              {board.columns.map((column) => (
                <FieldControl
                  key={column.id}
                  item={item}
                  column={column}
                  users={users}
                  onChange={(values) => mutations.updateItem.mutate({ id: item.id, values })}
                  readOnly={!permissions.canEdit}
                />
              ))}
            </div>
          </div>

          <div className="border-t border-border px-5 py-5">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-bold">{t("Comments")}</h3>
              <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                {comments.length}
              </span>
            </div>

            <div className="mt-4 space-y-4">
              {commentsLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Loading comments…")}
                </div>
              ) : comments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
                  {t("No comments yet. Start the conversation.")}
                </p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="group/comment flex items-start gap-2.5">
                    <UserAvatar name={c.authorName} color={c.authorColor} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold">{c.authorName}</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(c.createdAt)}</span>
                        {permissions.canComment && c.userId === user?.id && (
                          <button
                            onClick={() => removeComment.mutate(c.id)}
                            className="ml-auto rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover/comment:opacity-100"
                            title={t("Delete comment")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap rounded-xl rounded-tl-sm bg-muted/60 px-3 py-2 text-[13px] leading-relaxed">
                        {c.body}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {permissions.canComment && (
            <div className="mt-5 flex items-start gap-2.5">
              {user && <UserAvatar user={user} size="sm" />}
              <div className="flex-1">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t("Write a comment… use @ to mention (coming soon)")}
                  className="min-h-[72px] resize-none text-[13px]"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitComment()
                  }}
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">⌘ + Enter</span>
                  <Button size="sm" onClick={submitComment} disabled={!comment.trim() || addComment.isPending}>
                    {addComment.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                    {t("Comment")}
                  </Button>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>

        <div className={cn("flex items-center justify-between border-t border-border px-5 py-3")}>
          <p className="text-[10px] text-muted-foreground">
            {permissions.canEdit ? t("Changes save automatically") : t("Read-only access")}
          </p>
          {permissions.canEdit && (
            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> {t("Delete item")}
            </Button>
          )}
        </div>

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`${t("Delete")} “${item.name}”?`}
          description={t("This deletes the item and all of its comments. This cannot be undone.")}
          confirmLabel={t("Delete item")}
          onConfirm={handleDelete}
        />
        {deleting && <span className="sr-only">{t("Deleting")}</span>}
      </SheetContent>
    </Sheet>
  )
}
