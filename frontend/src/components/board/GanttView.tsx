import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  type Locale,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { CalendarRange, ZoomIn } from "lucide-react"
import { EmptyState } from "@/components/EmptyState"
import { StatusChip } from "@/components/StatusChip"
import { Button } from "@/components/ui/button"
import { itemStatus } from "@/lib/board-utils"
import { cn, dueTone, getDateLocale, readableTextColor } from "@/lib/utils"
import type { Board, Group, Item } from "@/lib/types"

type Zoom = "day" | "week" | "month"

const zoomMeta: Record<Zoom, { label: string; dayWidth: number }> = {
  day: { label: "Day", dayWidth: 34 },
  week: { label: "Week", dayWidth: 14 },
  month: { label: "Month", dayWidth: 6 },
}

interface DateRange {
  start: Date
  end: Date
}

interface Unit {
  key: string
  start: Date
  end: Date
  width: number
  label: string
  sub?: string
}

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null
  const parsed = parseISO(value.length > 10 ? value.slice(0, 10) : value)
  return isValid(parsed) ? parsed : null
}

function findDateColumns(board: Board) {
  const dates = board.columns.filter((column) => column.type === "date")
  const start =
    dates.find((column) => /start|begin/i.test(column.title) || /^start/i.test(column.id)) ?? undefined
  const end =
    dates.find(
      (column) =>
        column !== start &&
        /due|end|target|launch|deadline|ship/i.test(column.title),
    ) ??
    dates.find((column) => column !== start) ??
    (start ? undefined : dates[0])
  return { start, end }
}

function buildUnits(rangeStart: Date, rangeEnd: Date, zoom: Zoom, locale: Locale): Unit[] {
  const units: Unit[] = []
  const { dayWidth } = zoomMeta[zoom]
  if (zoom === "day") {
    let cursor = rangeStart
    while (cursor <= rangeEnd) {
      units.push({
        key: format(cursor, "yyyy-MM-dd"),
        start: cursor,
        end: cursor,
        width: dayWidth,
        label: format(cursor, "d", { locale }),
        sub: format(cursor, "EEE", { locale }),
      })
      cursor = addDays(cursor, 1)
    }
    return units
  }
  if (zoom === "week") {
    let cursor = startOfWeek(rangeStart, { weekStartsOn: 1 })
    while (cursor <= rangeEnd) {
      const weekEnd = addDays(cursor, 6)
      const visibleStart = cursor < rangeStart ? rangeStart : cursor
      const visibleEnd = weekEnd > rangeEnd ? rangeEnd : weekEnd
      const days = Math.max(1, differenceInCalendarDays(visibleEnd, visibleStart) + 1)
      units.push({
        key: format(cursor, "yyyy-MM-dd"),
        start: cursor,
        end: weekEnd,
        width: days * dayWidth,
        label: format(cursor, "MMM d", { locale }),
      })
      cursor = addDays(cursor, 7)
    }
    return units
  }
  let cursor = startOfMonth(rangeStart)
  while (cursor <= rangeEnd) {
    const monthEnd = endOfMonth(cursor)
    const visibleStart = cursor < rangeStart ? rangeStart : cursor
    const visibleEnd = monthEnd > rangeEnd ? rangeEnd : monthEnd
    const days = Math.max(1, differenceInCalendarDays(visibleEnd, visibleStart) + 1)
    units.push({
      key: format(cursor, "yyyy-MM"),
      start: cursor,
      end: monthEnd,
      width: days * dayWidth,
      label: format(cursor, "MMM", { locale }),
      sub: format(cursor, "yyyy", { locale }),
    })
    cursor = addMonths(cursor, 1)
  }
  return units
}

