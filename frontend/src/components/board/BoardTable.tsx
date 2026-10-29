import { useRef, useState, type DragEvent } from "react"
import { useTranslation } from "react-i18next"
import {
  Calendar,
  CheckSquare,
  ChevronDown,
  CircleDashed,
  Flag,
  GripVertical,
  Hash,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Type,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { CellRenderer, StaticCell } from "@/components/board/cells"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BOARD_COLORS } from "@/lib/colors"
import { cn } from "@/lib/utils"
import type { UpdateItemPatch } from "@/lib/board-mutations"
import type { Board, Column, ColumnType, Group, Item, User } from "@/lib/types"

const NAME_WIDTH = 280
const TRAILING_WIDTH = 44

const columnTypeMeta: Record<ColumnType, { icon: typeof Type; label: string; title: string }> = {
  status: { icon: CircleDashed, label: "Status", title: "Status" },
  text: { icon: Type, label: "Text", title: "Notes" },
  people: { icon: Users, label: "People", title: "Owner" },
  date: { icon: Calendar, label: "Date", title: "Date" },
  priority: { icon: Flag, label: "Priority", title: "Priority" },
  numbers: { icon: Hash, label: "Numbers", title: "Numbers" },
  checkbox: { icon: CheckSquare, label: "Checkbox", title: "Checkbox" },
}

interface BoardTableProps {
  board: Board
  groups: Group[]
  items: Item[]
  users: User[]
  onOpenItem: (id: string) => void
  onUpdateItem: (patch: UpdateItemPatch) => void
  onAddItem: (groupId: string, name: string) => Promise<unknown>
  onCreateGroup: () => Promise<unknown>
  onUpdateGroup: (id: string, patch: { title?: string; color?: string; collapsed?: boolean }) => void
  onDeleteGroup: (id: string) => Promise<unknown>
  onCreateColumn: (type: ColumnType) => void
  onRenameColumn: (columnId: string, title: string) => void
  onDeleteColumn: (columnId: string) => Promise<unknown>
  readOnly?: boolean
}

function ColumnHeader({
  column,
  onRename,
  onDelete,
  readOnly,
}: {
  column: Column
  onRename: (title: string) => void
  onDelete: () => void
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(column.title)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const Icon = columnTypeMeta[column.type]?.icon ?? Type

  function commit() {
    setEditing(false)
    const next = title.trim()
    if (next && next !== column.title) onRename(next)
    else setTitle(column.title)
  }

  return (
    <div className="group/col flex h-9 items-center gap-1 border-r border-border px-2" style={{ width: column.width }}>
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground/70" />
      {editing && !readOnly ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") {
              setTitle(column.title)
              setEditing(false)
            }
          }}
          className="min-w-0 flex-1 rounded border border-primary/50 bg-background px-1 py-0.5 text-[11px] font-semibold outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-muted-foreground">{t(column.title)}</span>
      )}
      {!readOnly && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded p-0.5 text-muted-foreground opacity-0 transition hover:bg-accent group-hover/col:opacity-100 data-[state=open]:opacity-100">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil /> {t("Rename column")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
                <Trash2 /> {t("Delete column")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={`${t("Delete")} “${t(column.title)}”?`}
            description={t("This removes the column and its values from every item on this board. This cannot be undone.")}
            confirmLabel={t("Delete column")}
            onConfirm={onDelete}
          />
        </>
      )}
    </div>
  )
}

