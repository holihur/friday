import { History } from "lucide-react"
import { useTranslation } from "react-i18next"
import { EmptyState } from "@/components/EmptyState"
import { UserAvatar } from "@/components/UserAvatar"
import { formatDateTime, timeAgo } from "@/lib/utils"
import type { Activity } from "@/lib/types"

export function ActivityView({
  activity,
  onOpenItem,
}: {
  activity: Activity[]
  onOpenItem?: (id: string) => void
}) {
  const { t } = useTranslation()
  if (activity.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card">
        <EmptyState icon={History} title={t("No activity yet")} description={t("Create an item or leave a comment and it will show up here.")} />
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="relative space-y-5 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-border">
        {activity.map((act) => (
          <div key={act.id} className="relative flex items-start gap-3">
            <UserAvatar
              name={act.userName}
              color={act.userColor}
              size="md"
              className="relative z-10 ring-4 ring-card"
            />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm leading-snug">
                <span className="font-bold">{act.userName}</span>{" "}
                <span className="text-muted-foreground">{t(act.action)}</span>{" "}
                {act.itemName && (
                  <button
                    onClick={() => act.itemId && onOpenItem?.(act.itemId)}
                    className="font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
                  >
                    “{act.itemName}”
                  </button>
                )}
              </p>
              {act.detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{t("Changed:")} {act.detail.split(", ").map((d) => t(d)).join(", ")}</p>}
              <p className="mt-1 text-[10px] text-muted-foreground" title={formatDateTime(act.createdAt)}>
                {timeAgo(act.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
