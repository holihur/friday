import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, ChevronDown, GitBranch, Minus, Plus, Search } from "lucide-react"
import { AvatarStack, UserAvatar } from "@/components/UserAvatar"
import { StatusChip } from "@/components/StatusChip"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Column, DependencyMode, Item, User } from "@/lib/types"
import { assigneeIds, labelById, parseDependencyValue } from "@/lib/board-utils"
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
            "flex min-h-6 w-full items-center gap-1 rounded-sm px-1 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
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
        className="w-full rounded-sm border border-primary/50 bg-background px-1.5 py-1 text-xs outline-none ring-2 ring-primary/10"
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        "min-h-6 w-full truncate rounded-sm px-1 text-left text-xs transition hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
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
        <button className="flex min-h-6 w-full items-center rounded-sm px-1 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.05]">
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

export function DependencyCell({
  item,
  column,
  items,
  onChange,
}: {
  item: Item
  column: Column
  items: Item[]
  onChange: (patch: ValuesPatch) => void
}) {
  const { t } = useTranslation()
  const parsed = parseDependencyValue(item.values[column.id])
  const [mode, setMode] = useState<DependencyMode>(parsed.mode)
  const [query, setQuery] = useState("")

  useEffect(() => {
    setMode(parsed.mode)
  }, [item.values[column.id], parsed.mode])

  const selectedItems = parsed.itemIds
    .map((id) => items.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Item => Boolean(candidate))
  const candidates = items
    .filter((candidate) => candidate.id !== item.id)
    .filter((candidate) => candidate.name.toLowerCase().includes(query.trim().toLowerCase()))

  function save(itemIds: string[], nextMode = mode) {
    if (itemIds.length === 0) {
      onChange({ [column.id]: null })
      return
    }
    onChange({ [column.id]: { itemIds, mode: nextMode } })
  }

  function toggle(id: string) {
    const next = parsed.itemIds.includes(id)
      ? parsed.itemIds.filter((itemId) => itemId !== id)
      : [...parsed.itemIds, id]
    save(next)
  }

  function chooseMode(nextMode: DependencyMode) {
    setMode(nextMode)
    if (parsed.itemIds.length > 0) save(parsed.itemIds, nextMode)
  }

  const summary =
    selectedItems.length === 0
      ? ""
      : selectedItems.length <= 2
        ? selectedItems.map((candidate) => candidate.name).join(", ")
        : `${selectedItems.slice(0, 1).map((candidate) => candidate.name).join(", ")} +${selectedItems.length - 1}`
  const fullSummary = selectedItems.map((candidate) => candidate.name).join(", ")

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex min-h-6 w-full items-center gap-1 rounded-sm px-1 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
            !summary && "text-muted-foreground/60",
          )}
          title={fullSummary || t("Link task")}
        >
          {summary ? (
            <>
              <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground/70" />
              <span className="min-w-0 flex-1 truncate text-[11px]">{summary}</span>
              {selectedItems.length > 1 && (
                <span className="shrink-0 rounded-[4px] bg-muted px-1 text-[9px] font-semibold text-muted-foreground">
                  {parsed.mode === "all" ? t("All") : t("Any")}
                </span>
              )}
            </>
          ) : (
            <span className="flex items-center gap-1 text-[11px]">
              <Plus className="h-3 w-3" /> {t("Link task")}
            </span>
          )}
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <GitBranch className="h-3 w-3" /> {t("Depends on")}
            </p>
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground/80">
              {mode === "all"
                ? t("Starts after all selected tasks finish.")
                : t("Starts after any selected task finishes.")}
            </p>
          </div>
          {selectedItems.length > 0 && (
            <button
              onClick={() => save([])}
              className="shrink-0 text-[10px] font-semibold text-muted-foreground transition hover:text-foreground"
            >
              {t("Clear")}
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-4 border-b border-border/60">
          {(["all", "any"] as DependencyMode[]).map((option) => (
            <button
              key={option}
              onClick={() => chooseMode(option)}
              className={cn(
                "-mb-px border-b-2 pb-1.5 text-[11px] font-semibold transition",
                mode === option
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {option === "all" ? t("All finish") : t("Any finishes")}
            </button>
          ))}
        </div>

        <label className="mt-3 flex items-center gap-2 border-b border-border/60 pb-1.5">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search tasks…")}
            className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/60"
          />
        </label>

        <div className="mt-2 max-h-56 space-y-0 overflow-y-auto scrollbar-thin">
          {candidates.map((candidate) => (
            <label
              key={candidate.id}
              className="flex cursor-pointer items-center gap-2 px-1 py-2 transition hover:bg-accent/45"
            >
              <Checkbox checked={parsed.itemIds.includes(candidate.id)} onCheckedChange={() => toggle(candidate.id)} />
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium" title={candidate.name}>
                {candidate.name}
              </span>
            </label>
          ))}
          {candidates.length === 0 && (
            <p className="py-4 text-center text-[11px] text-muted-foreground">{t("No tasks found")}</p>
          )}
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
  items,
  onChange,
}: {
  item: Item
  column: Column
  users: User[]
  items: Item[]
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
    case "dependency":
      return <DependencyCell item={item} column={column} items={items} onChange={onChange} />
    default:
      return <span className="text-xs text-muted-foreground">{value == null ? "—" : String(value)}</span>
  }
}

export function FieldControl({
  item,
  column,
  users,
  items,
  onChange,
  readOnly,
}: {
  item: Item
  column: Column
  users: User[]
  items: Item[]
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
          <StaticCell item={item} column={column} users={users} items={items} />
        ) : column.type === "date" ? (
          <DateColumnCell column={column} value={raw} onChange={onChange} />
        ) : (
          <div className={cn(column.type === "text" && "text-sm")}>
            <CellRenderer item={item} column={column} users={users} items={items} onChange={onChange} />
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
  items,
}: {
  item: Item
  column: Column
  users: User[]
  items: Item[]
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
    case "dependency": {
      const names = parseDependencyValue(value).itemIds
        .map((id) => items.find((candidate) => candidate.id === id)?.name)
        .filter((name): name is string => Boolean(name))
      return names.length ? (
        <span className="flex min-w-0 items-center gap-1 text-xs" title={names.join(", ")}>
          <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground/70" />
          <span className="truncate">{names.join(", ")}</span>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )
    }
    default:
      return <span className="text-xs text-muted-foreground">{value == null ? "—" : String(value)}</span>
  }
}