export function GanttView({
  board,
  groups,
  items,
  onOpenItem,
}: {
  board: Board
  groups: Group[]
  items: Item[]
  onOpenItem: (id: string) => void
}) {
  const { t } = useTranslation()
  const locale = getDateLocale()
  const [zoom, setZoom] = useState<Zoom>("week")
  const { start: startCol, end: endCol } = useMemo(() => findDateColumns(board), [board])
  const dayWidth = zoomMeta[zoom].dayWidth

  const ranges = useMemo(() => {
    const map = new Map<string, DateRange>()
    if (!startCol && !endCol) return map
    for (const item of items) {
      let start = startCol ? toDate(item.values[startCol.id]) : null
      const end = endCol ? toDate(item.values[endCol.id]) : null
      if (startCol && endCol && !start && !end) continue
      if (!start && !end) continue
      if (!start && end) start = addDays(end, -6)
      if (start && !end) {
        map.set(item.id, { start, end: start })
        continue
      }
      if (!start || !end) continue
      if (start > end) {
        map.set(item.id, { start: end, end: start })
      } else {
        map.set(item.id, { start, end })
      }
    }
    return map
  }, [items, startCol, endCol])

  const bounds = useMemo(() => {
    if (ranges.size === 0) return null
    let min = new Date(8640000000000000)
    let max = new Date(-8640000000000000)
    for (const range of ranges.values()) {
      if (range.start < min) min = range.start
      if (range.end > max) max = range.end
    }
    const pad = zoom === "day" ? 2 : zoom === "week" ? 3 : 7
    let rangeStart: Date
    let rangeEnd: Date
    if (zoom === "day") {
      rangeStart = startOfDay(addDays(min, -pad))
      rangeEnd = startOfDay(addDays(max, pad))
    } else if (zoom === "week") {
      rangeStart = startOfWeek(addDays(min, -pad), { weekStartsOn: 1 })
      rangeEnd = endOfWeek(addDays(max, pad), { weekStartsOn: 1 })
    } else {
      rangeStart = startOfMonth(addDays(min, -pad))
      rangeEnd = endOfMonth(addDays(max, pad))
    }
    return { start: rangeStart, end: rangeEnd }
  }, [ranges, zoom])

  const units = useMemo(() => (bounds ? buildUnits(bounds.start, bounds.end, zoom, locale) : []), [bounds, zoom])
  const timelineWidth = units.reduce((sum, unit) => sum + unit.width, 0)
  const totalDays = bounds ? differenceInCalendarDays(bounds.end, bounds.start) + 1 : 0
  const today = startOfDay(new Date())
  const todayOffset = bounds ? differenceInCalendarDays(today, bounds.start) * dayWidth : -1
  const showToday = Boolean(bounds && today >= bounds.start && today <= bounds.end)
  const grouped = groups
    .map((group) => ({
      group,
      items: items.filter((item) => item.groupId === group.id).sort((a, b) => a.position - b.position),
    }))
    .filter((entry) => entry.items.length > 0)

  if (!startCol && !endCol) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card">
        <EmptyState
          icon={CalendarRange}
          title={t("Add a date column to unlock Gantt")}
          description={t("Gantt reads date columns. Add a Date column with a name like “Start date” or “Due date”.")}
        />
      </div>
    )
  }

  if (!bounds || grouped.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card">
        <EmptyState
          icon={CalendarRange}
          title={t("No dated items yet")}
          description={t("Add a date to any item and it will appear on the timeline.")}
        />
      </div>
    )
  }

  function barStyle(item: Item) {
    const range = ranges.get(item.id)
    if (!range) return null
    const leftDays = differenceInCalendarDays(range.start, bounds!.start)
    const lengthDays = Math.max(1, differenceInCalendarDays(range.end, range.start) + 1)
    const status = itemStatus(board.columns, item.values)
    const color = status?.color ?? groups.find((g) => g.id === item.groupId)?.color ?? board.color
    return {
      left: leftDays * dayWidth + 2,
      width: Math.max(lengthDays * dayWidth - 4, 10),
      backgroundColor: color,
      color: readableTextColor(color),
      range,
      status,
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <CalendarRange className="h-4 w-4 text-primary" /> {t("Timeline")}
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {format(bounds.start, "MMM d, yyyy", { locale })} → {format(bounds.end, "MMM d, yyyy", { locale })} ·{" "}
            {totalDays === 1 ? t("{{count}} day", { count: totalDays }) : t("{{count}} days", { count: totalDays })} ·{" "}
            {ranges.size === 1 ? t("{{count}} dated item", { count: ranges.size }) : t("{{count}} dated items", { count: ranges.size })}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          <span className="flex items-center gap-1 px-1.5 text-[10px] font-semibold text-muted-foreground">
            <ZoomIn className="h-3 w-3" /> {t("Zoom")}
          </span>
          {(Object.keys(zoomMeta) as Zoom[]).map((z) => (
            <Button
              key={z}
              size="sm"
              variant={zoom === z ? "soft" : "ghost"}
              className="h-7 px-2.5 text-[11px]"
              onClick={() => setZoom(z)}
            >
              {t(zoomMeta[z].label)}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <div style={{ minWidth: 280 + timelineWidth }}>
            {/* Timeline header */}
            <div className="flex h-11 border-b border-border bg-muted/40">
              <div className="sticky left-0 z-30 flex w-[280px] shrink-0 items-center border-r border-border bg-muted/90 px-3 text-[11px] font-semibold text-muted-foreground">
                {t("Work item")}
              </div>
              <div className="relative flex" style={{ width: timelineWidth }}>
                {units.map((unit) => (
                  <div
                    key={unit.key}
                    className="flex h-full shrink-0 flex-col items-center justify-center border-r border-border/60 text-[10px] text-muted-foreground last:border-r-0"
                    style={{ width: unit.width }}
                  >
                    <span className="font-semibold leading-none">{unit.label}</span>
                    {unit.sub && <span className="mt-0.5 text-[9px] opacity-60">{unit.sub}</span>}
                  </div>
                ))}
                {showToday && (
                  <div className="pointer-events-none absolute inset-y-0 z-20" style={{ left: todayOffset + dayWidth / 2 }}>
                    <div className="h-full border-l border-dashed border-destructive/70" />
                  </div>
                )}
              </div>
            </div>

            {grouped.map(({ group, items: groupItems }) => (
              <section key={group.id}>
                <div className="flex h-8 border-b border-border/70 bg-muted/20">
                  <div className="sticky left-0 z-20 flex w-[280px] shrink-0 items-center gap-1.5 border-r border-border bg-muted/60 px-3">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: group.color }} />
                    <span className="text-[11px] font-bold" style={{ color: group.color }}>
                      {t(group.title)}
                    </span>
                    <span className="rounded-full bg-background/80 px-1.5 text-[9px] font-semibold text-muted-foreground">
                      {groupItems.length}
                    </span>
                  </div>
                  <div style={{ width: timelineWidth }} />
                </div>

                {groupItems.map((item) => {
                  const style = barStyle(item)
                  const status = itemStatus(board.columns, item.values)
                  const tone = style ? dueTone(format(style.range.end, "yyyy-MM-dd")) : "normal"
                  return (
                    <div key={item.id} className="group flex h-[39px] border-b border-border/50 last:border-b-0">
                      <div className="sticky left-0 z-20 flex w-[280px] shrink-0 items-center gap-2 border-r border-border bg-card px-3 transition-colors group-hover:bg-accent/35">
                        <button
                          onClick={() => onOpenItem(item.id)}
                          className="min-w-0 flex-1 truncate text-left text-[12px] font-medium hover:text-primary"
                          title={item.name}
                        >
                          {item.name}
                        </button>
                        {status && <StatusChip label={status} compact className="max-w-[74px] shrink-0" />}
                      </div>
                      <div className="relative" style={{ width: timelineWidth }}>
                        <div className="pointer-events-none absolute inset-0 flex">
                          {units.map((unit) => (
                            <div key={unit.key} className="h-full shrink-0 border-r border-border/35 last:border-r-0" style={{ width: unit.width }} />
                          ))}
                        </div>
                        {showToday && (
                          <div
                            className="pointer-events-none absolute inset-y-0 z-[1] border-l border-dashed border-destructive/40"
                            style={{ left: todayOffset + dayWidth / 2 }}
                          />
                        )}
                        {style ? (
                          <button
                            onClick={() => onOpenItem(item.id)}
                            className={cn(
                              "absolute top-1/2 z-[2] flex h-[22px] -translate-y-1/2 items-center overflow-hidden rounded-[5px] px-2 text-left text-[10px] font-semibold shadow-sm transition hover:brightness-105 hover:shadow-md",
                              tone === "danger" && "ring-1 ring-destructive/60",
                            )}
                            style={{ left: style.left, width: style.width, backgroundColor: style.backgroundColor, color: style.color }}
                            title={`${item.name} · ${format(style.range.start, "MMM d", { locale })} → ${format(style.range.end, "MMM d, yyyy", { locale })}`}
                          >
                            <span className="truncate">{style.status ? t(style.status.name) : format(style.range.end, "MMM d", { locale })}</span>
                          </button>
                        ) : (
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50">{t("No dates")}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </section>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
          <span>{t("Bar color follows item status · click a bar to open the item")}</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded-sm bg-destructive/70" /> {t("overdue date")}
          </span>
        </div>
      </div>
    </div>
  )
}
