import { useTranslation } from "react-i18next"
import type { Label } from "@/lib/types"
import { cn, readableTextColor } from "@/lib/utils"

export function StatusChip({
  label,
  className,
  compact,
}: {
  label?: Label
  className?: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  if (!label) {
    return (
      <span className={cn("inline-flex items-center rounded text-[11px] text-muted-foreground", className)}>
        {compact ? "" : "—"}
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center justify-center truncate rounded-[4px] px-2 font-semibold leading-5",
        compact ? "text-[10px]" : "text-[11px]",
        className,
      )}
      style={{ backgroundColor: label.color, color: readableTextColor(label.color) }}
      title={label.name}
    >
      <span className="truncate">{t(label.name)}</span>
    </span>
  )
}
