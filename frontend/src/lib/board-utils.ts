import type { Board, Column, Item, Label, User } from "@/lib/types"
import { safeArray } from "@/lib/utils"

export function columnByType(board: Pick<Board, "columns"> | { columns: Column[] }, type: Column["type"]): Column | undefined {
  return board.columns.find((c) => c.type === type)
}

export function statusColumn(columns: Column[]): Column | undefined {
  return columns.find((c) => c.type === "status")
}

export function priorityColumn(columns: Column[]): Column | undefined {
  return columns.find((c) => c.type === "priority")
}

export function dateColumn(columns: Column[]): Column | undefined {
  return (
    columns.find((c) => c.type === "date" && /due/i.test(c.title)) ??
    columns.find((c) => c.type === "date" && /target/i.test(c.title)) ??
    columns.find((c) => c.type === "date")
  )
}

export function labelsFor(column?: Column): Label[] {
  return column?.labels ?? []
}

export function labelById(column: Column | undefined, value: unknown): Label | undefined {
  if (!column || typeof value !== "string") return undefined
  return column.labels?.find((l) => l.id === value)
}

export function itemStatus(columns: Column[], values: Item["values"]): Label | undefined {
  const col = statusColumn(columns)
  return labelById(col, values[col?.id ?? ""])
}

export function itemPriority(columns: Column[], values: Item["values"]): Label | undefined {
  const col = priorityColumn(columns)
  return labelById(col, values[col?.id ?? ""])
}

export function itemDue(columns: Column[], values: Item["values"]): string {
  const col = dateColumn(columns)
  const raw = col ? values[col.id] : undefined
  return typeof raw === "string" ? raw : ""
}

export function assigneeIds(columns: Column[], values: Item["values"]): string[] {
  for (const col of columns) {
    if (col.type === "people") return safeArray(values[col.id])
  }
  return []
}

export function assignees(columns: Column[], values: Item["values"], users: User[]): User[] {
  const ids = assigneeIds(columns, values)
  return ids.map((id) => users.find((u) => u.id === id)).filter((u): u is User => Boolean(u))
}

export function isItemDone(columns: Column[], values: Item["values"]): boolean {
  const label = itemStatus(columns, values)
  if (!label) return false
  const name = label.name.toLowerCase()
  return name === "done" || name === "completed" || name === "launched"
}

export function peopleColumn(columns: Column[]): Column | undefined {
  return columns.find((c) => c.type === "people")
}
