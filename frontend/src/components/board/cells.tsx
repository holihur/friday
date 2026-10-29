import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, ChevronDown, Minus, Plus } from "lucide-react"
import { AvatarStack, UserAvatar } from "@/components/UserAvatar"
import { StatusChip } from "@/components/StatusChip"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Column, Item, User } from "@/lib/types"
import { assigneeIds, labelById } from "@/lib/board-utils"
import { cn, formatDateValue, toInputDate } from "@/lib/utils"

type ValuesPatch = Record<string, unknown>

export function LabelCell({
  column,
  value,
  onChange,
  placeholder,
}: {
  column: Column
  value: unknown
  onChange: (patch: ValuesPatch) => void
  placeholder?: string
}) {
  const { t } = useTranslation()
  const selected = labelById(column, value)
  const labels = column.labels ?? []
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex min-h-6 w-full items-center gap-1 rounded px-1 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
            !selected && "text-muted-foreground/70",
          )}
        >
          {selected ? (
            <StatusChip label={selected} className="w-full justify-center" />
          ) : (
            <span className="flex w-full items-center gap-1 text-[11px]">
              <Plus className="h-3 w-3" /> {placeholder ?? t("Set")}
            </span>
          )}
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="start">
        <div className="space-y-0.5">
          {labels.map((label) => (
            <button
              key={label.id}
              onClick={() => onChange({ [column.id]: label.id })}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-accent"
            >
              <StatusChip label={label} className="flex-1 justify-center" />
              {selected?.id === label.id && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
          {selected && (
            <button
              onClick={() => onChange({ [column.id]: null })}
              className="mt-1 w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
            >
              {t("Clear value")}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function TextCell({
  item,
  column,
  onChange,
}: {
  item: Item
  column: Column
  onChange: (patch: ValuesPatch) => void
}) {
  const { t } = useTranslation()
  const raw = item.values[column.id]
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(typeof raw === "string" ? raw : "")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue(typeof raw === "string" ? raw : "")
  }, [raw])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function commit() {
    setEditing(false)
    const next = value.trim()
    if (next !== (typeof raw === "string" ? raw : "")) onChange({ [column.id]: next || null })
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") {
            setValue(typeof raw === "string" ? raw : "")
            setEditing(false)
          }
        }}
        className="w-full rounded border border-primary/50 bg-background px-1.5 py-1 text-xs outline-none ring-2 ring-primary/10"
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        "min-h-6 w-full truncate rounded px-1 text-left text-xs transition hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
        !value && "text-muted-foreground/60",
      )}
      title={value || t("Add text")}
    >
      {value || t("Add text")}
    </button>
  )
}