function AddColumnMenu({ onCreate }: { onCreate: (type: ColumnType) => void }) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-full w-10 items-center justify-center text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title="Add column"
        >
          <Plus className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t("Add a column")}</DropdownMenuLabel>
        {(Object.keys(columnTypeMeta) as ColumnType[]).map((type) => {
          const meta = columnTypeMeta[type]
          const Icon = meta.icon
          return (
            <DropdownMenuItem key={type} onSelect={() => onCreate(type)}>
              <Icon /> {t(meta.label)}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function QuickAddItem({
  color,
  onAdd,
}: {
  color: string
  onAdd: (name: string) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit() {
    const value = name.trim()
    if (!value || saving) return
    setSaving(true)
    try {
      await onAdd(value)
      setName("")
      inputRef.current?.focus()
    } catch {
      // The mutation already surfaces a toast.
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5">
      <Plus className="ml-1 h-3.5 w-3.5 shrink-0" style={{ color }} />
      <input
        ref={inputRef}
        value={name}
        disabled={saving}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit()
        }}
        placeholder={t("Add item")}
        className="h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground/60 hover:border-border focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
      />
      {name.trim() && (
        <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => void submit()} disabled={saving}>
          {t("Add")}
        </Button>
      )}
    </div>
  )
}

function GroupSection({
  group,
  board,
  items,
  users,
  onOpenItem,
  onUpdateItem,
  onUpdateGroup,
  onDeleteGroup,
  onAddItem,
  readOnly,
}: {
  group: Group
  board: Board
  items: Item[]
  users: User[]
  onOpenItem: (id: string) => void
  onUpdateItem: (patch: UpdateItemPatch) => void
  onUpdateGroup: (id: string, patch: { title?: string; color?: string; collapsed?: boolean }) => void
  onDeleteGroup: (id: string) => Promise<unknown>
  onAddItem: (groupId: string, name: string) => Promise<unknown>
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(group.title)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const groupItems = items
    .filter((item) => item.groupId === group.id)
    .sort((a, b) => a.position - b.position)
  const totalWidth = NAME_WIDTH + board.columns.reduce((sum, c) => sum + c.width, 0) + TRAILING_WIDTH
  const maxPos = groupItems.reduce((max, item) => Math.max(max, item.position), 0)

  function commitTitle() {
    setEditing(false)
    const next = title.trim()
    if (next && next !== group.title) onUpdateGroup(group.id, { title: next })
    else setTitle(group.title)
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    setDragOver(false)
    if (readOnly) return
    const itemId = event.dataTransfer.getData("text/friday-item")
    if (itemId) {
      onUpdateItem({ id: itemId, groupId: group.id, position: maxPos + 1024 })
      toast.success(`${t("Moved to")} ${group.title}`)
    }
  }

  return (
    <section
      className={cn("relative border-b border-border/80 last:border-b-0", dragOver && "bg-primary/[0.035]")}
      style={{ minWidth: totalWidth }}
      onDragOver={(e) => {
        if (!readOnly && e.dataTransfer.types.includes("text/friday-item")) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      }}
      onDrop={handleDrop}
    >
      <div className={cn("transition-shadow", dragOver && "ring-2 ring-inset ring-primary/40")}>
        <div className="group/group flex items-center gap-1.5 px-2 py-2">
          {!readOnly && (
            <button
              onClick={() => onUpdateGroup(group.id, { collapsed: !group.collapsed })}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-accent"
              title={group.collapsed ? t("Expand group") : t("Collapse group")}
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", group.collapsed && "-rotate-90")} />
            </button>
          )}
          <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: group.color }} />
          {editing && !readOnly ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle()
                if (e.key === "Escape") {
                  setTitle(group.title)
                  setEditing(false)
                }
              }}
              className="w-56 rounded border border-primary/50 bg-background px-1.5 py-0.5 text-[13px] font-bold outline-none"
            />
          ) : (
            <button
              onClick={() => !readOnly && setEditing(true)}
              className="max-w-[420px] truncate text-left text-[13px] font-bold hover:underline"
              style={{ color: group.color }}
              title={readOnly ? undefined : t("Click to rename")}
            >
              {t(group.title)}
            </button>
          )}
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {groupItems.length}
          </span>
          {!readOnly && (
          <div className="ml-1 flex items-center gap-0.5">
            <button
              onClick={() => setEditing(true)}
              className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-accent group-hover/group:opacity-100"
              title={t("Rename group")}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded p-1 text-muted-foreground transition hover:bg-accent">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>{t("Group color")}</DropdownMenuLabel>
                <div className="grid grid-cols-8 gap-1 px-2 pb-2">
                  {BOARD_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => onUpdateGroup(group.id, { color: c.value })}
                      className={cn("h-5 w-5 rounded-full border border-black/5 transition hover:scale-110", group.color === c.value && "ring-2 ring-foreground/50 ring-offset-1")}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil /> {t("Rename group")}
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
                  <Trash2 /> {t("Delete group")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          )}
        </div>

        {!group.collapsed && (
          <>
            {groupItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                board={board}
                users={users}
                onOpen={onOpenItem}
                onChange={(patch) => onUpdateItem({ id: item.id, ...patch })}
                readOnly={readOnly}
              />
            ))}
            {!readOnly && (
              <div className="sticky left-0 flex w-full items-center border-t border-border/50">
                <div className="sticky left-0 z-10 bg-card" style={{ width: NAME_WIDTH }}>
                  <QuickAddItem color={group.color} onAdd={(name) => onAddItem(group.id, name)} />
                </div>
                <div className="flex flex-1 items-center gap-2 px-3 py-1.5 text-[10px] text-muted-foreground/50">
                  {t("Press Enter to keep adding")}
                </div>
              </div>
            )}
          </>
        )}
        {group.collapsed && (
          <div className="px-4 pb-2 text-[11px] text-muted-foreground">
            {groupItems.length === 0 ? t("No items in this group") : t("{{count}} items hidden", { count: groupItems.length })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`${t("Delete")} “${group.title}”?`}
        description={t("This will permanently delete the group and its {{count}} items. This cannot be undone.", { count: groupItems.length })}
        confirmLabel={t("Delete group")}
        onConfirm={async () => {
          await onDeleteGroup(group.id)
        }}
      />
    </section>
  )
}

