import { useState, type DragEvent } from "react"
import { useTranslation } from "react-i18next"
import { CircleDashed, GripVertical, Plus } from "lucide-react"
import { AvatarStack } from "@/components/UserAvatar"
import { StatusChip } from "@/components/StatusChip"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { assignees, itemDue, itemPriority, statusColumn } from "@/lib/board-utils"
import { cn, dueTone, formatDateValue } from "@/lib/utils"
import type { UpdateItemPatch } from "@/lib/board-mutations"
import type { Board, Group, Item, Label, User } from "@/lib/types"

function KanbanCard({
  item,
  group,
  board,
  users,
  onOpen,
  readOnly,
}: {
  item: Item
  group?: Group
  board: Board
  users: User[]
  onOpen: (id: string) => void
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const [dragging, setDragging] = useState(false)
  const priority = itemPriority(board.columns, item.values)
  const due = itemDue(board.columns, item.values)
  const people = assignees(board.columns, item.values, users)
  const tone = dueTone(due)

  return (
    <div
      draggable={!readOnly}
      onDragStart={(e) => {
        if (readOnly) return
        e.dataTransfer.setData("text/friday-item", item.id)
        e.dataTransfer.effectAllowed = "move"
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      onClick={() => onOpen(item.id)}
      className={cn(
        "group/card cursor-pointer rounded-xl border border-border bg-card p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
        dragging && "opacity-40",
      )}
      style={{ borderLeft: `3px solid ${group?.color ?? board.color}` }}
    >
      <div className="flex items-start gap-1.5">
        <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug">{item.name}</p>
        {!readOnly && <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/30 opacity-0 transition group-hover/card:opacity-100" />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {priority && <StatusChip label={priority} compact />}
        {due && (
          <span
            className={cn(
              "inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
              tone === "danger" && "bg-destructive/10 text-destructive",
              tone === "warning" && "bg-warning/15 text-amber-700 dark:text-warning",
            )}
          >
            {formatDateValue(due)}
          </span>
        )}
        {group && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: group.color }} />
            {t(group.title)}
          </span>
        )}
      </div>
      {people.length > 0 && (
        <div className="mt-2.5 border-t border-border/60 pt-2">
          <AvatarStack users={people} max={4} size="xs" />
        </div>
      )}
    </div>
  )
}

export function KanbanView({
  board,
  groups,
  items,
  users,
  onOpenItem,
  onUpdateItem,
  onNewItem,
  readOnly,
}: {
  board: Board
  groups: Group[]
  items: Item[]
  users: User[]
  onOpenItem: (id: string) => void
  onUpdateItem: (patch: UpdateItemPatch) => void
  onNewItem: () => void
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const status = statusColumn(board.columns)
  const [dragOver, setDragOver] = useState<string | null>(null)
  if (!status) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card">
        <EmptyState
          icon={CircleDashed}
          title={t("Add a status column to use Kanban")}
          description={t("Kanban groups items by the labels in your status column.")}
        />
      </div>
    )
  }

  const statusId = status.id
  const labels: Array<Label | null> = [...(status.labels ?? []), null]
  const groupFor = (item: Item) => groups.find((g) => g.id === item.groupId)

  function drop(event: DragEvent, label: Label | null) {
    event.preventDefault()
    setDragOver(null)
    if (readOnly) return
    const itemId = event.dataTransfer.getData("text/friday-item")
    if (itemId) onUpdateItem({ id: itemId, values: { [statusId]: label?.id ?? null } })
  }

  return (
    <div className="overflow-x-auto pb-3 scrollbar-thin">
      <div className="flex min-w-max items-start gap-3">
        {labels.map((label) => {
          const key = label?.id ?? "__none"
          const columnItems = items
            .filter((item) => (label ? item.values[statusId] === label.id : !item.values[statusId]))
            .sort((a, b) => a.position - b.position)
          return (
            <div
              key={key}
              onDragOver={(e) => {
                if (readOnly) return
                e.preventDefault()
                setDragOver(key)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver((current) => (current === key ? null : current))
              }}
              onDrop={(e) => drop(e, label)}
              className={cn(
                "flex w-[286px] shrink-0 flex-col rounded-2xl border border-border bg-secondary/40 p-2.5 transition",
                dragOver === key && "border-primary/40 bg-primary/[0.04] ring-2 ring-primary/15",
              )}
            >
              <div className="mb-2 flex items-center gap-2 px-1">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ backgroundColor: label?.color ?? "#c4c4c4" }}
                />
                <span className="text-xs font-bold">{label ? t(label.name) : t("No status")}</span>
                <span className="rounded-full bg-background px-1.5 text-[10px] font-semibold text-muted-foreground">
                  {columnItems.length}
                </span>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="iconSm"
                    className="ml-auto text-muted-foreground"
                    onClick={onNewItem}
                    title={t("Add item")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="min-h-[80px] space-y-2">
                {columnItems.length === 0 ? (
                  <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-border/80 text-[11px] text-muted-foreground">
                    {t("Drop items here")}
                  </div>
                ) : (
                  columnItems.map((item) => (
                    <KanbanCard
                      key={item.id}
                      item={item}
                      group={groupFor(item)}
                      board={board}
                      users={users}
                      onOpen={onOpenItem}
                      readOnly={readOnly}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