export function PeopleCell({
  item,
  column,
  users,
  onChange,
}: {
  item: Item
  column: Column
  users: User[]
  onChange: (patch: ValuesPatch) => void
}) {
  const { t } = useTranslation()
  const selectedIds = assigneeIds([column], item.values)
  const selected = users.filter((u) => selectedIds.includes(u.id))

  function toggle(userId: string) {
    const next = selectedIds.includes(userId) ? selectedIds.filter((id) => id !== userId) : [...selectedIds, userId]
    onChange({ [column.id]: next })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex min-h-6 w-full items-center rounded px-1 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.05]">
          {selected.length > 0 ? (
            <AvatarStack users={selected} max={3} size="xs" />
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
              <Plus className="h-3 w-3" /> {t("Assign")}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1.5" align="start">
        <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t("People")}</p>
        <div className="max-h-64 space-y-0.5 overflow-y-auto scrollbar-thin">
          {users.map((user) => (
            <label
              key={user.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-accent"
            >
              <Checkbox checked={selectedIds.includes(user.id)} onCheckedChange={() => toggle(user.id)} />
              <UserAvatar user={user} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{user.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{user.email}</span>
              </span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function DateCell({
  value,
  onChange,
}: {
  value: unknown
  onChange: (patch: ValuesPatch) => void
}) {
  return (
    <input
      type="date"
      value={toInputDate(value)}
      onChange={(e) => onChange({ date: e.target.value || null })}
      className="w-full bg-transparent px-1 text-xs text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark]"
    />
  )
}

export function DateColumnCell({
  column,
  value,
  onChange,
}: {
  column: Column
  value: unknown
  onChange: (patch: ValuesPatch) => void
}) {
  return (
    <input
      type="date"
      value={toInputDate(value)}
      onChange={(e) => onChange({ [column.id]: e.target.value || null })}
      className="w-full bg-transparent px-1 text-xs text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark]"
    />
  )
}

export function NumberCell({
  item,
  column,
  onChange,
}: {
  item: Item
  column: Column
  onChange: (patch: ValuesPatch) => void
}) {
  const raw = item.values[column.id]
  const [value, setValue] = useState(raw === undefined || raw === null ? "" : String(raw))
  useEffect(() => {
    setValue(raw === undefined || raw === null ? "" : String(raw))
  }, [raw])
  function commit() {
    if (value === "") {
      onChange({ [column.id]: null })
      return
    }
    const num = Number(value)
    if (!Number.isNaN(num)) onChange({ [column.id]: num })
  }
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
      }}
      placeholder="—"
      className="w-full bg-transparent px-1 text-xs tabular-nums outline-none placeholder:text-muted-foreground/40"
    />
  )
}

export function CheckboxCell({
  column,
  value,
  onChange,
}: {
  column: Column
  value: unknown
  onChange: (patch: ValuesPatch) => void
}) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => onChange({ [column.id]: Boolean(checked) })} />
    </div>
  )
}

export function CellRenderer({
  item,
  column,
  users,
  onChange,
}: {
  item: Item
  column: Column
  users: User[]
  onChange: (patch: ValuesPatch) => void
}) {
  const value = item.values[column.id]
  switch (column.type) {
    case "status":
    case "priority":
      return <LabelCell column={column} value={value} onChange={onChange} />
    case "text":
      return <TextCell item={item} column={column} onChange={onChange} />
    case "people":
      return <PeopleCell item={item} column={column} users={users} onChange={onChange} />
    case "date":
      return <DateColumnCell column={column} value={value} onChange={onChange} />
    case "numbers":
      return <NumberCell item={item} column={column} onChange={onChange} />
    case "checkbox":
      return <CheckboxCell column={column} value={value} onChange={onChange} />
    default:
      return <span className="text-xs text-muted-foreground">{value == null ? "—" : String(value)}</span>
  }
}

export function FieldControl({
  item,
  column,
  users,
  onChange,
  readOnly,
}: {
  item: Item
  column: Column
  users: User[]
  onChange: (patch: ValuesPatch) => void
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const raw = item.values[column.id]
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3 border-b border-border/70 py-2 last:border-0">
      <span className="text-[11px] font-semibold text-muted-foreground">{t(column.title)}</span>
      <div className="min-w-0">
        {readOnly ? (
          <StaticCell item={item} column={column} users={users} />
        ) : column.type === "date" ? (
          <DateColumnCell column={column} value={raw} onChange={onChange} />
        ) : (
          <div className={cn(column.type === "text" && "text-sm")}>
            <CellRenderer item={item} column={column} users={users} onChange={onChange} />
          </div>
        )}
      </div>
    </div>
  )
}


export function StaticCell({
  item,
  column,
  users,
}: {
  item: Item
  column: Column
  users: User[]
}) {
  const value = item.values[column.id]
  switch (column.type) {
    case "status":
    case "priority": {
      const label = labelById(column, value)
      return label ? <StatusChip label={label} /> : <span className="text-xs text-muted-foreground">—</span>
    }
    case "people": {
      const ids = assigneeIds([column], item.values)
      const selected = users.filter((u) => ids.includes(u.id))
      return selected.length ? <AvatarStack users={selected} max={3} size="xs" /> : <span className="text-xs text-muted-foreground">—</span>
    }
    case "date":
      return <span className="text-xs">{formatDateValue(value)}</span>
    case "checkbox":
      return value ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground/40" />
    case "text":
      return <span className="truncate text-xs" title={typeof value === "string" ? value : undefined}>{typeof value === "string" && value ? value : "—"}</span>
    case "numbers":
      return <span className="text-xs tabular-nums">{value == null || value === "" ? "—" : String(value)}</span>
    default:
      return <span className="text-xs text-muted-foreground">{value == null ? "—" : String(value)}</span>
  }
}