function ItemRow({
  item,
  board,
  users,
  onOpen,
  onChange,
  readOnly,
}: {
  item: Item
  board: Board
  users: User[]
  onOpen: (id: string) => void
  onChange: (patch: { values?: Record<string, unknown> }) => void
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const [dragging, setDragging] = useState(false)
  return (
    <div
      className={cn(
        "group flex min-h-[38px] items-stretch border-t border-border/70 bg-card transition-colors hover:bg-accent/35",
        dragging && "opacity-40",
      )}
    >
      <div
        className="sticky left-0 z-10 flex items-center gap-1 border-r border-border bg-card px-2 transition-colors group-hover:bg-accent/35"
        style={{ width: NAME_WIDTH }}
      >
        {!readOnly && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/friday-item", item.id)
              e.dataTransfer.effectAllowed = "move"
              setDragging(true)
            }}
            onDragEnd={() => setDragging(false)}
            className="cursor-grab rounded p-0.5 text-muted-foreground/40 opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100 active:cursor-grabbing"
            title={t("Drag to another group")}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}
        <button
          onClick={() => onOpen(item.id)}
          className="min-w-0 flex-1 truncate py-2 text-left text-[13px] font-medium hover:text-primary"
          title={item.name}
        >
          {item.name}
        </button>
      </div>
      {board.columns.map((column) => (
        <div
          key={column.id}
          className="flex items-center border-r border-border/60 px-1.5 py-1"
          style={{ width: column.width, minWidth: column.width }}
        >
          {readOnly ? (
            <StaticCell item={item} column={column} users={users} />
          ) : (
            <CellRenderer item={item} column={column} users={users} onChange={(values) => onChange({ values })} />
          )}
        </div>
      ))}
      <div style={{ width: TRAILING_WIDTH }} />
    </div>
  )
}

export function BoardTable(props: BoardTableProps) {
  const { board, groups, items, onCreateGroup, onCreateColumn, onRenameColumn, onDeleteColumn, readOnly } = props
  const { t } = useTranslation()
  const totalWidth = NAME_WIDTH + board.columns.reduce((sum, c) => sum + c.width, 0) + TRAILING_WIDTH
  const [creatingGroup, setCreatingGroup] = useState(false)

  async function addGroup() {
    setCreatingGroup(true)
    try {
      await onCreateGroup()
    } finally {
      setCreatingGroup(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto scrollbar-thin">
        <div style={{ minWidth: totalWidth }}>
          <div className="flex h-9 items-center border-b border-border bg-muted/45 text-muted-foreground">
            <div
              className="sticky left-0 z-10 flex h-full items-center border-r border-border bg-muted/80 px-3 text-[11px] font-semibold"
              style={{ width: NAME_WIDTH }}
            >
              {t("Item")}
            </div>
            {board.columns.map((column) => (
              <ColumnHeader
                key={column.id}
                column={column}
                onRename={(title) => onRenameColumn(column.id, title)}
                onDelete={() => onDeleteColumn(column.id)}
                readOnly={readOnly}
              />
            ))}
            <div style={{ width: TRAILING_WIDTH }}>
              {!readOnly && <AddColumnMenu onCreate={onCreateColumn} />}
            </div>
          </div>

          {groups.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              board={board}
              items={items}
              users={props.users}
              onOpenItem={props.onOpenItem}
              onUpdateItem={props.onUpdateItem}
              onUpdateGroup={props.onUpdateGroup}
              onDeleteGroup={props.onDeleteGroup}
              onAddItem={props.onAddItem}
              readOnly={readOnly}
            />
          ))}

          {!readOnly && (
            <div className="flex items-center px-3 py-3">
              <Button
                variant="ghost"
                className="h-8 gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
                onClick={() => void addGroup()}
                disabled={creatingGroup}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("Add new group")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

